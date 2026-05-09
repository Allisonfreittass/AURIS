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
import { PROD_SUPABASE_ANON_KEY, PROD_SUPABASE_URL } from './productionConfig';

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
  created_at: string;
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
 * Lightweight server-side validation: ask Supabase if the access token
 * still maps to an existing user. Catches the "account deleted server-side
 * while we still have a valid-looking JWT in safeStorage" case so we can
 * force-logout proactively instead of waiting for token expiry (~1h).
 *
 * Returns true on success, false on 401/404/network — caller treats falsy
 * as "session is dead, clear it".
 */
export async function validateSession(): Promise<boolean> {
  const cfg = supabaseConfig();
  if (!cfg) return false;
  const session = loadSession();
  if (!session) return false;

  try {
    const resp = await fetch(`${cfg.url}/auth/v1/user`, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    if (resp.status === 401 || resp.status === 403 || resp.status === 404) {
      return false;
    }
    return resp.ok;
  } catch (err) {
    // Network failure ≠ invalid session — don't punish the user when offline.
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

  const url = `${cfg.url}/rest/v1/profiles?select=id,email,full_name,plan,created_at&limit=1`;
  try {
    const resp = await fetch(url, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (!resp.ok) {
      console.warn(`[auth] profile fetch returned ${resp.status}`);
      return null;
    }
    const rows = (await resp.json()) as UserProfile[];
    return rows[0] ?? null;
  } catch (err) {
    console.warn('[auth] profile fetch failed:', err);
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
