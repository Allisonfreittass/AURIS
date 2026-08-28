"""Auris Python sidecar — entrypoint.

Standalone usage:
    python auris_sidecar.py --diagnose                     # list audio devices
    python auris_sidecar.py                                # local Whisper (default)
    python auris_sidecar.py --proxy-url http://localhost:8787 \
                            --auth-token <jwt-or-dev-token>  # remote Whisper

Output protocol (stdout, one JSON object per line):
    {"type": "ready", "ts": ..., "model": "...", "source": "...", "backend": "...",
     "channels": ["mic", "loopback"]}
    {"type": "transcript", "text": "...", "final": true|false, "ts": ...,
     "channel": "mic"|"loopback"|"mixed"}

`channel` says which stream the text came from, NOT who spoke. The mapping
to speaker ("mic" = whoever runs Auris) is a product decision and belongs to
the main process, not here.
    {"type": "error", "code": "...", "message": "...", "ts": ...}

Input protocol (stdin, one JSON object per line — used for live token rotation):
    {"type": "set_token", "token": "..."}
"""
import argparse
import json
import queue
import signal
import sys
import threading
from dataclasses import dataclass
from typing import List

from audio import AudioCapture, FRAME_BYTES, list_devices_for_diagnostics
from protocol import emit, emit_error, log
from transcribe import StreamingTranscriber
from whisper_backends import LocalBackend, RemoteBackend, WhisperBackend

EXIT_OK = 0
EXIT_AUDIO_PERMISSION = 2
EXIT_RUNTIME = 3


class _TokenStore:
    """Thread-safe holder for the proxy auth token, updated from stdin."""

    def __init__(self, initial: str | None):
        self._token = initial
        self._lock = threading.Lock()

    def get(self) -> str | None:
        with self._lock:
            return self._token

    def set(self, token: str) -> None:
        with self._lock:
            self._token = token


def _stdin_listener(token_store: _TokenStore, stop_event: threading.Event) -> None:
    """Read newline-delimited JSON from stdin and update the token store."""
    try:
        for raw in sys.stdin:
            if stop_event.is_set():
                return
            line = raw.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                log(f"ignoring non-JSON stdin line: {line[:80]}")
                continue
            mtype = msg.get("type")
            if mtype == "set_token":
                tok = msg.get("token", "")
                if isinstance(tok, str) and tok:
                    token_store.set(tok)
                    log("auth token rotated via stdin")
            elif mtype == "shutdown":
                stop_event.set()
                return
    except Exception as e:
        # stdin pipe closed or other read error — main process is gone.
        log(f"stdin listener exited: {e}")


def _build_backend(args: argparse.Namespace, token_store: _TokenStore) -> WhisperBackend:
    lang = None if args.language == "auto" else args.language
    if args.proxy_url and token_store.get():
        return RemoteBackend(args.proxy_url, token_store.get, lang)
    return LocalBackend(args.model, lang)


@dataclass
class _Channel:
    """One independent capture → transcribe pipeline.

    In `dual` mode there are two of these running side by side, each with its
    own AudioCapture, its own queue, its own VAD state machine and its own
    Whisper backend instance. Sharing a backend would serialize the two
    channels behind RemoteBackend's request lock.
    """
    name: str
    capture: AudioCapture
    frames: "queue.Queue[bytes]"
    transcriber: StreamingTranscriber


def _channel_sources(source: str) -> List[tuple]:
    """(channel name, AudioCapture source) pairs for a given --source."""
    if source == "dual":
        return [("mic", "mic"), ("loopback", "loopback")]
    if source == "both":
        return [("mixed", "both")]
    return [(source, source)]


def _pump(ch: _Channel, stop_event: threading.Event) -> None:
    """Drain one channel's frames into its transcriber until told to stop."""
    def on_partial(text, lang):
        emit("transcript", text=text, final=False, lang=lang, channel=ch.name)

    def on_final(text, lang):
        emit("transcript", text=text, final=True, lang=lang, channel=ch.name)

    while not stop_event.is_set():
        try:
            frame = ch.frames.get(timeout=0.5)
        except queue.Empty:
            continue
        if len(frame) != FRAME_BYTES:
            continue
        try:
            ch.transcriber.push(frame, on_partial=on_partial, on_final=on_final)
        except Exception as e:
            log(f"[{ch.name}] push failed: {e}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Auris transcription sidecar")
    parser.add_argument("--model", default="tiny",
                        help="faster-whisper model size for local backend")
    parser.add_argument("--language", default="auto",
                        help="Whisper language code (e.g. 'pt', 'en'); 'auto' for "
                             "auto-detect (default). Forcing a wrong language causes "
                             "Whisper to phonetically distort foreign speech — keep "
                             "'auto' and let the main process translate to the user's "
                             "preferred display language after.")
    parser.add_argument("--source", default="loopback",
                        choices=["loopback", "mic", "both", "dual"],
                        help="audio source. 'dual' captures mic and loopback as "
                             "two independent streams, each transcribed on its own "
                             "and tagged with `channel` — that is what gives speaker "
                             "attribution without diarization. 'both' mixes them into "
                             "one stream and loses that.")
    parser.add_argument("--proxy-url", default=None,
                        help="when set, route Whisper through the Auris proxy "
                             "(e.g., http://localhost:8787) instead of local")
    parser.add_argument("--auth-token", default=None,
                        help="initial proxy auth token; can be rotated via "
                             "stdin {\"type\":\"set_token\",\"token\":\"...\"}")
    parser.add_argument("--diagnose", action="store_true",
                        help="List audio devices to stderr and exit")
    args = parser.parse_args()

    if args.diagnose:
        list_devices_for_diagnostics()
        return EXIT_OK

    token_store = _TokenStore(args.auth_token)
    stop_event = threading.Event()

    # stdin listener for live token updates (only meaningful in remote mode,
    # but harmless in local mode).
    threading.Thread(
        target=_stdin_listener,
        args=(token_store, stop_event),
        daemon=True,
        name="stdin-listener",
    ).start()

    specs = _channel_sources(args.source)

    if args.source == "dual" and not args.proxy_url:
        # Two LocalBackends means two Whisper models resident on the CPU.
        # Remote mode has no such cost — each channel just gets its own
        # HTTP session.
        log("warning: dual mode on the local backend loads one Whisper model "
            "per channel; prefer --proxy-url for dual")

    def shutdown(*_):
        log("shutdown signal received")
        stop_event.set()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    channels: List[_Channel] = []
    backend_name = "?"

    def teardown() -> None:
        for ch in channels:
            try:
                ch.capture.stop()
            except Exception as e:
                log(f"[{ch.name}] capture stop failed: {e}")
            try:
                ch.transcriber.stop()
            except Exception as e:
                log(f"[{ch.name}] transcriber stop failed: {e}")

    for name, cap_source in specs:
        frames: "queue.Queue[bytes]" = queue.Queue(maxsize=400)
        capture = AudioCapture(frames, source=cap_source)
        try:
            capture.start()
        except Exception as e:
            log(f"[{name}] failed to start audio capture: {e}")
            teardown()
            return EXIT_AUDIO_PERMISSION

        try:
            backend = _build_backend(args, token_store)
        except Exception as e:
            emit_error("backend_init_failed", f"Falha ao iniciar backend Whisper: {e}")
            capture.stop()
            teardown()
            return EXIT_RUNTIME

        backend_name = backend.__class__.__name__
        transcriber = StreamingTranscriber(backend)
        transcriber.warmup()
        channels.append(_Channel(name=name, capture=capture, frames=frames,
                                 transcriber=transcriber))

    names = [ch.name for ch in channels]
    emit("ready", model=args.model, source=args.source, backend=backend_name,
         channels=names)
    log(f"ready — streaming transcripts (source={args.source}, "
        f"channels={names}, backend={backend_name})")

    pumps = [
        threading.Thread(target=_pump, args=(ch, stop_event), daemon=True,
                         name=f"pump-{ch.name}")
        for ch in channels
    ]
    for t in pumps:
        t.start()

    try:
        while not stop_event.is_set():
            # Pumps do the work; this thread just waits for the stop signal so
            # SIGINT/SIGTERM still land on the main thread.
            stop_event.wait(0.5)
    except KeyboardInterrupt:
        pass
    except Exception as e:
        emit_error("runtime_error", f"Erro inesperado no loop principal: {e}")
        return EXIT_RUNTIME
    finally:
        stop_event.set()
        log("stopping audio capture")
        for t in pumps:
            t.join(timeout=1.5)
        teardown()
        emit("stopped")

    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
