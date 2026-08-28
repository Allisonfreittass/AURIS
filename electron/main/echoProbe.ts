/**
 * Echo-bleed probe. Observes, never drops.
 *
 * When the seller works without headphones, the client's voice leaves the
 * speakers and comes back in through the microphone, so the same sentence is
 * transcribed on both channels and the `vendedor` side gets credited with
 * words the client said. That corrupts the attribution the post-call report
 * is built on.
 *
 * The real filter lands in the real-time block. What is missing to build it
 * is data: whether the bleed arrives transcribed identically ("Thank you."
 * on both channels) or degraded ("Thanks" vs "Thank you") decides between an
 * exact match and a fuzzy one, and picking the threshold blind risks eating
 * legitimate seller speech — a failure that removes content with no trace.
 *
 * So this logs what a filter WOULD have discarded and leaves the pipeline
 * untouched. Run a call on speakers, grep the log, then set thresholds
 * against reality.
 *
 *   npm run dev 2>&1 | grep echo-probe
 */
import type { TranscriptChannel } from '../../shared/ipc';

/** How far back a mic line may look for its source on the system channel.
 *  Acoustic echo is near-instant; the slack is for transcription latency,
 *  which varies with segment length. */
const WINDOW_MS = 12_000;

/** Below this token overlap a pair is not worth reporting. Deliberately
 *  loose — this is a data-collection pass, and a false positive in the log
 *  costs a line of output. */
const REPORT_SIMILARITY = 0.5;

/** Rule B only makes sense once the seller's usual language is established. */
const MIN_FINALS_FOR_LANG_RULE = 5;

/** Word count at or below which a foreign-language line is suspect. */
const SHORT_WORDS = 2;

interface Recent {
  norm: string;
  tokens: Set<string>;
  raw: string;
  at: number;
}

let recentClient: Recent[] = [];
let sellerLangCounts = new Map<string, number>();
let sellerFinals = 0;

/** Lowercase, strip accents and punctuation, collapse whitespace. Two
 *  transcriptions of the same audio differ in casing and punctuation far
 *  more often than in words. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(norm: string): Set<string> {
  return new Set(norm.split(' ').filter(Boolean));
}

/** Jaccard overlap. Cheap, order-insensitive, and good enough to tell
 *  "same sentence, slightly different transcription" from "different
 *  sentence". */
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

function dominantSellerLang(): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const [lang, n] of sellerLangCounts) {
    if (n > bestN) {
      best = lang;
      bestN = n;
    }
  }
  return best;
}

/** Call for every transcript FINAL, with the channel already mapped. Purely
 *  observational: the return value is ignored by design, so that turning the
 *  filter on later is a deliberate edit and never an accident. */
export function observeFinal(
  channel: TranscriptChannel | undefined,
  text: string,
  lang: string | undefined,
  ts: number,
): void {
  const raw = text.trim();
  if (!raw) return;

  const norm = normalize(raw);
  const now = ts || Date.now();

  if (channel === 'cliente') {
    recentClient.push({ norm, tokens: tokenize(norm), raw, at: now });
    recentClient = recentClient.filter((r) => now - r.at <= WINDOW_MS);
    return;
  }
  if (channel !== 'vendedor') return;

  sellerFinals++;
  if (lang) sellerLangCounts.set(lang, (sellerLangCounts.get(lang) ?? 0) + 1);

  // A line with no letters at all — the "." that showed up attributed to the
  // seller. No rule needed to know this is noise.
  if (!norm) {
    report({ rule: 'empty', text: raw, lang });
    return;
  }

  // Rule A — near-duplicate of something the system channel just said.
  const tokens = tokenize(norm);
  let bestMatch: { score: number; source: Recent } | null = null;
  for (const r of recentClient) {
    if (now - r.at > WINDOW_MS) continue;
    const score = similarity(tokens, r.tokens);
    if (!bestMatch || score > bestMatch.score) bestMatch = { score, source: r };
  }
  if (bestMatch && bestMatch.score >= REPORT_SIMILARITY) {
    report({
      rule: 'duplicate',
      score: Number(bestMatch.score.toFixed(2)),
      gapMs: now - bestMatch.source.at,
      text: raw,
      lang,
      matched: bestMatch.source.raw,
    });
    return;
  }

  // Rule B — short line, possibly in a foreign language.
  //
  // Deliberately NOT gated on the running dominant language. Bleed poisons
  // that estimate: on the first real call, the seller's opening final was a
  // bare "." tagged English, so the tally started at {en:1} and the very
  // "Thank you." that leaked in matched the "dominant" language instead of
  // standing out. Log every short line with the tally state attached and let
  // the offline pass apply the POST-HOC distribution, which is the shape the
  // real rule should take: decided once the whole call is known, not
  // incrementally while it is still being contaminated.
  const words = norm.split(' ').filter(Boolean).length;
  if (words <= SHORT_WORDS) {
    report({
      rule: 'short-line',
      text: raw,
      lang,
      words,
      runningDominantLang: dominantSellerLang(),
      sellerFinalsSoFar: sellerFinals,
      warmedUp: sellerFinals >= MIN_FINALS_FOR_LANG_RULE,
      // A Brazilian seller saying "okay" or "deal" is indistinguishable from
      // bleed by word count and language alone. Recorded so the tuning pass
      // can count how often the rule would have cost real speech.
      nearestScore: bestMatch ? Number(bestMatch.score.toFixed(2)) : 0,
    });
  }
}

function report(fields: Record<string, unknown>): void {
  console.log(`[echo-probe] ${JSON.stringify({ wouldDrop: true, ...fields })}`);
}

/** Clear per-call state. Called when a session stops so one call's language
 *  tally never leaks into the next.
 *
 *  Emits the post-hoc language distribution on the way out — the number the
 *  running tally cannot give you mid-call, and the one the real rule should
 *  be built on. */
export function resetEchoProbe(): void {
  if (sellerFinals > 0) {
    console.log(
      `[echo-probe] ${JSON.stringify({
        rule: 'call-summary',
        sellerFinals,
        sellerLangs: Object.fromEntries(sellerLangCounts),
        postHocDominantLang: dominantSellerLang(),
      })}`,
    );
  }
  recentClient = [];
  sellerLangCounts = new Map();
  sellerFinals = 0;
}
