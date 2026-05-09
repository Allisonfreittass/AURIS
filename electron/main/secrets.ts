import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { clearSession, getValidAccessToken, isSupabaseConfigured, validateSession } from './auth';
import { PROD_PROXY_URL } from './productionConfig';

const KEY_FILE = 'auris.key';

/**
 * Auth modes for the LLM client. Resolution priority is:
 *
 *   1. Supabase login + proxy URL → 'proxy' mode with Supabase access token
 *      (the production-grade path; user has logged in)
 *   2. AURIS_PROXY_URL + AURIS_LICENSE_TOKEN env → 'proxy' with flat token
 *      (legacy/dev shortcut; corresponds to AURIS_DEV_TOKEN on the worker)
 *   3. GROQ_API_KEY env → 'direct' (dev only)
 *   4. safeStorage saved key → 'direct' (user supplied via API key setup)
 */
export type AuthConfig =
  | { mode: 'direct'; apiKey: string }
  | { mode: 'proxy'; url: string; token: string };

function keyPath(): string {
  return path.join(app.getPath('userData'), KEY_FILE);
}

function envProxyUrl(): string | null {
  // Production builds use the URL baked in at build time from .env.production.
  if (app.isPackaged) {
    return PROD_PROXY_URL && PROD_PROXY_URL.trim().length > 0
      ? PROD_PROXY_URL.trim()
      : null;
  }
  const url = process.env.AURIS_PROXY_URL?.trim();
  return url && url.length > 0 ? url : null;
}

function envFlatToken(): string | null {
  if (app.isPackaged) return null;
  const t = process.env.AURIS_LICENSE_TOKEN?.trim();
  return t && t.length > 0 ? t : null;
}

function envDirectKey(): string | null {
  if (app.isPackaged) return null;
  const v = process.env.GROQ_API_KEY?.trim();
  return v && v.length > 0 ? v : null;
}

function storedDirectKey(): string | null {
  const p = keyPath();
  if (!fs.existsSync(p)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const buf = fs.readFileSync(p);
    return safeStorage.decryptString(buf);
  } catch (err) {
    console.error('failed to decrypt API key', err);
    return null;
  }
}

/**
 * Three states the UI cares about:
 *   - 'authed': we can talk to the LLM right now
 *   - 'needs-login': Supabase is configured but no valid session — show
 *      AuthScreen
 *   - 'needs-key': no Supabase, no env keys, no stored key — show
 *      ApiKeySetup (legacy bring-your-own-Groq path)
 */
export type AuthState = 'authed' | 'needs-login' | 'needs-key';

export async function authState(): Promise<AuthState> {
  const proxyUrl = envProxyUrl();

  if (isSupabaseConfigured() && proxyUrl) {
    const token = await getValidAccessToken();
    if (!token) return 'needs-login';

    // Active server check: catch the "account deleted server-side while we
    // still hold a valid-looking JWT in safeStorage" case. Without this
    // the app stays in a broken authed state until the token naturally
    // expires (~1h).
    const valid = await validateSession();
    if (!valid) {
      console.warn('[auth] session no longer valid on server — forcing logout');
      clearSession();
      return 'needs-login';
    }
    return 'authed';
  }

  if (proxyUrl && envFlatToken()) return 'authed';
  if (envDirectKey()) return 'authed';
  if (storedDirectKey()) return 'authed';

  // Without proxy URL, Supabase login alone doesn't help — fall back to BYO Groq.
  return 'needs-key';
}

/** Resolve the active auth config, refreshing the Supabase token if needed. */
export async function loadAuth(): Promise<AuthConfig | null> {
  const proxyUrl = envProxyUrl();

  if (isSupabaseConfigured() && proxyUrl) {
    const token = await getValidAccessToken();
    if (token) return { mode: 'proxy', url: proxyUrl, token };
    // Supabase configured but no session → caller should redirect to login.
    return null;
  }

  if (proxyUrl) {
    const flat = envFlatToken();
    if (flat) return { mode: 'proxy', url: proxyUrl, token: flat };
  }

  const fromEnv = envDirectKey();
  if (fromEnv) return { mode: 'direct', apiKey: fromEnv };

  const stored = storedDirectKey();
  if (stored) return { mode: 'direct', apiKey: stored };

  return null;
}

export function hasApiKey(): boolean {
  return !!envDirectKey() || fs.existsSync(keyPath());
}

export function saveApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'Criptografia segura indisponível neste sistema. ' +
        'Não foi possível armazenar a API key de forma segura.',
    );
  }
  const encrypted = safeStorage.encryptString(key);
  fs.writeFileSync(keyPath(), encrypted, { mode: 0o600 });
}

export function clearApiKey(): void {
  const p = keyPath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
