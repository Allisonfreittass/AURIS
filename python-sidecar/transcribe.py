"""Streaming transcriber with VAD-based segmentation.

Architecture:
  - Main thread (caller of `push`): pulls 20ms PCM frames, runs cheap VAD +
    RMS gate, maintains the ring buffer, decides when to trigger a partial
    or final transcription. Never blocks on the Whisper backend.
  - Worker thread: pulls transcription requests off a queue, calls
    backend.transcribe(audio_f32), invokes the callback with the result.

The actual Whisper call is delegated to a `WhisperBackend` (see
`whisper_backends.py`) — local faster-whisper or remote Groq.
"""
import collections
import queue
import threading
import time
from dataclasses import dataclass
from typing import Callable, Deque, Optional

import numpy as np
import webrtcvad

from protocol import log
from whisper_backends import WhisperBackend

SAMPLE_RATE = 16000
FRAME_MS = 20
FRAME_SAMPLES = SAMPLE_RATE * FRAME_MS // 1000  # 320
FRAME_BYTES = FRAME_SAMPLES * 2  # int16 mono

# State-machine thresholds (in 20ms frames).
SILENCE_FRAMES_TO_FINALIZE = 25   # 500ms
PARTIAL_INTERVAL_SECONDS = 1.2
PARTIAL_WINDOW_SECONDS = 3.0
RING_BUFFER_SECONDS = 60.0
MAX_FINAL_SECONDS = 45.0

ENERGY_GATE_RMS = 0.010
EMPTY_PARTIALS_TO_FORCE_FINAL = 3


@dataclass
class _TranscribeRequest:
    audio: np.ndarray
    is_final: bool
    on_result: Callable[[str], None]


class StreamingTranscriber:
    def __init__(self, backend: WhisperBackend):
        self.backend = backend
        self.vad = webrtcvad.Vad(3)

        max_frames = int(RING_BUFFER_SECONDS * 1000 / FRAME_MS)
        self.ring: Deque[bytes] = collections.deque(maxlen=max_frames)
        self.in_speech = False
        self.silence_frames = 0
        self.last_partial = 0.0
        self.last_partial_text = ""
        self.segment_start_idx: Optional[int] = None
        self.empty_partial_streak = 0

        self._req_queue: "queue.Queue[Optional[_TranscribeRequest]]" = queue.Queue(maxsize=4)
        self._partial_in_flight = False
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._worker = threading.Thread(target=self._worker_loop, daemon=True, name="whisper-worker")
        self._worker.start()

    def warmup(self) -> None:
        self.backend.warmup()

    def stop(self) -> None:
        self._stop.set()
        try:
            self._req_queue.put_nowait(None)
        except queue.Full:
            pass
        self._worker.join(timeout=2.0)

    def push(
        self,
        pcm_frame: bytes,
        on_partial: Callable[[str], None],
        on_final: Callable[[str], None],
    ) -> None:
        if len(pcm_frame) != FRAME_BYTES:
            return

        audio_i16 = np.frombuffer(pcm_frame, dtype=np.int16)
        rms = float(np.sqrt(np.mean((audio_i16.astype(np.float32) / 32768.0) ** 2)))
        loud_enough = rms >= ENERGY_GATE_RMS

        try:
            is_speech = loud_enough and self.vad.is_speech(pcm_frame, SAMPLE_RATE)
        except Exception as e:
            log(f"VAD error: {e}")
            return

        self.ring.append(pcm_frame)

        if is_speech:
            if not self.in_speech:
                self.segment_start_idx = len(self.ring) - 1
            self.in_speech = True
            self.silence_frames = 0
        elif self.in_speech:
            self.silence_frames += 1

        now = time.time()

        if self.in_speech and (now - self.last_partial) > PARTIAL_INTERVAL_SECONDS:
            self._submit_partial(on_partial)
            self.last_partial = now

        with self._lock:
            empty_streak = self.empty_partial_streak

        normal_finalize = self.in_speech and self.silence_frames >= SILENCE_FRAMES_TO_FINALIZE
        forced_finalize = self.in_speech and empty_streak >= EMPTY_PARTIALS_TO_FORCE_FINAL

        if normal_finalize:
            self._submit_final(on_final)
            self._reset_segment_state()
        elif forced_finalize:
            log(f"force-finalize after {empty_streak} empty partials (likely ambient noise)")
            self._reset_segment_state()

    def _reset_segment_state(self) -> None:
        self.in_speech = False
        self.silence_frames = 0
        self.last_partial_text = ""
        self.segment_start_idx = None
        with self._lock:
            self.empty_partial_streak = 0
        self.ring.clear()

    def _submit_partial(self, on_result: Callable[[str], None]) -> None:
        if self.segment_start_idx is None:
            return
        all_frames = list(self.ring)
        segment = all_frames[self.segment_start_idx:]
        max_partial_frames = int(PARTIAL_WINDOW_SECONDS * 1000 / FRAME_MS)
        if len(segment) > max_partial_frames:
            segment = segment[-max_partial_frames:]
        self._submit(segment, is_final=False, on_result=on_result)

    def _submit_final(self, on_result: Callable[[str], None]) -> None:
        if self.segment_start_idx is None:
            return
        all_frames = list(self.ring)
        segment = all_frames[self.segment_start_idx:]
        max_final_frames = int(MAX_FINAL_SECONDS * 1000 / FRAME_MS)
        if len(segment) > max_final_frames:
            segment = segment[-max_final_frames:]
        self._submit(segment, is_final=True, on_result=on_result)

    def _submit(
        self,
        frames: list,
        is_final: bool,
        on_result: Callable[[str], None],
    ) -> None:
        if not frames:
            return
        min_frames = 25
        if len(frames) < min_frames:
            return
        pcm = b"".join(frames)
        audio_i16 = np.frombuffer(pcm, dtype=np.int16)
        audio_f32 = audio_i16.astype(np.float32) / 32768.0

        with self._lock:
            if not is_final and self._partial_in_flight:
                return
            if not is_final:
                self._partial_in_flight = True

        try:
            self._req_queue.put_nowait(_TranscribeRequest(audio_f32, is_final, on_result))
        except queue.Full:
            with self._lock:
                if not is_final:
                    self._partial_in_flight = False
            log("transcribe queue full — dropping request")

    def _worker_loop(self) -> None:
        while not self._stop.is_set():
            try:
                req = self._req_queue.get(timeout=0.5)
            except queue.Empty:
                continue
            if req is None:
                break

            t0 = time.time()
            try:
                text = self.backend.transcribe(req.audio)
            except Exception as e:
                log(f"backend error: {e}")
                text = ""
            finally:
                if not req.is_final:
                    with self._lock:
                        self._partial_in_flight = False

            elapsed = time.time() - t0
            kind = "FINAL" if req.is_final else "partial"
            log(f"transcribe {kind} took {elapsed:.2f}s ({len(req.audio)/SAMPLE_RATE:.1f}s of audio) → {text!r}")

            if not req.is_final:
                with self._lock:
                    if text:
                        self.empty_partial_streak = 0
                    else:
                        self.empty_partial_streak += 1

            if text:
                if not req.is_final:
                    if text == self.last_partial_text:
                        continue
                    self.last_partial_text = text
                try:
                    req.on_result(text)
                except Exception as e:
                    log(f"on_result callback error: {e}")
