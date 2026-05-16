import { app, BrowserWindow, ipcMain } from 'electron';
import Groq from 'groq-sdk';
import * as secrets from './secrets';
import * as auth from './auth';
import { saveSessionMarkdown, saveSharePng } from './sessionStore';
import * as history from './sessionHistory';
import type { AurisMode, AuthOpResult, PopupShape, StoredSession } from '../../shared/ipc';

/** Validate a Groq key by issuing a 1-token request before we persist it. */
async function validateApiKey(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!key.startsWith('gsk_')) {
    return { ok: false, error: 'Formato inválido. A chave deve começar com "gsk_".' };
  }
  try {
    const client = new Groq({ apiKey: key });
    await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
    return { ok: true };
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 401) return { ok: false, error: 'Chave rejeitada pela Groq (401).' };
    if (e.status === 403) return { ok: false, error: 'Chave sem permissão (403).' };
    return { ok: false, error: e.message ?? 'Erro desconhecido ao validar a chave.' };
  }
}

export interface IpcHooks {
  startSession: () => Promise<void>;
  stopSession: () => Promise<void>;
  minimize: () => void;
  minimizeToTray: () => void;
  showMainWindow: () => void;
  setPopupShape: (shape: PopupShape) => void;
  isRunning: () => boolean;
  ask: (question: string) => Promise<void>;
  cancelAsk: () => void;
  clearContext: () => void;
  /** Forces the main process to forget any cached LLM client so the next
   *  ask() reloads auth fresh — needed after sign in / sign out. */
  resetLlmClient: () => void;
  getMode: () => AurisMode;
  setMode: (mode: AurisMode) => void;
  getPreferredLang: () => string;
  setPreferredLang: (lang: string) => void;
  getIncognito: () => boolean;
  setIncognito: (on: boolean) => void;
  getOnboardingDone: () => boolean;
  setOnboardingDone: (done: boolean) => void;
}

export function registerIpcHandlers(_getWindow: () => BrowserWindow | null, hooks: IpcHooks) {
  // ── auth (Supabase) ────────────────────────────────────────────────
  ipcMain.handle('auris:authState', () => secrets.authState());
  ipcMain.handle('auris:isSupabaseConfigured', () => auth.isSupabaseConfigured());

  ipcMain.handle('auris:signIn', async (_evt, email: string, password: string): Promise<AuthOpResult> => {
    try {
      const session = await auth.signIn(email, password);
      hooks.resetLlmClient();
      return { ok: true, user: session.user };
    } catch (err: unknown) {
      const e = err as { message?: string; _authCode?: string };
      return { ok: false, code: e._authCode ?? 'unknown', error: e.message ?? 'Erro desconhecido.' };
    }
  });

  ipcMain.handle('auris:signUp', async (_evt, email: string, password: string): Promise<AuthOpResult> => {
    try {
      const session = await auth.signUp(email, password);
      hooks.resetLlmClient();
      return { ok: true, user: session.user };
    } catch (err: unknown) {
      const e = err as { message?: string; _authCode?: string };
      return { ok: false, code: e._authCode ?? 'unknown', error: e.message ?? 'Erro desconhecido.' };
    }
  });

  ipcMain.handle('auris:signOut', async () => {
    await auth.signOut();
    hooks.resetLlmClient();
  });

  ipcMain.handle('auris:currentUser', () => {
    const session = auth.loadSession();
    return session ? session.user : null;
  });

  ipcMain.handle('auris:getProfile', async () => {
    return auth.getProfile();
  });

  ipcMain.handle('auris:getQuota', async () => {
    return auth.getQuota();
  });

  ipcMain.handle('auris:updateUserContext', async (_evt, context: string | null) => {
    return auth.updateUserContext(context);
  });

  // ── legacy: bring-your-own Groq key ────────────────────────────────
  ipcMain.handle('auris:hasApiKey', () => secrets.hasApiKey());

  ipcMain.handle('auris:setApiKey', async (_evt, key: string) => {
    const trimmed = (key ?? '').trim();
    if (!trimmed) return { ok: false, error: 'Chave vazia.' };
    const result = await validateApiKey(trimmed);
    if (!result.ok) return result;
    try {
      secrets.saveApiKey(trimmed);
      hooks.resetLlmClient();
      return { ok: true } as const;
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('auris:clearApiKey', () => {
    secrets.clearApiKey();
    hooks.resetLlmClient();
  });

  // ── window controls ───────────────────────────────────────────────
  ipcMain.handle('auris:minimize', () => hooks.minimize());
  ipcMain.handle('auris:minimizeToTray', () => hooks.minimizeToTray());
  ipcMain.handle('auris:showMainWindow', () => hooks.showMainWindow());
  ipcMain.handle('auris:setPopupShape', (_evt, shape: PopupShape) => hooks.setPopupShape(shape));

  // ── session lifecycle ─────────────────────────────────────────────
  ipcMain.handle('auris:start', async () => {
    await hooks.startSession();
  });

  ipcMain.handle('auris:stop', async () => {
    await hooks.stopSession();
  });

  ipcMain.handle('auris:ask', async (_evt, question: string) => {
    await hooks.ask(question);
  });

  ipcMain.handle('auris:cancelAsk', () => {
    hooks.cancelAsk();
  });

  ipcMain.handle('auris:clearContext', () => {
    hooks.clearContext();
  });

  ipcMain.handle('auris:saveSession', (_evt, content: string) => {
    return saveSessionMarkdown(content);
  });

  ipcMain.handle(
    'auris:saveSharePng',
    (_evt, bytes: Uint8Array, defaultName: string) => saveSharePng(bytes, defaultName),
  );

  // ── session history (auto-saved on every change) ─────────────────
  ipcMain.handle('auris:saveSessionHistory', (_evt, session: StoredSession) => {
    history.saveSession(session);
  });
  ipcMain.handle('auris:listSessions', () => history.listSessions());
  ipcMain.handle('auris:getSession', (_evt, id: string) => history.getSession(id));
  ipcMain.handle('auris:deleteSession', (_evt, id: string) => history.deleteSession(id));

  ipcMain.handle('auris:getMode', () => hooks.getMode());
  ipcMain.handle('auris:setMode', (_evt, mode: AurisMode) => hooks.setMode(mode));

  ipcMain.handle('auris:getPreferredLang', () => hooks.getPreferredLang());
  ipcMain.handle('auris:setPreferredLang', (_evt, lang: string) => hooks.setPreferredLang(lang));

  ipcMain.handle('auris:getIncognito', () => hooks.getIncognito());
  ipcMain.handle('auris:setIncognito', (_evt, on: boolean) => hooks.setIncognito(on));

  ipcMain.handle('auris:getOnboardingDone', () => hooks.getOnboardingDone());
  ipcMain.handle('auris:setOnboardingDone', (_evt, done: boolean) =>
    hooks.setOnboardingDone(done),
  );

  ipcMain.handle('auris:getAppVersion', () => app.getVersion());
}
