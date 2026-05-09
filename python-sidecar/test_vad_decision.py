"""Diagnose VAD + energy-gate decisions on the live mic+loopback mix.

Captures for ~10s, prints per-second:
  total frames | RMS-pass count | VAD-pass count | both-pass count | mean RMS
"""
import queue
import sys
import time

import numpy as np
import webrtcvad

from audio import AudioCapture, FRAME_BYTES

SR = 16000
ENERGY_GATE = 0.005   # very permissive for diagnostic


def main() -> int:
    pcm_q: "queue.Queue[bytes]" = queue.Queue(maxsize=400)
    cap = AudioCapture(pcm_q)
    cap.start()
    vad = webrtcvad.Vad(2)

    print("capturing 10s — start any audio now", file=sys.stderr)
    t_end = time.time() + 10.0
    bucket_start = time.time()
    bucket = {"total": 0, "rms": 0, "vad": 0, "both": 0, "rms_sum": 0.0}
    sec = 0
    while time.time() < t_end:
        try:
            frame = pcm_q.get(timeout=0.5)
        except queue.Empty:
            continue

        i16 = np.frombuffer(frame, dtype=np.int16)
        rms = float(np.sqrt(np.mean((i16.astype(np.float32) / 32768.0) ** 2)))
        rms_pass = rms >= ENERGY_GATE
        try:
            vad_pass = vad.is_speech(frame, SR)
        except Exception:
            vad_pass = False

        bucket["total"] += 1
        bucket["rms_sum"] += rms
        if rms_pass: bucket["rms"] += 1
        if vad_pass: bucket["vad"] += 1
        if rms_pass and vad_pass: bucket["both"] += 1

        if time.time() - bucket_start >= 1.0:
            mean_rms = bucket["rms_sum"] / max(bucket["total"], 1)
            print(f"sec {sec}: total={bucket['total']:3d}  rms_pass={bucket['rms']:3d}  vad_pass={bucket['vad']:3d}  both={bucket['both']:3d}  mean_rms={mean_rms:.4f}", file=sys.stderr)
            sec += 1
            bucket = {"total": 0, "rms": 0, "vad": 0, "both": 0, "rms_sum": 0.0}
            bucket_start = time.time()

    cap.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
