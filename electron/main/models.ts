/**
 * Groq model ids, in one place.
 *
 * These are not stable: `llama-3.3-70b-versatile` was hardcoded in three
 * files and was retired by Groq without warning, which surfaced as every
 * suggestion, translation and post-call silently failing. Keeping the ids
 * together means the next retirement is a one-line change, and
 * `npm run check:models` (scripts/check-models.mjs) tells you it happened
 * before your users do.
 *
 * Verify availability with:
 *   curl -s https://api.groq.com/openai/v1/models \
 *     -H "Authorization: Bearer $GROQ_API_KEY" | jq -r '.data[].id'
 */

/** Live path: answer suggestions and on-the-fly translation. Latency is
 *  what matters here — the output is a couple of sentences and the user is
 *  mid-conversation waiting for it. */
export const MODEL_REALTIME = 'openai/gpt-oss-20b';

/** Post-call report. Runs once per call, produces the artifact the owner
 *  actually reads, and is not latency-bound. Worth the bigger model. */
export const MODEL_POSTCALL = 'openai/gpt-oss-120b';

/** Cheapest call that proves an API key works. Used by the key-setup
 *  screen, so it should be whatever model is most certain to exist. */
export const MODEL_KEY_PROBE = MODEL_REALTIME;
