import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { createOverlayWindow } from './window';
import { createPopupWindow } from './popupWindow';
import { registerIpcHandlers } from './ipc';
import { SidecarSupervisor } from './sidecar';
import { ClaudeStreamer } from './claude';
import { createTray } from './tray';
import * as secrets from './secrets';
import type { AurisMode, StatusKind } from '../../shared/ipc';

// Load .env from project root in dev only. Production builds never ship a
// .env file — the key comes from safeStorage (per-user, encrypted) or, when
// the proxy backend lands, from a server URL + license token.
if (!app.isPackaged) {
  loadDotenv({ path: path.resolve(__dirname, '..', '..', '.env') });
}

let mainWindow: BrowserWindow | null = null;
let popupWindow: BrowserWindow | null = null;
let sidecar: SidecarSupervisor | null = null;
let claude: ClaudeStreamer | null = null;
let isRunning = false;
let tokenRefreshTimer: NodeJS.Timeout | null = null;

// Auto vs manual mode + auto-mode runtime state.
let currentMode: AurisMode = 'manual';
let lastAutoFireAt = 0;
let lastAutoText = '';
const AUTO_COOLDOWN_MS = 1500; // dedupe partials of same sentence
const AUTO_MIN_INTERVAL_MS = 800; // throttle bursts of detections

/** Send an event to every live renderer (main overlay + popup). */
function send<T>(channel: string, payload: T) {
  for (const win of [mainWindow, popupWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

/** Decide popup visibility based on the main window state and session state.
 *
 *  States:
 *   - main visible (any size)   → popup hidden (everything is on the main UI)
 *   - main minimized (taskbar)  → popup VISIBLE if running (the “Perssua mode”)
 *   - main hidden (closed to tray) → popup hidden (user wants no UI on screen)
 *   - no session running        → popup hidden (nothing to show)
 */
function refreshPopupVisibility() {
  if (!popupWindow || popupWindow.isDestroyed()) return;
  if (!mainWindow || mainWindow.isDestroyed()) {
    popupWindow.hide();
    return;
  }
  const shouldShow = mainWindow.isMinimized() && isRunning;
  if (shouldShow) {
    if (!popupWindow.isVisible()) popupWindow.showInactive();
  } else {
    if (popupWindow.isVisible()) popupWindow.hide();
  }
}

function status(s: StatusKind, detail?: string) {
  send('auris:status', { status: s, detail });
}

/**
 * Conservative heuristic: does this transcribed final look like an interlocutor
 * asking a question to the user? We bias toward false negatives (skip ambiguous
 * cases) over false positives (don't spam the LLM during ordinary narration).
 */
function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length < 6) return false;
  const wordCount = t.split(/\s+/).length;
  if (wordCount < 3) return false;

  // Strong signal: ends with `?`. Whisper-large-v3 punctuates questions reliably.
  if (t.endsWith('?')) return true;

  // Medium signal: starts with a Portuguese question word AND has body.
  if (wordCount < 5) return false;
  const lower = t.toLowerCase();
  const starters = [
    'o que', 'que ', 'qual ', 'quais ', 'quem ', 'quando ', 'onde ',
    'como ', 'por que', 'porque ', 'porquê', 'por quê',
    'quanto ', 'quanta ', 'quantos ', 'quantas ',
    'será que', 'tem como', 'me explica', 'me diz',
  ];
  return starters.some((s) => lower.startsWith(s));
}

/** Decide whether a freshly-detected question should fire the LLM. */
function shouldFireAuto(text: string): boolean {
  const now = Date.now();
  if (now - lastAutoFireAt < AUTO_MIN_INTERVAL_MS) return false;
  // Skip if it's effectively the same sentence as the last fire (dedupe
  // overlapping partial→final pairs).
  const trimmed = text.trim();
  if (
    lastAutoText &&
    now - lastAutoFireAt < AUTO_COOLDOWN_MS &&
    (trimmed.includes(lastAutoText) || lastAutoText.includes(trimmed))
  ) {
    return false;
  }
  return true;
}

async function ensureClaude(): Promise<boolean> {
  if (claude) return true;
  const auth = await secrets.loadAuth();
  if (!auth) {
    send('auris:error', {
      code: 'no_api_key',
      message:
        'Sem credenciais. Faça login (ou defina GROQ_API_KEY / AURIS_PROXY_URL no .env).',
    });
    return false;
  }
  claude = new ClaudeStreamer(
    () => secrets.loadAuth(),
    { onSuggestion: (e) => send('auris:suggestion', e) },
    auth,
  );
  return true;
}

async function startSession() {
  if (isRunning) return;
  if (!(await ensureClaude())) return;
  // Refresh popup at the end since visibility depends on isRunning.


  if (!sidecar) {
    sidecar = new SidecarSupervisor({
      onReady: () => {
        console.log('[main] sidecar ready');
        status('listening');
      },
      onTranscript: (e) => {
        const tag = e.final ? 'FINAL' : 'partial';
        const preview = e.text.length > 80 ? e.text.slice(0, 80) + '…' : e.text;
        console.log(`[main] transcript ${tag}: ${preview}`);
        send('auris:transcript', e);

        if (e.final && claude) {
          // Always buffer into LLM context (used by both manual and auto).
          claude.pushFinal(e.text);

          // Auto mode: detect questions in the audio and proactively answer.
          if (currentMode === 'auto' && looksLikeQuestion(e.text) && shouldFireAuto(e.text)) {
            console.log(`[main] auto-detected question: ${preview}`);
            lastAutoFireAt = Date.now();
            lastAutoText = e.text.trim();
            send('auris:detected-question', { text: e.text, ts: e.ts });
            void claude.askFromAudio(e.text);
          }
        }
      },
      onError: (e) => {
        console.error(`[main] sidecar error code=${e.code}: ${e.message}`);
        send('auris:error', e);
        status('error', e.message);
      },
      onStopped: () => {
        console.log('[main] sidecar stopped');
        if (isRunning) status('reconnecting');
      },
    });
  }

  isRunning = true;
  status('listening');

  // Snapshot the current auth so the sidecar uses the same backend as the
  // chat client. Remote Whisper requires both proxy URL + a fresh token;
  // anything else falls back to local faster-whisper.
  const auth = await secrets.loadAuth();
  const useRemoteWhisper = auth?.mode === 'proxy';
  if (useRemoteWhisper) {
    console.log(`[main] starting sidecar in remote-whisper mode → ${auth.url}`);
    if (auth.url.includes(':5173')) {
      console.warn(
        '[main] WARNING: AURIS_PROXY_URL points at :5173 (the Vite dev server). ' +
          'You probably meant :8787 (the auris-proxy worker). Check your .env.',
      );
    }
  } else {
    console.log('[main] starting sidecar in local-whisper mode');
  }
  sidecar.start({
    source: 'loopback',
    proxyUrl: useRemoteWhisper ? auth.url : null,
    authToken: useRemoteWhisper ? auth.token : null,
  });

  // Push a refreshed Supabase token to the sidecar every 30 min so its
  // Whisper calls don't 401 mid-recording (access tokens last 1h).
  // No-op when the sidecar is on local backend.
  if (tokenRefreshTimer) clearInterval(tokenRefreshTimer);
  tokenRefreshTimer = setInterval(async () => {
    if (!isRunning || !sidecar) return;
    const fresh = await secrets.loadAuth();
    if (fresh?.mode === 'proxy') {
      sidecar.setToken(fresh.token);
    }
  }, 30 * 60 * 1000);

  refreshPopupVisibility();
}

async function stopSession() {
  if (!isRunning) return;
  isRunning = false;
  status('paused');
  if (tokenRefreshTimer) {
    clearInterval(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
  sidecar?.stop();
  claude?.reset();
  refreshPopupVisibility();
}

// CSP applied at session level. In dev we relax it just enough for Vite's
// HMR client (inline modules + WebSocket); in production we keep it tight.
function installCsp() {
  const isDev = !app.isPackaged;

  const devCsp = [
    "default-src 'self'",
    // Vite injects inline <script type=module> tags and uses eval for HMR.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: http://localhost:5173",
    // ws: needed for HMR socket; localhost for dev server fetches.
    "connect-src 'self' ws://localhost:5173 http://localhost:5173 https://fonts.googleapis.com https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  const prodCsp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [isDev ? devCsp : prodCsp],
      },
    });
  });
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

// Single-instance lock: clicking the taskbar / launcher again brings the
// existing window forward instead of spawning a duplicate process.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

app.whenReady().then(() => {
  installCsp();

  registerIpcHandlers(() => mainWindow, {
    startSession,
    stopSession,
    minimize: () => mainWindow?.minimize(),
    minimizeToTray: () => mainWindow?.hide(),
    showMainWindow: showWindow,
    isRunning: () => isRunning,
    resetLlmClient: () => {
      claude?.reset();
      claude = null;
    },
    ask: async (question: string) => {
      if (!(await ensureClaude())) return;
      status('processing');
      try {
        await claude!.ask(question);
      } finally {
        if (isRunning) status('listening');
      }
    },
    cancelAsk: () => {
      claude?.cancelInflight();
      if (isRunning) status('listening');
    },
    getMode: () => currentMode,
    setMode: (mode) => {
      currentMode = mode;
      // Reset auto-mode dedupe state when switching to avoid stale fires.
      lastAutoFireAt = 0;
      lastAutoText = '';
      console.log(`[main] mode → ${mode}`);
    },
  });

  mainWindow = createOverlayWindow();
  popupWindow = createPopupWindow();

  // Whenever main window changes visibility state, decide if popup should appear.
  mainWindow.on('minimize', refreshPopupVisibility);
  mainWindow.on('restore', refreshPopupVisibility);
  mainWindow.on('show', refreshPopupVisibility);
  mainWindow.on('hide', refreshPopupVisibility);
  mainWindow.on('focus', refreshPopupVisibility);

  createTray({
    show: showWindow,
    toggleRun: () => {
      if (isRunning) void stopSession();
      else void startSession();
    },
    quit: () => {
      (globalThis as { __aurisQuitting?: boolean }).__aurisQuitting = true;
      app.quit();
    },
    isRunning: () => isRunning,
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createOverlayWindow();
      popupWindow = createPopupWindow();
    }
  });
});

app.on('before-quit', () => {
  (globalThis as { __aurisQuitting?: boolean }).__aurisQuitting = true;
  sidecar?.stop();
  claude?.reset();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
