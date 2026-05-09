"""Pluggable Whisper backends.

Two implementations share the same `transcribe(audio_f32) -> str` signature:

  - `LocalBackend`: faster-whisper running on CPU (int8). Privacy-friendly,
    no network, but slow on weak CPUs (~50% real-time on the `tiny` model).
  - `RemoteBackend`: Groq's hosted Whisper-large-v3-turbo, called via the
    Auris proxy worker. Roughly 10× faster end-to-end and more accurate.

The sidecar picks one based on CLI args; the streaming state machine in
`transcribe.py` stays identical either way.
"""
import io
import threading
import wave
from abc import ABC, abstractmethod
from typing import Callable, Optional

import numpy as np
import requests

from protocol import log

SAMPLE_RATE = 16000

# Whisper guardrails carried over from local backend.
NO_SPEECH_THRESHOLD = 0.6
LOG_PROB_THRESHOLD = -1.0
COMPRESSION_RATIO_THRESHOLD = 2.4
TEMPERATURE_FALLBACK = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]


class WhisperBackend(ABC):
    @abstractmethod
    def transcribe(self, audio_f32: np.ndarray) -> str:
        ...

    def warmup(self) -> None:
        """Optional warmup hook called once at sidecar startup."""
        return


class LocalBackend(WhisperBackend):
    """faster-whisper on CPU. Loads the model lazily on construction.

    The faster_whisper import is intentionally *lazy* (inside __init__) so
    that production builds excluding the package don't crash at module load
    time. If the production sidecar.exe is invoked without a proxy URL, we
    surface a clear error here instead of an opaque ImportError at startup.
    """

    def __init__(self, model_size: str, language: Optional[str]):
        try:
            from faster_whisper import WhisperModel  # noqa: WPS433 (intentional lazy import)
        except ImportError as e:
            raise RuntimeError(
                "Whisper local não está disponível neste build. "
                "Configure --proxy-url e --auth-token para usar o backend remoto."
            ) from e

        log(f"loading faster-whisper model: {model_size} (cpu, int8); language={language!r}")
        self.model = WhisperModel(model_size, device="cpu", compute_type="int8")
        self.language = language

    def warmup(self) -> None:
        log("warming up local whisper...")
        silence = np.zeros(SAMPLE_RATE, dtype=np.float32)
        try:
            self.transcribe(silence)
            log("warmup complete")
        except Exception as e:
            log(f"warmup failed (non-fatal): {e}")

    def transcribe(self, audio_f32: np.ndarray) -> str:
        segments, _info = self.model.transcribe(
            audio_f32,
            language=self.language,
            beam_size=1,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            condition_on_previous_text=False,
            temperature=TEMPERATURE_FALLBACK,
            no_speech_threshold=NO_SPEECH_THRESHOLD,
            log_prob_threshold=LOG_PROB_THRESHOLD,
            compression_ratio_threshold=COMPRESSION_RATIO_THRESHOLD,
        )
        parts = []
        for seg in segments:
            if seg.no_speech_prob is not None and seg.no_speech_prob > NO_SPEECH_THRESHOLD:
                continue
            text = seg.text.strip()
            if text:
                parts.append(text)
        return " ".join(parts).strip()


class RemoteBackend(WhisperBackend):
    """Groq hosted Whisper via the Auris proxy.

    The token is fetched fresh on each call via `get_token()` so that
    Supabase access-token refreshes are picked up automatically.
    """

    GROQ_MODEL = "whisper-large-v3-turbo"

    def __init__(
        self,
        proxy_url: str,
        get_token: Callable[[], Optional[str]],
        language: Optional[str],
    ):
        self.endpoint = f"{proxy_url.rstrip('/')}/openai/v1/audio/transcriptions"
        self.get_token = get_token
        self.language = language
        self._lock = threading.Lock()
        self._session = requests.Session()
        log(f"remote whisper backend: POST → {self.endpoint}")

    def warmup(self) -> None:
        # Nothing to warm up — first request pays its own ~200ms TLS handshake,
        # which is in the same order as a single local CPU partial anyway.
        return

    def transcribe(self, audio_f32: np.ndarray) -> str:
        token = self.get_token()
        if not token:
            raise RuntimeError("no auth token available for remote whisper")

        wav = _encode_wav(audio_f32)

        files = {"file": ("audio.wav", wav, "audio/wav")}
        data = {
            "model": self.GROQ_MODEL,
            "response_format": "json",
            "temperature": "0",
        }
        if self.language:
            data["language"] = self.language

        # The session lock serializes outbound HTTP — the streaming
        # transcriber already has its own worker thread, so this just
        # keeps the requests.Session usage single-threaded internally.
        with self._lock:
            try:
                resp = self._session.post(
                    self.endpoint,
                    headers={"Authorization": f"Bearer {token}"},
                    files=files,
                    data=data,
                    timeout=20,
                )
            except requests.RequestException as e:
                raise RuntimeError(f"network error talking to proxy: {e}") from e

        if resp.status_code == 401:
            raise RuntimeError(f"proxy rejected token (401) at {self.endpoint} — session may have expired")
        if resp.status_code >= 400:
            snippet = resp.text[:300] if resp.text else "(empty body)"
            raise RuntimeError(f"proxy returned {resp.status_code} from {self.endpoint} :: {snippet}")

        try:
            payload = resp.json()
        except ValueError as e:
            raise RuntimeError(f"proxy returned non-JSON body: {e}") from e

        text = (payload.get("text") or "").strip()
        return text


def _encode_wav(audio_f32: np.ndarray, sample_rate: int = SAMPLE_RATE) -> bytes:
    """In-memory WAV encoder for a mono float32 array in [-1, 1]."""
    pcm_i16 = (np.clip(audio_f32, -1.0, 1.0) * 32767.0).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_i16.tobytes())
    return buf.getvalue()
