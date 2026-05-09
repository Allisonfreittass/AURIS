/**
 * Auris proxy — Cloudflare Worker.
 *
 * Sits between the Auris desktop client and Groq:
 *   Client → POST /openai/v1/chat/completions  (Bearer: <Supabase JWT>)
 *          → Worker validates JWT (or dev token)
 *          → Worker forwards to Groq with the real GROQ_API_KEY
 *          → Worker streams the response back unchanged
 *
 * Auth: Supabase JWT in B2 (HS256, verified against SUPABASE_JWT_SECRET).
 * AURIS_DEV_TOKEN remains as a flat-string backdoor for tests/admin.
 *
 * Only a strict allowlist of Groq paths is forwarded.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authenticate, type ServerEnv } from './auth';
import { fetchUserPlan } from './profiles';
import { checkAndIncrement } from './ratelimit';

interface FullEnv extends ServerEnv {
  AURIS_RATELIMIT?: KVNamespace;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const ALLOWED_GROQ_PATHS = new Set<string>([
  '/chat/completions',
  '/audio/transcriptions',
]);

const app = new Hono<{ Bindings: FullEnv }>();

app.use('*', cors({
  origin: '*',
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  exposeHeaders: ['x-auris-version'],
}));

app.get('/', (c) =>
  c.json({
    service: 'auris-proxy',
    version: '0.2.0',
    status: 'ok',
    docs: 'POST /openai/v1/chat/completions with Bearer <Supabase JWT or AURIS_DEV_TOKEN>',
    health: '/health',
  }),
);

app.get('/health', (c) =>
  c.json({ ok: true, service: 'auris-proxy', version: '0.2.0' }),
);

app.all('/openai/v1/*', async (c) => {
  // 1. Auth: Bearer <token>.
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json(
      { error: { type: 'auth_error', message: 'missing bearer token' } },
      401,
    );
  }
  const token = auth.slice(7).trim();
  const authResult = await authenticate(token, c.env);
  if (!authResult.ok) {
    // Log the precise reason so `wrangler tail` shows it. The HTTP body
    // returned to the client also includes the message — useful while
    // debugging integrations.
    console.warn(`[auth] rejected (${authResult.status}): ${authResult.error}`);
    return c.json(
      { error: { type: 'auth_error', message: authResult.error } },
      authResult.status as 401 | 500,
    );
  }

  // 2. Path allowlist.
  const url = new URL(c.req.url);
  const subPath = url.pathname.replace('/openai/v1', '');
  if (!ALLOWED_GROQ_PATHS.has(subPath)) {
    return c.json(
      {
        error: {
          type: 'not_allowed',
          message: `path "${subPath}" is not on the allowlist`,
        },
      },
      403,
    );
  }

  // 3. Plan lookup + per-plan rate limit (KV-backed daily counter).
  const plan = await fetchUserPlan(authResult.userId, c.env);
  const rl = await checkAndIncrement(authResult.userId, authResult.isDev, plan, c.env);
  if (!rl.ok) {
    console.warn(`[ratelimit] user=${authResult.userId} plan=${plan} blocked`);
    return c.json(
      {
        error: {
          type: 'rate_limit',
          message: rl.message,
          reset_at: rl.resetAt,
          plan: rl.plan,
        },
      },
      rl.status,
    );
  }

  // 4. Forward to Groq, swapping the auth header.
  const upstreamUrl = `${GROQ_BASE}${subPath}${url.search}`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: c.req.method,
      headers: {
        Authorization: `Bearer ${c.env.GROQ_API_KEY}`,
        'Content-Type':
          c.req.header('Content-Type') ?? 'application/json',
      },
      body:
        c.req.method === 'GET' || c.req.method === 'HEAD'
          ? undefined
          : c.req.raw.body,
    });
  } catch (err) {
    console.error('upstream fetch failed:', err);
    return c.json(
      { error: { type: 'upstream_error', message: 'failed to reach Groq' } },
      502,
    );
  }

  // 5. Forward the response. Strip Groq quota headers so we don't leak the
  //    shared key's rate-limit state. Add our own quota headers so the
  //    desktop client could surface "X requests left today" in the UI.
  const headers = new Headers(upstream.headers);
  for (const h of [
    'x-ratelimit-limit-requests',
    'x-ratelimit-remaining-requests',
    'x-ratelimit-reset-requests',
    'x-ratelimit-limit-tokens',
    'x-ratelimit-remaining-tokens',
    'x-ratelimit-reset-tokens',
  ]) {
    headers.delete(h);
  }
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('x-auris-version', '0.3.0');
  headers.set('x-auris-plan', rl.plan);
  if (rl.remaining >= 0) {
    headers.set('x-auris-quota-limit', String(rl.limit));
    headers.set('x-auris-quota-remaining', String(rl.remaining));
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
});

app.all('*', (c) =>
  c.json({ error: { type: 'not_found', path: c.req.path } }, 404),
);

export default app;
