/**
 * Post-call report generation.
 *
 * One LLM call produces all four artifacts at once. Four separate calls
 * would cost 4x in a product that already has volume pressure, and a single
 * read keeps the summary and the objections consistent with each other.
 *
 * The transcript is read from the stored session rather than passed in, so
 * there is exactly one source of truth for what was said.
 */
import Groq from 'groq-sdk';
import type {
  PostCallMeta,
  PostCallObjection,
  PostCallNextStep,
  PostCallReport,
  StoredSession,
  StoredTranscript,
  TranscriptChannel,
} from '../../../shared/ipc';
import type { AuthConfig } from '../secrets';
import { SYSTEM_PROMPT, SYSTEM_PROMPT_VERSION } from './prompts/system';
import { buildReportPrompt, REPORT_PROMPT_VERSION } from './prompts/report';
import { translateText } from '../translate';
import { toMillis } from '../../../shared/time';

import { MODEL_POSTCALL } from '../models';

const MODEL = MODEL_POSTCALL;
const MAX_TOKENS = 2000;

/** Character budget for the transcript we send. A 60-minute call runs about
 *  55k characters, comfortably inside the model's window; this is a guard
 *  against a session that ran all day, not a routine trim. When it bites we
 *  keep the TAIL — how a call ended matters more than how it opened — and
 *  say so in the metadata rather than truncating silently. */
const MAX_TRANSCRIPT_CHARS = 60_000;

function buildClient(auth: AuthConfig): Groq {
  if (auth.mode === 'proxy') {
    return new Groq({ apiKey: auth.token, baseURL: auth.url.replace(/\/$/, '') });
  }
  return new Groq({ apiKey: auth.apiKey });
}

function speakerLabel(channel: TranscriptChannel | undefined): string {
  if (channel === 'vendedor') return 'vendedor';
  if (channel === 'cliente') return 'cliente';
  // Legacy sessions (single mixed stream, or recorded before dual capture)
  // carry no attribution. Say so instead of guessing.
  return 'desconhecido';
}

/** Render finals as one tagged line each. Partials never reach history. */
function renderTranscript(transcripts: StoredTranscript[]): {
  text: string;
  truncated: boolean;
} {
  const lines = transcripts
    .filter((t) => t.text.trim())
    .map((t) => `[${speakerLabel(t.channel)}] ${t.text.trim()}`);
  const full = lines.join('\n');
  if (full.length <= MAX_TRANSCRIPT_CHARS) return { text: full, truncated: false };
  return { text: full.slice(full.length - MAX_TRANSCRIPT_CHARS), truncated: true };
}

/** Minimum characters for a final to get a say in the language vote. Whisper
 *  guesses badly on fragments: a real call produced "or" and "Mm-hmm." tagged
 *  English, and even "Olá? Olá?" came back as English. */
const MIN_CHARS_FOR_LANG_VOTE = 12;

/**
 * The call's language, weighted by how much was actually said in it.
 *
 * Counting finals lets noise win: three one-word fragments misdetected as
 * English outvoted two full Portuguese sentences, and the report then asked
 * for a follow-up email in English on a Portuguese call. Weighting by
 * characters makes a real sentence count for more than a grunt, and dropping
 * very short finals from the vote removes the worst guesses entirely.
 *
 * Falls back to the unfiltered weighting when every final is short, so a call
 * made entirely of brief exchanges still reports something.
 */
function dominantLang(transcripts: StoredTranscript[]): string | null {
  const tally = (minChars: number): Map<string, number> => {
    const weights = new Map<string, number>();
    for (const t of transcripts) {
      const text = t.text?.trim() ?? '';
      if (!t.lang || text.length < minChars) continue;
      weights.set(t.lang, (weights.get(t.lang) ?? 0) + text.length);
    }
    return weights;
  };

  let weights = tally(MIN_CHARS_FOR_LANG_VOTE);
  if (weights.size === 0) weights = tally(0);

  let best: string | null = null;
  let bestWeight = 0;
  for (const [lang, w] of weights) {
    if (w > bestWeight) {
      best = lang;
      bestWeight = w;
    }
  }
  return best;
}

function buildMeta(session: StoredSession, truncated: boolean): PostCallMeta {
  // Sessions recorded before the unit fix hold seconds here; toMillis reads
  // both, so an old call still reports a real duration.
  const ts = session.transcripts.map((t) => toMillis(t.ts, 0)).filter((n) => n > 0);
  const durationSec = ts.length >= 2 ? Math.max(0, Math.round((Math.max(...ts) - Math.min(...ts)) / 1000)) : 0;
  const channels = Array.from(
    new Set(session.transcripts.map((t) => t.channel).filter(Boolean) as TranscriptChannel[]),
  );
  return {
    startedAt: session.startedAt,
    durationSec,
    lang: dominantLang(session.transcripts),
    channels,
    truncated,
  };
}

// ── defensive parsing ────────────────────────────────────────────────────
// The model is asked for strict JSON and put in JSON mode, but a report that
// silently loses a field is worse than one that fails loudly, so every field
// is checked rather than cast.

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function asNullableString(v: unknown): string | null {
  const s = asString(v);
  return s ? s : null;
}

function parseNextSteps(v: unknown): PostCallNextStep[] {
  if (!Array.isArray(v)) return [];
  const out: PostCallNextStep[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const acao = asString(r.acao);
    if (!acao) continue;
    out.push({
      acao,
      responsavel: r.responsavel === 'cliente' ? 'cliente' : 'nos',
      prazo: asNullableString(r.prazo),
    });
  }
  return out;
}

function parseObjections(v: unknown): PostCallObjection[] {
  if (!Array.isArray(v)) return [];
  const out: PostCallObjection[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const objecao = asString(r.objecao);
    if (!objecao) continue;
    out.push({ objecao, resposta_dada: asNullableString(r.resposta_dada) });
  }
  return out;
}

export type GenerateResult =
  | { ok: true; report: PostCallReport }
  | { ok: false; error: string };

export async function generatePostCallReport(
  session: StoredSession,
  auth: AuthConfig,
): Promise<GenerateResult> {
  const { text: transcricao, truncated } = renderTranscript(session.transcripts);
  if (!transcricao) {
    return { ok: false, error: 'Essa call não tem transcrição para analisar.' };
  }

  const meta = buildMeta(session, truncated);
  const client = buildClient(auth);

  let raw: string;
  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      stream: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildReportPrompt({ idioma: meta.lang ?? 'desconhecido', transcricao }),
        },
      ],
    });
    raw = completion.choices?.[0]?.message?.content?.trim() ?? '';
  } catch (err) {
    const e = err as { message?: string };
    console.error('[postcall] generation failed:', e.message);
    return { ok: false, error: e.message ?? 'Falha ao gerar o registro pós-call.' };
  }

  if (!raw) return { ok: false, error: 'O modelo devolveu uma resposta vazia.' };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.error('[postcall] non-JSON response:', raw.slice(0, 300));
    return { ok: false, error: 'O modelo não devolveu JSON válido.' };
  }

  const followUpRaw = (parsed.follow_up ?? {}) as Record<string, unknown>;
  const corpo = asString(followUpRaw.corpo);

  const report: PostCallReport = {
    resumo: asString(parsed.resumo),
    proximos_passos: parseNextSteps(parsed.proximos_passos),
    objecoes: parseObjections(parsed.objecoes),
    follow_up: {
      assunto: asString(followUpRaw.assunto),
      corpo,
    },
    meta,
    generatedAt: Date.now(),
    promptVersions: { system: SYSTEM_PROMPT_VERSION, report: REPORT_PROMPT_VERSION },
  };

  if (!report.resumo) {
    return { ok: false, error: 'O modelo não produziu um resumo utilizável.' };
  }

  // Display-only Portuguese rendering of the follow-up, for calls that were
  // not in Portuguese. What the seller sends stays `corpo`, in the language
  // of the call — this exists so the owner can read it.
  if (corpo && meta.lang && meta.lang !== 'pt') {
    try {
      const pt = await translateText(corpo, 'pt', auth);
      if (pt && pt !== corpo) report.follow_up.traducao_pt = pt;
    } catch (err) {
      // A missing translation degrades the screen, it does not invalidate
      // the report. Keep the report.
      console.warn('[postcall] follow-up translation failed:', (err as Error).message);
    }
  }

  return { ok: true, report };
}
