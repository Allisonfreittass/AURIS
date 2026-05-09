"""JSON-line protocol for stdout communication with the Electron main process.

Every message is a single JSON object on its own line, flushed immediately.
The receiving side reads stdout line-by-line and parses each line as JSON.
"""
import json
import sys
import time


def emit(event_type: str, **fields) -> None:
    payload = {"type": event_type, "ts": time.time(), **fields}
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def emit_error(code: str, message: str, **extra) -> None:
    emit("error", code=code, message=message, **extra)


def log(message: str) -> None:
    sys.stderr.write(f"[sidecar] {message}\n")
    sys.stderr.flush()
