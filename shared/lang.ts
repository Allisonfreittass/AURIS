/** Shared language-code normalization. Whisper backends are inconsistent:
 *  faster-whisper returns ISO 639-1 ("pt", "en"), Groq Whisper returns
 *  full names ("portuguese", "english"), and some configurations return
 *  BCP-47 tags ("pt-BR") or ISO 639-2 codes ("por", "eng"). All paths
 *  funnel through this normalizer so comparisons (and the translated
 *  badge) work regardless of source format. */

const FULL_NAME_TO_CODE: Record<string, string> = {
  english: 'en',
  portuguese: 'pt',
  spanish: 'es',
  french: 'fr',
  italian: 'it',
  german: 'de',
  dutch: 'nl',
  russian: 'ru',
  japanese: 'ja',
  chinese: 'zh',
  korean: 'ko',
  arabic: 'ar',
  // Defensive variants observed in the wild.
  brazilian: 'pt',
  'portuguese (brazilian)': 'pt',
  'portuguese (brazil)': 'pt',
};

const ISO_639_2_TO_1: Record<string, string> = {
  eng: 'en',
  por: 'pt',
  spa: 'es',
  fra: 'fr',
  fre: 'fr',
  ita: 'it',
  deu: 'de',
  ger: 'de',
  nld: 'nl',
  dut: 'nl',
  rus: 'ru',
  jpn: 'ja',
  zho: 'zh',
  chi: 'zh',
  kor: 'ko',
  ara: 'ar',
};

/** Normalize an arbitrary language tag to a 2-letter ISO 639-1 code.
 *  Returns '' for empty/unknown input — callers can treat that as
 *  "language unknown" and skip translation/badge logic. */
export function normalizeLangCode(raw: string | undefined | null): string {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  if (!lower) return '';

  // Try the full normalized string first (handles "portuguese (brazilian)")
  const exact = FULL_NAME_TO_CODE[lower];
  if (exact) return exact;

  // Strip BCP-47 region/variant suffix: "pt-BR" → "pt", "zh_Hant" → "zh".
  const base = lower.split(/[-_]/)[0];
  if (!base) return '';

  if (base.length === 2) return base;
  if (base.length === 3) return ISO_639_2_TO_1[base] ?? base;

  // Full name (e.g. "english"); unknown ones fall through to a 2-letter
  // truncation as last resort.
  return FULL_NAME_TO_CODE[base] ?? base.slice(0, 2);
}

/** True when two raw language tags refer to the same language after
 *  normalization. Use this for "should I translate?" / "should I show
 *  the translated badge?" decisions. */
export function sameLang(a: string | undefined | null, b: string | undefined | null): boolean {
  const na = normalizeLangCode(a);
  const nb = normalizeLangCode(b);
  if (!na || !nb) return false;
  return na === nb;
}
