/**
 * Authentication for the Auris proxy.
 *
 * Supports both legacy and current Supabase JWT signing schemes:
 *   - HS256 (older projects + the legacy "JWT Secret" setting)
 *   - RS256 / ES256 (newer projects using asymmetric keys; verified via
 *     the project's `/auth/v1/.well-known/jwks.json` endpoint)
 *
 * The algorithm is detected from the JWT header so the user doesn't have
 * to pick — works with any Supabase project regardless of when it was
 * created.
 *
 * `AURIS_DEV_TOKEN` remains as a flat shared-secret backdoor for
 * smoke-tests; leave it unset in real production.
 */
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';

export type ServerEnv = {
  GROQ_API_KEY: string;
  SUPABASE_URL?: string;
  SUPABASE_JWT_SECRET?: string;
  AURIS_DEV_TOKEN?: string;
};

export type AuthResult =
  | { ok: true; userId: string; email?: string; isDev: boolean }
  | { ok: false; status: number; error: string };

// Cache the JWKS resolver between requests within a single Worker isolate.
// jose's createRemoteJWKSet itself caches the keyset with sane defaults
// (5min cooldown, refetch on rotation), so we just memoize the wrapper.
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedJwksOrigin: string | null = null;

function getJwks(supabaseUrl: string) {
  const url = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
  if (cachedJwks && cachedJwksOrigin === url) return cachedJwks;
  cachedJwks = createRemoteJWKSet(new URL(url));
  cachedJwksOrigin = url;
  return cachedJwks;
}

export async function authenticate(token: string, env: ServerEnv): Promise<AuthResult> {
  if (env.AURIS_DEV_TOKEN && token === env.AURIS_DEV_TOKEN) {
    return { ok: true, userId: 'dev', isDev: true };
  }

  if (!env.SUPABASE_URL) {
    return {
      ok: false,
      status: 500,
      error: 'server not configured: SUPABASE_URL missing',
    };
  }

  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch (err) {
    return {
      ok: false,
      status: 401,
      error: `malformed JWT header: ${(err as Error).message}`,
    };
  }

  const issuer = `${env.SUPABASE_URL}/auth/v1`;
  const audience = 'authenticated';

  try {
    let userId: string | null = null;
    let email: string | undefined;

    if (alg === 'HS256') {
      if (!env.SUPABASE_JWT_SECRET) {
        return {
          ok: false,
          status: 500,
          error:
            'token signed with HS256 but SUPABASE_JWT_SECRET is not set on the worker. ' +
            'Copy it from Supabase Settings → API → JWT Settings → JWT Secret.',
        };
      }
      const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
      const { payload } = await jwtVerify(token, secret, { issuer, audience });
      userId = typeof payload.sub === 'string' ? payload.sub : null;
      email = typeof payload.email === 'string' ? payload.email : undefined;
    } else if (alg === 'RS256' || alg === 'ES256') {
      const jwks = getJwks(env.SUPABASE_URL);
      const { payload } = await jwtVerify(token, jwks, { issuer, audience });
      userId = typeof payload.sub === 'string' ? payload.sub : null;
      email = typeof payload.email === 'string' ? payload.email : undefined;
    } else {
      return { ok: false, status: 401, error: `unsupported JWT alg: ${alg ?? 'unknown'}` };
    }

    if (!userId) {
      return { ok: false, status: 401, error: 'token missing sub claim' };
    }
    return { ok: true, userId, email, isDev: false };
  } catch (err) {
    return {
      ok: false,
      status: 401,
      error: `${alg ?? 'unknown'} verify failed: ${(err as Error).message}`,
    };
  }
}
