/**
 * On-the-fly translation of transcript finals via the same proxy/LLM
 * pipeline used for chat responses. Runs as a small focused chat call
 * with a translator system prompt.
 *
 * Cost & latency: each call is one extra Llama 3.3 70B request per final.
 * At ~5–10 finals per minute of speech that's 5–10 extra requests/min,
 * well below the free tier's ~30 req/min. Latency is the same ~400-800ms
 * a normal LLM ask takes — we don't block the UI; the transcript event
 * just shows up a moment after the original.
 */
import Groq from 'groq-sdk';
import type { AuthConfig } from './secrets';

const SYSTEM = `You are a precise transcription translator. Translate the user's text to {{TARGET}}, preserving meaning, tone, names, technical terms, and numbers. Do NOT add commentary, explanations, or quotes around the output. Return ONLY the translated text.`;

const LANG_NAMES: Record<string, string> = {
  pt: 'Portuguese (Brazilian)',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  de: 'German',
};

function buildClient(auth: AuthConfig): Groq {
  if (auth.mode === 'proxy') {
    return new Groq({
      apiKey: auth.token,
      baseURL: auth.url.replace(/\/$/, ''),
    });
  }
  return new Groq({ apiKey: auth.apiKey });
}

export async function translateText(
  text: string,
  targetLang: string,
  auth: AuthConfig,
): Promise<string> {
  if (!text.trim()) return text;
  const targetName = LANG_NAMES[targetLang] ?? targetLang;
  const sys = SYSTEM.replace('{{TARGET}}', targetName);

  const client = buildClient(auth);
  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: Math.min(500, text.length * 4),
    temperature: 0.1,
    stream: false,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: text },
    ],
  });

  const out = completion.choices?.[0]?.message?.content?.trim() ?? '';
  return out || text;
}
