"""Audio capture for Auris.

Three modes:
  - "loopback" (default): only the system audio output (WASAPI loopback on
    Windows, the PulseAudio/PipeWire ".monitor" source on Linux).
    Cleanest input — perfect for transcribing videos, podcasts, calls.
  - "mic": only the microphone (speaking to Auris like a voice assistant).
    Lower quality, more noise. Marked beta in the UI.
  - "both": legacy mode that mixes mic + loopback. Kept for completeness;
    not exposed in the UI right now.

In all modes we emit 20ms (320-sample) int16 mono PCM frames at 16kHz onto
the output queue.
"""
import queue
import sys
import threading
import warnings
from typing import Optional

import numpy as np
import soundcard as sc

from protocol import emit_error, log

# `SoundcardRuntimeWarning` is defined by the Media Foundation backend only —
# soundcard picks its backend per OS, and the PulseAudio/CoreAudio ones don't
# export it. The module file ships on every platform, so off-Windows this is
# not a clean ImportError: `mediafoundation` runs `_ffi.cdef()` over Windows
# headers at import time and dies with `cffi.CDefError`. Catch broadly — the
# only thing riding on it is a cosmetic warning filter.
try:
    from soundcard.mediafoundation import SoundcardRuntimeWarning
except Exception:
    SoundcardRuntimeWarning = None

# soundcard emits "data discontinuity" warnings constantly while idle on Windows;
# they are not actionable and would otherwise flood stderr.
if SoundcardRuntimeWarning is not None:
    warnings.filterwarnings("ignore", category=SoundcardRuntimeWarning)

SAMPLE_RATE = 16000
FRAME_MS = 20
FRAME_SAMPLES = SAMPLE_RATE * FRAME_MS // 1000  # 320
FRAME_BYTES = FRAME_SAMPLES * 2                 # int16 mono

VALID_SOURCES = ("loopback", "mic", "both")

IS_WINDOWS = sys.platform == "win32"


def _no_loopback_hint() -> str:
    if IS_WINDOWS:
        return ("Nenhum dispositivo de loopback (WASAPI) encontrado para o "
                "speaker padrao. Verifique se ha um dispositivo de saida ativo.")
    return ("Nenhum monitor de saida encontrado para o speaker padrao. "
            "Confira se o PulseAudio/PipeWire esta rodando (`pactl info`) e se "
            "o sink padrao expoe uma fonte `.monitor` (`pactl list short sources`).")


def _permission_hint(label: str) -> str:
    if IS_WINDOWS:
        return (f"Permissao de audio negada para {label}. "
                "Habilite-o em Configuracoes do Windows -> Privacidade.")
    return (f"Permissao de audio negada para {label}. "
            "Verifique se o usuario tem acesso ao servidor de audio "
            "(grupo `audio`) e se o Flatpak/snap nao esta bloqueando a captura.")


def list_devices_for_diagnostics() -> None:
    sys.stderr.write("=== soundcard speakers ===\n")
    for sp in sc.all_speakers():
        sys.stderr.write(f"  {sp.name}  (channels={sp.channels})\n")
    sys.stderr.write(f"  >> default: {sc.default_speaker().name}\n")

    sys.stderr.write("\n=== soundcard microphones (incl. loopback) ===\n")
    for mic in sc.all_microphones(include_loopback=True):
        tag = " [LOOPBACK]" if mic.isloopback else ""
        sys.stderr.write(f"  {mic.name}{tag}  (channels={mic.channels})\n")
    sys.stderr.write(f"  >> default: {sc.default_microphone().name}\n")
    sys.stderr.flush()


def _to_mono_float32(block: np.ndarray) -> np.ndarray:
    if block.ndim == 1:
        return block.astype(np.float32, copy=False)
    if block.shape[1] == 1:
        return block[:, 0].astype(np.float32, copy=False)
    return block.mean(axis=1).astype(np.float32, copy=False)


def _resolve_loopback_mic():
    """Find the loopback capture device that mirrors the default output.

    The two backends shape ids differently:
      - WASAPI (Windows) exposes the loopback under the *same* id as the speaker.
      - PulseAudio/PipeWire (Linux) exposes a separate source whose id is the
        sink id plus a ".monitor" suffix.

    An exact match therefore never hits on Linux, and the old "first loopback
    found" fallback silently grabs whichever monitor the server happens to list
    first — on a machine with more than one sound card that is usually the wrong
    one. Try both shapes before falling back.
    """
    default_speaker_id = sc.default_speaker().id
    loopbacks = [m for m in sc.all_microphones(include_loopback=True) if m.isloopback]

    for mic in loopbacks:
        if mic.id == default_speaker_id:
            return mic
    for mic in loopbacks:
        if mic.id == f"{default_speaker_id}.monitor":
            return mic
    return loopbacks[0] if loopbacks else None


class AudioCapture:
    """Captures from the configured source(s) and feeds 20ms PCM frames to `out_queue`."""

    def __init__(self, out_queue: "queue.Queue[bytes]", source: str = "loopback"):
        if source not in VALID_SOURCES:
            raise ValueError(f"invalid source {source!r}, expected one of {VALID_SOURCES}")
        self.source = source
        self.out_queue = out_queue
        self._stop = threading.Event()
        self._mic_thread: Optional[threading.Thread] = None
        self._loop_thread: Optional[threading.Thread] = None
        self._mixer_thread: Optional[threading.Thread] = None
        # Per-source queues used only when both streams are active. Single-source
        # modes write directly to `out_queue`.
        self._mic_q: "queue.Queue[np.ndarray]" = queue.Queue(maxsize=200)
        self._loop_q: "queue.Queue[np.ndarray]" = queue.Queue(maxsize=200)

    def _record_into_output(
        self,
        recorder_factory,
        label: str,
    ) -> None:
        """Single-source path: record 20ms blocks straight into `self.out_queue`."""
        try:
            with recorder_factory() as recorder:
                while not self._stop.is_set():
                    block = recorder.record(numframes=FRAME_SAMPLES)
                    if block is None or len(block) == 0:
                        continue
                    mono = _to_mono_float32(block)
                    pcm = (np.clip(mono, -1.0, 1.0) * 32767.0).astype(np.int16).tobytes()
                    try:
                        self.out_queue.put_nowait(pcm)
                    except queue.Full:
                        try:
                            self.out_queue.get_nowait()
                        except queue.Empty:
                            pass
                        self.out_queue.put_nowait(pcm)
        except Exception as e:
            self._handle_recorder_error(label, e)

    def _record_into_queue(
        self,
        recorder_factory,
        label: str,
        q_out: "queue.Queue[np.ndarray]",
    ) -> None:
        """Both-source path: record 20ms blocks into a per-source queue (mixer drains them)."""
        try:
            with recorder_factory() as recorder:
                while not self._stop.is_set():
                    block = recorder.record(numframes=FRAME_SAMPLES)
                    if block is None or len(block) == 0:
                        continue
                    mono = _to_mono_float32(block)
                    try:
                        q_out.put_nowait(mono)
                    except queue.Full:
                        try:
                            q_out.get_nowait()
                        except queue.Empty:
                            pass
                        q_out.put_nowait(mono)
        except Exception as e:
            self._handle_recorder_error(label, e)

    def _handle_recorder_error(self, label: str, e: Exception) -> None:
        log(f"{label} recorder crashed: {e}")
        if "denied" in str(e).lower() or "permission" in str(e).lower():
            emit_error("audio_permission", _permission_hint(label))
        else:
            emit_error(f"{label}_failed", f"Falha em {label}: {e}")
        self._stop.set()

    def _mixer(self) -> None:
        """Sum mic+loopback, clip, push downstream. Used only in `both` mode."""
        while not self._stop.is_set():
            try:
                mic = self._mic_q.get(timeout=0.5)
            except queue.Empty:
                continue
            try:
                loop = self._loop_q.get(timeout=0.5)
            except queue.Empty:
                loop = np.zeros_like(mic)

            n = min(len(mic), len(loop), FRAME_SAMPLES)
            mixed = mic[:n] + loop[:n]
            if n < FRAME_SAMPLES:
                mixed = np.pad(mixed, (0, FRAME_SAMPLES - n))
            pcm = (np.clip(mixed, -1.0, 1.0) * 32767.0).astype(np.int16).tobytes()
            try:
                self.out_queue.put_nowait(pcm)
            except queue.Full:
                try:
                    self.out_queue.get_nowait()
                except queue.Empty:
                    pass
                self.out_queue.put_nowait(pcm)

    def start(self) -> None:
        log(f"audio source: {self.source}")

        if self.source in ("loopback", "both"):
            loopback_mic = _resolve_loopback_mic()
            if loopback_mic is None:
                emit_error("no_loopback", _no_loopback_hint())
                raise RuntimeError("no loopback device")
            log(f"loopback: {loopback_mic.name}")
            loop_factory = lambda: loopback_mic.recorder(
                samplerate=SAMPLE_RATE, channels=1, blocksize=FRAME_SAMPLES,
            )
        else:
            loop_factory = None

        if self.source in ("mic", "both"):
            real_mic = sc.default_microphone()
            log(f"mic: {real_mic.name}")
            mic_factory = lambda: real_mic.recorder(
                samplerate=SAMPLE_RATE, channels=1, blocksize=FRAME_SAMPLES,
            )
        else:
            mic_factory = None

        if self.source == "loopback":
            self._loop_thread = threading.Thread(
                target=self._record_into_output, args=(loop_factory, "loopback"),
                daemon=True, name="audio-loop",
            )
            self._loop_thread.start()
        elif self.source == "mic":
            self._mic_thread = threading.Thread(
                target=self._record_into_output, args=(mic_factory, "microfone"),
                daemon=True, name="audio-mic",
            )
            self._mic_thread.start()
        else:  # both
            self._mic_thread = threading.Thread(
                target=self._record_into_queue,
                args=(mic_factory, "microfone", self._mic_q),
                daemon=True, name="audio-mic",
            )
            self._loop_thread = threading.Thread(
                target=self._record_into_queue,
                args=(loop_factory, "loopback", self._loop_q),
                daemon=True, name="audio-loop",
            )
            self._mixer_thread = threading.Thread(
                target=self._mixer, daemon=True, name="audio-mixer",
            )
            self._mic_thread.start()
            self._loop_thread.start()
            self._mixer_thread.start()

    def stop(self) -> None:
        self._stop.set()
        for t in (self._mic_thread, self._loop_thread, self._mixer_thread):
            if t is not None:
                t.join(timeout=1.5)
