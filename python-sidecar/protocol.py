"""JSON-line protocol for stdout communication with the Electron main process.

Every message is a single JSON object on its own line, flushed immediately.
The receiving side reads stdout line-by-line and parses each line as JSON.
"""
import json
import sys
import time


def _force_utf8() -> None:
    """Pin stdout/stderr to UTF-8.

    The main process decodes both pipes as UTF-8. On Windows a piped
    `sys.stdout` defaults to the ANSI codepage (cp1252) instead, so an
    accented character like "á" goes out as the single byte 0xE1 — not
    valid UTF-8 — and the receiving side renders U+FFFD. Every accent in
    the transcript was being mangled that way.

    Guarded because a stream may be None (PyInstaller windowed mode with no
    console) or already replaced by something without `reconfigure`.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="replace")


_force_utf8()


def emit(event_type: str, **fields) -> None:
    payload = {"type": event_type, "ts": time.time(), **fields}
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def emit_error(code: str, message: str, **extra) -> None:
    emit("error", code=code, message=message, **extra)


def log(message: str) -> None:
    sys.stderr.write(f"[sidecar] {message}\n")
    sys.stderr.flush()
