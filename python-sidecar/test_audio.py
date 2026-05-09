"""Standalone audio smoke test: captures ~3s and prints RMS levels.

Confirms that both mic and WASAPI loopback streams are producing data
before we invest in loading the Whisper model.

Usage:
    python test_audio.py
"""
import queue
import sys
import time

import numpy as np

from audio import AudioCapture, FRAME_BYTES, FRAME_SAMPLES


def main() -> int:
    pcm_queue: "queue.Queue[bytes]" = queue.Queue(maxsize=400)
    capture = AudioCapture(pcm_queue)

    print("opening streams...", file=sys.stderr)
    try:
        capture.start()
    except Exception as e:
        print(f"FAILED to start audio capture: {e}", file=sys.stderr)
        return 1

    print("capturing for 3 seconds — talk and/or play system audio NOW", file=sys.stderr)
    deadline = time.time() + 3.0
    rms_samples = []
    frames = 0

    while time.time() < deadline:
        try:
            frame = pcm_queue.get(timeout=0.5)
        except queue.Empty:
            continue
        frames += 1
        audio_i16 = np.frombuffer(frame, dtype=np.int16).astype(np.float32) / 32768.0
        rms = float(np.sqrt(np.mean(audio_i16 ** 2)))
        rms_samples.append(rms)

    capture.stop()

    if not rms_samples:
        print("ERROR: no audio frames received in 3s", file=sys.stderr)
        return 2

    avg_rms = sum(rms_samples) / len(rms_samples)
    peak_rms = max(rms_samples)
    expected_frames = int(3.0 * 1000 / 20)

    print(f"frames received: {frames} (expected ~{expected_frames})", file=sys.stderr)
    print(f"avg RMS: {avg_rms:.4f}", file=sys.stderr)
    print(f"peak RMS: {peak_rms:.4f}", file=sys.stderr)
    print(f"silent? {peak_rms < 0.001}", file=sys.stderr)

    if frames < expected_frames * 0.5:
        print("WARNING: received much fewer frames than expected — capture may be unstable", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
