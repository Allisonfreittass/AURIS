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
# Groq's free-tier whisper-large-v3-turbo limit is 20 RPM. With partials
# every 1.2s (~50/min) plus finals (~5/min) we'd blow past it. 2.5s caps
# partial-only traffic to ~24 RPM — usually fits with finals on top, and
# 429s are recoverable since the worker just retries on the next tick.
# If you upgrade Groq to Dev Tier you can drop this back to 1.2 for
# snappier captions.
PARTIAL_INTERVAL_SECONDS = 2.5
PARTIAL_WINDOW_SECONDS = 3.0
RING_BUFFER_SECONDS = 60.0
MAX_FINAL_SECONDS = 45.0

ENERGY_GATE_RMS = 0.010
EMPTY_PARTIALS_TO_FORCE_FINAL = 3

# Whisper emits a small set of stock phrases when handed audio with no real
# speech in it — an artifact of the subtitle corpora it was trained on. With
# `--language auto` (which we need, so the translation layer can see the
# detected language) a noise-only window usually gets detected as English and
# comes back as "Thank you.".
#
# These are also things people genuinely say, so matching text alone would eat
# real speech — a client closing a call with "obrigado" is content, not noise.
# The filter therefore only applies below HALLUCINATION_RMS_CEILING: quiet
# enough that a confident full sentence is implausible. Above it we keep
# whatever Whisper returned.
HALLUCINATION_RMS_CEILING = 0.020

HALLUCINATION_ARTIFACTS = frozenset({
    "thank you",
    "thank you very much",
    "thanks for watching",
    "thank you for watching",
    "please subscribe",
    "like and subscribe",
    "you",
    "bye",
    "bye bye",
    "obrigado",
    "obrigada",
    "muito obrigado",
    "gracias",
    "amara org",
    "legendas pela comunidade amara org",
    "legendado pela comunidade amara org",
    "subtitulos por la comunidad de amara org",
})


def _normalize_for_artifact_match(text: str) -> str:
    """Lowercase, drop punctuation, collapse whitespace.

    Whisper varies the punctuation and casing of its artifacts run to run
    ("Thank you." / "thank you" / "Thank you!"), so compare on a flattened
    form. Accents are left alone — "obrigado" and "obrigada" are listed
    separately rather than folded.
    """
    return " ".join(
        "".join(ch for ch in text.lower() if ch.isalnum() or ch.isspace()).split()
    )


def _is_probable_hallucination(text: str, rms: float) -> bool:
    if rms >= HALLUCINATION_RMS_CEILING:
        return False
    return _normalize_for_artifact_match(text) in HALLUCINATION_ARTIFACTS


@dataclass
class _TranscribeRequest:
    audio: np.ndarray
    is_final: bool
    on_result: Callable[[str, Optional[str]], None]
    # Mean RMS of `audio`. Used to decide whether a stock Whisper phrase
    # coming back is real speech or an artifact of near-silence.
    rms: float


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
        on_partial: Callable[[str, Optional[str]], None],
        on_final: Callable[[str, Optional[str]], None],
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

    def _submit_partial(self, on_result: Callable[[str, Optional[str]], None]) -> None:
        if self.segment_start_idx is None:
            return
        all_frames = list(self.ring)
        segment = all_frames[self.segment_start_idx:]
        max_partial_frames = int(PARTIAL_WINDOW_SECONDS * 1000 / FRAME_MS)
        if len(segment) > max_partial_frames:
            segment = segment[-max_partial_frames:]
        self._submit(segment, is_final=False, on_result=on_result)

    def _submit_final(self, on_result: Callable[[str, Optional[str]], None]) -> None:
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
        on_result: Callable[[str, Optional[str]], None],
    ) -> None:
        if not frames:
            return
        min_frames = 25
        if len(frames) < min_frames:
            return
        pcm = b"".join(frames)
        audio_i16 = np.frombuffer(pcm, dtype=np.int16)
        audio_f32 = audio_i16.astype(np.float32) / 32768.0
        segment_rms = float(np.sqrt(np.mean(audio_f32 ** 2)))

        with self._lock:
            if not is_final and self._partial_in_flight:
                return
            if not is_final:
                self._partial_in_flight = True

        try:
            self._req_queue.put_nowait(
                _TranscribeRequest(audio_f32, is_final, on_result, segment_rms)
            )
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
            text = ""
            lang = None
            try:
                result = self.backend.transcribe(req.audio)
                text = result.text
                lang = result.lang
            except Exception as e:
                log(f"backend error: {e}")
            else:
                if text and _is_probable_hallucination(text, req.rms):
                    log(
                        f"dropping probable hallucination {text!r} "
                        f"(segment rms {req.rms:.4f} < {HALLUCINATION_RMS_CEILING})"
                    )
                    text = ""
            finally:
                if not req.is_final:
                    with self._lock:
                        self._partial_in_flight = False

            elapsed = time.time() - t0
            kind = "FINAL" if req.is_final else "partial"
            log(f"transcribe {kind} took {elapsed:.2f}s ({len(req.audio)/SAMPLE_RATE:.1f}s of audio, lang={lang}) → {text!r}")

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
                    req.on_result(text, lang)
                except Exception as e:
                    log(f"on_result callback error: {e}")
