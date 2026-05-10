/**
 * Supabase Auth client for the Auris main process.
 *
 * Why here and not in the renderer:
 *   - All credentials (access_token, refresh_token) stay in the main
 *     process, encrypted at rest via safeStorage. The renderer never sees
 *     a token, so a renderer-side XSS can't exfiltrate the user's session.
 *   - Mirrors the existing trust boundary (Anthropic/Groq SDKs also live
 *     in main only).
 *
 * Why plain fetch instead of @supabase/supabase-js:
 *   - The SDK is browser-first; in Node it works but ships ~200KB of code
 *     we don't need. Auth-only flow is small enough to roll by hand.
 *   - We don't get auto-refresh "for free", but the few methods we do need
 *     (signUp, signIn, refresh, signOut) are 4 fetch calls.
 */
import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { PROD_PROXY_URL, PROD_SUPABASE_ANON_KEY, PROD_SUPABASE_URL } from './productionConfig';

const SESSION_FILE = 'auris.session';

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  user: {
    id: string;
    email: string;
  };
}

export type PlanTier = 'free' | 'pro' | 'team';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  plan: PlanTier;
  user_context: string | null;
  created_at: string;
}

export interface QuotaInfo {
  plan: PlanTier;
  used: number;
  limit: number;
  remaining: number;
  reset_at: number;
}

function proxyUrl(): string | null {
  if (app.isPackaged) {
    return PROD_PROXY_URL && PROD_PROXY_URL.trim().length > 0
      ? PROD_PROXY_URL.trim()
      : null;
  }
  const v = process.env.AURIS_PROXY_URL?.trim();
  return v && v.length > 0 ? v : null;
}

export type AuthErrorCode =
  | 'not_configured'
  | 'invalid_credentials'
  | 'email_taken'
  | 'email_not_confirmed'
  | 'network'
  | 'unknown';

export interface AuthError {
  code: AuthErrorCode;
  message: string;
}

function sessionPath(): string {
  return path.join(app.getPath('userData'), SESSION_FILE);
}

function supabaseConfig(): { url: string; anonKey: string } | null {
  // Production builds use the values baked in at build time from
  // `.env.production`. In dev, fall back to `process.env` (loaded from
  // `.env` via dotenv at startup).
  const url =
    (PROD_SUPABASE_URL && PROD_SUPABASE_URL.trim()) ||
    process.env.SUPABASE_URL?.trim();
  const anonKey =
    (PROD_SUPABASE_ANON_KEY && PROD_SUPABASE_ANON_KEY.trim()) ||
    process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return supabaseConfig() !== null;
}

export function loadSession(): Session | null {
  const p = sessionPath();
  if (!fs.existsSync(p)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const buf = fs.readFileSync(p);
    return JSON.parse(safeStorage.decryptString(buf)) as Session;
  } catch (err) {
    console.error('failed to load session', err);
    return null;
  }
}

function saveSession(s: Session): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Criptografia segura indisponível neste sistema.');
  }
  const enc = safeStorage.encryptString(JSON.stringify(s));
  fs.writeFileSync(sessionPath(), enc, { mode: 0o600 });
}

export function clearSession(): void {
  const p = sessionPath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function sessionFromTokenResponse(
  tokenResp: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    user?: { id: string; email: string };
  },
  fallbackUser?: { id: string; email: string },
): Session {
  const user = tokenResp.user ?? fallbackUser;
  if (!user) throw new Error('resposta sem usuário');
  return {
    access_token: tokenResp.access_token,
    refresh_token: tokenResp.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (tokenResp.expires_in ?? 3600),
    user: { id: user.id, email: user.email },
  };
}

function mapSupabaseError(status: number, body: unknown): AuthError {
  const b = body as { msg?: string; error_description?: string; error?: string; code?: string };
  const msg = b.msg ?? b.error_description ?? b.error ?? `erro http ${status}`;
  const lower = msg.toLowerCase();
  if (lower.includes('invalid login') || lower.includes('invalid_credentials')) {
    return { code: 'invalid_credentials', message: 'Email ou senha incorretos.' };
  }
  if (lower.includes('already') && lower.includes('register')) {
    return { code: 'email_taken', message: 'Já existe uma conta com este email.' };
  }
  if (lower.includes('email') && lower.includes('confirm')) {
    return { code: 'email_not_confirmed', message: 'Confirme seu email antes de entrar.' };
  }
  return { code: 'unknown', message: msg };
}

async function postSupabase(
  url: string,
  anonKey: string,
  body: unknown,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; body: unknown }> {
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw Object.assign(new Error('Falha de rede ao falar com Supabase.'), {
      _authCode: 'network' as AuthErrorCode,
    });
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false, status: resp.status, body: data };
  return { ok: true, data: data as Record<string, unknown> };
}

export async function signUp(email: string, password: string): Promise<Session> {
  const cfg = supabaseConfig();
  if (!cfg) throw Object.assign(new Error('Supabase não configurado.'), { _authCode: 'not_configured' as AuthErrorCode });

  const result = await postSupabase(`${cfg.url}/auth/v1/signup`, cfg.anonKey, { email, password });
  if (!result.ok) {
    const err = mapSupabaseError(result.status, result.body);
    throw Object.assign(new Error(err.message), { _authCode: err.code });
  }

  // Happy path: Supabase returned a session (email confirmation off
  // AND project config is in sync). Save and return.
  const data = result.data;
  if (data.session) {
    const sess = sessionFromTokenResponse(
      data.session as { access_token: string; refresh_token: string; expires_in?: number },
      data.user as { id: string; email: string },
    );
    saveSession(sess);
    return sess;
  }

  // Fallback: signup succeeded but Supabase didn't return a session. Two
  // common reasons:
  //   1. Email confirmation toggle is ON in project config (so signup
  //      response intentionally omits tokens, even if a DB trigger
  //      auto-confirms the user) — login will work right after.
  //   2. Real email confirmation flow — login will fail with
  //      "email_not_confirmed".
  // Try login first; if it works the user is in. If not, ask them to confirm.
  try {
    return await signIn(email, password);
  } catch {
    throw Object.assign(
      new Error('Verifique seu email para confirmar a conta antes de entrar.'),
      { _authCode: 'email_not_confirmed' as AuthErrorCode },
    );
  }
}

export async function signIn(email: string, password: string): Promise<Session> {
  const cfg = supabaseConfig();
  if (!cfg) throw Object.assign(new Error('Supabase não configurado.'), { _authCode: 'not_configured' as AuthErrorCode });

  const result = await postSupabase(
    `${cfg.url}/auth/v1/token?grant_type=password`,
    cfg.anonKey,
    { email, password },
  );
  if (!result.ok) {
    const err = mapSupabaseError(result.status, result.body);
    throw Object.assign(new Error(err.message), { _authCode: err.code });
  }

  const sess = sessionFromTokenResponse(
    result.data as {
      access_token: string;
      refresh_token: string;
      expires_in?: number;
      user?: { id: string; email: string };
    },
  );
  saveSession(sess);
  return sess;
}

async function refreshSession(session: Session): Promise<Session> {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error('Supabase não configurado.');

  const result = await postSupabase(
    `${cfg.url}/auth/v1/token?grant_type=refresh_token`,
    cfg.anonKey,
    { refresh_token: session.refresh_token },
  );
  if (!result.ok) {
    throw new Error('refresh falhou — sessão revogada');
  }
  const sess = sessionFromTokenResponse(
    result.data as {
      access_token: string;
      refresh_token: string;
      expires_in?: number;
      user?: { id: string; email: string };
    },
    session.user,
  );
  saveSession(sess);
  return sess;
}

/**
 * Server-side session validation. Catches the "account deleted server-side
 * while we still have a valid-looking JWT in safeStorage" case so we can
 * force-logout proactively instead of waiting for the JWT to expire (~1h).
 *
 * Why we hit `/rest/v1/profiles` and NOT `/auth/v1/user`:
 *   /auth/v1/user only verifies the JWT signature — it returns 200 with
 *   data derived from the token itself even if the underlying user has
 *   been deleted from the database. /rest/v1/profiles, by contrast, hits
 *   the actual table; if the user row is gone (and `on delete cascade`
 *   removed their profile), the response is an empty array and we know
 *   the session is dead.
 *
 * Returns false on 401/403 or empty result; true on 200 with row OR on
 * network error (don't punish the user when offline) OR on 404 (profiles
 * table doesn't exist yet — first-time setup).
 */
export async function validateSession(): Promise<boolean> {
  const cfg = supabaseConfig();
  if (!cfg) return false;
  const session = loadSession();
  if (!session) return false;

  try {
    const url = `${cfg.url}/rest/v1/profiles?select=id&limit=1`;
    const resp = await fetch(url, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${session.access_token}`,
        Accept: 'application/json',
      },
    });

    // Hard-rejected: token bad or revoked.
    if (resp.status === 401 || resp.status === 403) return false;

    // Profiles table missing (e.g., setup SQL hasn't been run) — don't
    // invalidate the session over that, just trust the JWT and move on.
    if (resp.status === 404) return true;

    if (resp.ok) {
      const rows = (await resp.json()) as unknown[];
      // RLS filters to the caller's own row. If it's empty, the row is
      // gone → user was deleted (cascade ran on delete from auth.users).
      return Array.isArray(rows) && rows.length > 0;
    }

    return false;
  } catch (err) {
    console.warn('[auth] validateSession network error (treating as valid):', err);
    return true;
  }
}

/**
 * Returns a valid access token, refreshing it when within 60s of expiry.
 * Returns null if there's no session or refresh fails.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const session = loadSession();
  if (!session) return null;

  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at - now > 60) {
    return session.access_token;
  }

  try {
    const fresh = await refreshSession(session);
    return fresh.access_token;
  } catch (err) {
    console.error('token refresh failed; clearing session', err);
    clearSession();
    return null;
  }
}

/**
 * Fetch the user's profile (`public.profiles` row) using their Supabase
 * access token. RLS filters to their own row, so the returned set is
 * either empty (no profile yet) or a single row.
 */
export async function getProfile(): Promise<UserProfile | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  const token = await getValidAccessToken();
  if (!token) return null;

  // Try with user_context (added in a later migration). If the column
  // doesn't exist yet on this project's DB, Supabase returns 400 and we
  // retry without — the user just won't have the "Sobre você" feature
  // until they run the migration. Crucially, we DON'T fail the whole
  // profile load over that, otherwise AccountScreen mistakes it for a
  // deleted account.
  const headers = {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  const baseSelect = 'id,email,full_name,plan,created_at';

  async function tryFetch(extraColumns: string[]): Promise<UserProfile | null> {
    const cols = [baseSelect, ...extraColumns].filter(Boolean).join(',');
    const url = `${cfg!.url}/rest/v1/profiles?select=${cols}&limit=1`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw Object.assign(new Error(`profiles fetch ${resp.status}: ${body.slice(0, 120)}`), {
        status: resp.status,
        body,
      });
    }
    const rows = (await resp.json()) as UserProfile[];
    return rows[0] ?? null;
  }

  try {
    return await tryFetch(['user_context']);
  } catch (err) {
    const e = err as { status?: number; body?: string };
    // 400 + "user_context" → column missing. Retry without it.
    if (e.status === 400 && (e.body ?? '').includes('user_context')) {
      console.warn('[auth] user_context column missing — retrying profile fetch without it');
      try {
        return await tryFetch([]);
      } catch (err2) {
        console.warn('[auth] profile retry failed:', err2);
        return null;
      }
    }
    console.warn('[auth] profile fetch failed:', err);
    return null;
  }
}

/**
 * PATCH the user's profile row to update `user_context`. RLS allows the
 * caller to update only their own row (auth.uid() = id), so we don't need
 * to specify a where clause in the URL — Supabase scopes it automatically.
 */
export async function updateUserContext(
  context: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const cfg = supabaseConfig();
  if (!cfg) return { ok: false, error: 'Supabase não configurado.' };
  const token = await getValidAccessToken();
  if (!token) return { ok: false, error: 'Sessão expirada.' };

  const session = loadSession();
  if (!session) return { ok: false, error: 'Sessão não encontrada.' };

  const url = `${cfg.url}/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}`;
  try {
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ user_context: context }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { ok: false, error: `HTTP ${resp.status}: ${text.slice(0, 160)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Read the user's daily quota from the proxy's `/quota` endpoint. Used by
 * AccountScreen to show a usage bar. Returns null when there's no proxy
 * configured (dev mode without proxy) or no valid session.
 */
export async function getQuota(): Promise<QuotaInfo | null> {
  const url = proxyUrl();
  if (!url) return null;
  const token = await getValidAccessToken();
  if (!token) return null;

  try {
    const resp = await fetch(`${url.replace(/\/$/, '')}/quota`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as QuotaInfo;
    return data;
  } catch (err) {
    console.warn('[auth] getQuota failed:', err);
    return null;
  }
}

export async function signOut(): Promise<void> {
  const cfg = supabaseConfig();
  const session = loadSession();
  if (cfg && session) {
    // Best-effort revoke; ignore errors so the user can always sign out locally.
    try {
      await fetch(`${cfg.url}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    } catch {
      /* ignore */
    }
  }
  clearSession();
}
