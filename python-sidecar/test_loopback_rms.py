"""Loopback-only RMS probe. Runs the loopback recorder for 8s and reports
RMS distribution per second, so we can confirm SAPI / system audio is
actually reaching the pipeline before blaming the gate or Whisper.
"""
import sys
import time

import numpy as np

import audio  # triggers warning suppression
import soundcard as sc

SR = 16000
FRAME = 320  # 20ms


def main() -> int:
    loop_mic = audio._resolve_loopback_mic()
    if loop_mic is None:
        print("no loopback mic", file=sys.stderr)
        return 1
    print(f"loopback: {loop_mic.name}", file=sys.stderr)

    rms_per_second = []
    bucket: list[float] = []
    bucket_start = time.time()
    t_end = time.time() + 8.0

    with loop_mic.recorder(samplerate=SR, channels=1, blocksize=FRAME) as r:
        while time.time() < t_end:
            block = r.record(numframes=FRAME)
            mono = block[:, 0] if block.ndim > 1 else block
            rms = float(np.sqrt(np.mean(mono.astype(np.float32) ** 2)))
            bucket.append(rms)
            if time.time() - bucket_start >= 1.0:
                if bucket:
                    rms_per_second.append((max(bucket), sum(bucket) / len(bucket)))
                bucket = []
                bucket_start = time.time()

    for i, (peak, avg) in enumerate(rms_per_second):
        print(f"sec {i}: peak={peak:.4f} avg={avg:.4f}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
