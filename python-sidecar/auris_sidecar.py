"""Auris Python sidecar — entrypoint.

Standalone usage:
    python auris_sidecar.py --diagnose                     # list audio devices
    python auris_sidecar.py                                # local Whisper (default)
    python auris_sidecar.py --proxy-url http://localhost:8787 \
                            --auth-token <jwt-or-dev-token>  # remote Whisper

Output protocol (stdout, one JSON object per line):
    {"type": "ready", "ts": ..., "model": "...", "source": "...", "backend": "..."}
    {"type": "transcript", "text": "...", "final": true|false, "ts": ...}
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
                        choices=["loopback", "mic", "both"],
                        help="audio source")
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

    pcm_queue: "queue.Queue[bytes]" = queue.Queue(maxsize=400)
    capture = AudioCapture(pcm_queue, source=args.source)

    def shutdown(*_):
        log("shutdown signal received")
        stop_event.set()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        capture.start()
    except Exception as e:
        log(f"failed to start audio capture: {e}")
        return EXIT_AUDIO_PERMISSION

    try:
        backend = _build_backend(args, token_store)
    except Exception as e:
        emit_error("backend_init_failed", f"Falha ao iniciar backend Whisper: {e}")
        capture.stop()
        return EXIT_RUNTIME

    transcriber = StreamingTranscriber(backend)
    backend_name = backend.__class__.__name__
    transcriber.warmup()

    emit("ready", model=args.model, source=args.source, backend=backend_name)
    log(f"ready — streaming transcripts (source={args.source}, backend={backend_name})")

    try:
        while not stop_event.is_set():
            try:
                frame = pcm_queue.get(timeout=0.5)
            except queue.Empty:
                continue
            if len(frame) != FRAME_BYTES:
                continue
            transcriber.push(
                frame,
                on_partial=lambda text, lang: emit("transcript", text=text, final=False, lang=lang),
                on_final=lambda text, lang: emit("transcript", text=text, final=True, lang=lang),
            )
    except KeyboardInterrupt:
        pass
    except Exception as e:
        emit_error("runtime_error", f"Erro inesperado no loop principal: {e}")
        return EXIT_RUNTIME
    finally:
        log("stopping audio capture")
        capture.stop()
        try:
            transcriber.stop()
        except Exception:
            pass
        emit("stopped")

    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
