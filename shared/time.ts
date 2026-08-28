/**
 * Epoch-unit normalization.
 *
 * The Python sidecar stamps events with `time.time()` — seconds since the
 * epoch — while everything on the JS side is `Date.now()` milliseconds.
 * Feeding seconds to `new Date()` lands in January 1970 and, worse, makes
 * every line of a call render the same clock time: a whole second of real
 * elapsed time moves the displayed value by one millisecond. It also
 * collapses any duration computed from those stamps to zero.
 *
 * Convert at the boundary, and keep the guard forgiving so session files
 * written before the fix still read correctly.
 */

/** Milliseconds, whether `raw` arrived in seconds or milliseconds.
 *
 *  The threshold is unambiguous for any timestamp this app will ever see:
 *  1e12 ms is September 2001, and 1e12 seconds is the year 33658. Anything
 *  smaller than that is seconds. */
export function toMillis(raw: unknown, fallback: number = Date.now()): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
}
