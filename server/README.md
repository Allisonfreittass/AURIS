# auris-proxy — Cloudflare Worker

Thin proxy between the Auris desktop and Groq. Holds the real Groq API key
server-side and gates access by Supabase JWT (Phase B2).

## Auth flow (B2)

```
Auris desktop                                Cloudflare Worker             Groq
─────────────                                ─────────────────             ────
[user logs in via Supabase] ──── access_token (JWT) ────►
                                              verifies JWT signature
                                              against SUPABASE_JWT_SECRET
                                              checks iss / aud / exp
                                              extracts user.id (sub)
                                              ── swaps Bearer for GROQ_API_KEY ──►
                                                            ◄────── streams back ──────
                                              ◄────── streams to client ──────
```

`AURIS_DEV_TOKEN` is preserved as a flat shared secret for tests/admin —
requests with that exact token bypass JWT verification. Leave it unset in
real production.

## One-time setup

1. Create a Supabase project at https://supabase.com (free).
2. In Supabase: Settings → API → copy:
   - `Project URL` (e.g., `https://xyzabc.supabase.co`)
   - `JWT Secret` (Settings → API → JWT Settings)
3. Install deps:
   ```pwsh
   cd server
   npm install
   ```
4. Login to Cloudflare:
   ```pwsh
   npx wrangler login
   ```
5. Create the KV namespace for per-user rate limiting:
   ```pwsh
   npx wrangler kv namespace create AURIS_RATELIMIT
   ```
   Wrangler prints something like:
   ```
   id = "abc123def456..."
   ```
   Open `wrangler.toml` and replace `REPLACE_WITH_KV_ID_FROM_WRANGLER`
   with the printed id.
6. Set production secrets:
   ```pwsh
   npx wrangler secret put GROQ_API_KEY
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_JWT_SECRET
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY  # for plan lookup
   # optional dev backdoor:
   npx wrangler secret put AURIS_DEV_TOKEN
   ```

## Local development

1. Copy `.dev.vars.example` to `.dev.vars` and fill it in.
2. `npm run dev` — listens on `http://localhost:8787`.
3. In the desktop project's `.env`:
   ```
   AURIS_PROXY_URL=http://localhost:8787
   SUPABASE_URL=https://xyzabc.supabase.co
   SUPABASE_ANON_KEY=<your anon key>
   ```
4. `npm run dev` in the desktop project. The app will show a login screen.
5. Sign up / sign in. The desktop sends the Supabase JWT to the worker.

For quick testing without a Supabase project, set `AURIS_DEV_TOKEN` in
`.dev.vars` AND `AURIS_LICENSE_TOKEN` in the desktop `.env` to the same
value. The worker will accept it without JWT validation.

## Deploy

```pwsh
npm run deploy
```

Returns a URL like `https://auris-proxy.<your-subdomain>.workers.dev`.
Use that URL as the desktop's `AURIS_PROXY_URL`.

## Endpoints

| Path | Status |
|---|---|
| `GET /health` | Returns `{ ok: true, ... }` |
| `POST /openai/v1/chat/completions` | Forwarded to Groq with auth swap |
| anything else | 404 |

The path allowlist is intentional. Add new entries to `ALLOWED_GROQ_PATHS`
in `src/index.ts` when needed (e.g., when we move Whisper to Groq).

## Logs

```pwsh
npm run tail
```
