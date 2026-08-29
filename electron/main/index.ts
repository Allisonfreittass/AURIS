import { app, BrowserWindow, globalShortcut, session } from 'electron';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { createOverlayWindow } from './window';
import { createPopupWindow, setPopupShape } from './popupWindow';
import { registerIpcHandlers } from './ipc';
import { SidecarSupervisor } from './sidecar';
import { observeFinal, resetEchoProbe } from './echoProbe';
import { ClaudeStreamer } from './claude';
import { createTray } from './tray';
import { setupAutoUpdater } from './updater';
import * as prefs from './prefs';
import * as secrets from './secrets';
import { translateText } from './translate';
import { normalizeLangCode } from '../../shared/lang';
import type { AurisMode, StatusKind, TranscriptEvent } from '../../shared/ipc';

// Load .env from project root in dev only. Production builds never ship a
// .env file — the key comes from safeStorage (per-user, encrypted) or, when
// the proxy backend lands, from a server URL + license token.
if (!app.isPackaged) {
  loadDotenv({ path: path.resolve(__dirname, '..', '..', '.env') });

  // Use a separate userData directory in dev so we don't fight the
  // installed production app (`%APPDATA%/Auris/`) for cache locks. On
  // Windows the filesystem is case-insensitive, so the default
  // `app.getName()`-based path collides with the productName-based one.
  app.setPath('userData', path.join(app.getPath('appData'), 'auris-dev'));
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

// Preferred display language for transcripts. Finals in any other detected
// language get translated via Groq before reaching the renderer. Default
// 'pt' (Brazilian Portuguese).
let preferredLang = 'pt';

// Debounced partial translation: when audio quiets and a partial has been
// sitting unchanged, translate it so the user doesn't stare at English
// until the segment finalizes (which can take seconds with our 500ms
// silence threshold + audio fade-outs).
let pendingPartial: TranscriptEvent | null = null;
let pendingPartialTimer: NodeJS.Timeout | null = null;
const PARTIAL_TRANSLATE_DEBOUNCE_MS = 1500;

/** Send an event to every live renderer (main overlay + popup). */
function send<T>(channel: string, payload: T) {
  for (const win of [mainWindow, popupWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

/** Decide popup visibility based on main window state. The popup is the
 *  minimized representation of the app — it appears whenever main is
 *  minimized, so the user can start/pause from it without restoring main.
 *
 *  States:
 *   - main visible            → popup hidden (controls live on main UI)
 *   - main minimized          → popup VISIBLE (control surface)
 *   - main hidden (close-to-tray) → popup hidden
 */
function refreshPopupVisibility() {
  if (!popupWindow || popupWindow.isDestroyed()) return;
  if (!mainWindow || mainWindow.isDestroyed()) {
    popupWindow.hide();
    return;
  }
  const shouldShow = mainWindow.isMinimized();
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

/**
 * If the transcribed final is in a foreign language, translate it via the
 * proxy and emit a SECOND `auris:transcript` event with the translation.
 * The renderer matches by ts to upgrade the originally-displayed text.
 *
 * Best-effort: failures are logged and silently dropped (the user keeps
 * seeing the original). Stays out of the hot path — runs async after we
 * already shipped the original transcript to the UI.
 */
async function maybeTranslateFinal(e: TranscriptEvent): Promise<void> {
  if (!e.lang) {
    console.log(`[i18n] skip — no lang detected: "${e.text.slice(0, 40)}"`);
    return;
  }
  // Whisper auto-detect returns full names ("english", "portuguese") OR
  // ISO codes depending on backend; normalize to a 2-letter code.
  const fromCode = normalizeLangCode(e.lang);
  if (fromCode === preferredLang) {
    console.log(`[i18n] skip — already in ${preferredLang} (got ${e.lang})`);
    return;
  }
  if (!e.text.trim()) {
    console.log('[i18n] skip — empty text');
    return;
  }

  const auth = await secrets.loadAuth();
  if (!auth) {
    console.warn('[i18n] skip — no auth available');
    return;
  }

  console.log(`[i18n] translating ${fromCode} → ${preferredLang}: "${e.text.slice(0, 60)}"`);
  try {
    const translated = await translateText(e.text, preferredLang, auth);
    if (!translated || translated === e.text) {
      console.warn('[i18n] empty / unchanged translation; dropping');
      return;
    }
    console.log(`[i18n] ✓ "${translated.slice(0, 60)}"`);
    send('auris:transcript', {
      text: translated,
      final: e.final,
      ts: e.ts,
      lang: fromCode,
      translated: true,
      original_text: e.text,
    } satisfies TranscriptEvent);
  } catch (err) {
    console.warn(`[i18n] failed (${fromCode}→${preferredLang}):`, (err as Error).message ?? err);
  }
}

/**
 * Translate the partial after a quiet period (no fresh partial events
 * for PARTIAL_TRANSLATE_DEBOUNCE_MS). Cancelled when a new partial
 * arrives or the segment finalizes — only the "settled" partial actually
 * fires the API call, so we don't burn quota on text that's about to
 * change.
 */
function schedulePartialTranslation(e: TranscriptEvent): void {
  if (!e.lang || !e.text.trim()) return;
  const fromCode = normalizeLangCode(e.lang);
  if (fromCode === preferredLang) return;

  pendingPartial = e;
  if (pendingPartialTimer) clearTimeout(pendingPartialTimer);
  pendingPartialTimer = setTimeout(async () => {
    const target = pendingPartial;
    pendingPartial = null;
    pendingPartialTimer = null;
    if (!target) return;

    const auth = await secrets.loadAuth();
    if (!auth) return;
    try {
      const translated = await translateText(target.text, preferredLang, auth);
      if (!translated || translated === target.text) return;
      send('auris:transcript', {
        text: translated,
        final: false, // still a partial — replaces the live ribbon
        ts: target.ts,
        lang: fromCode,
        translated: true,
        original_text: target.text,
      } satisfies TranscriptEvent);
    } catch (err) {
      console.warn(
        `[i18n partial] failed (${fromCode}→${preferredLang}):`,
        (err as Error).message ?? err,
      );
    }
  }, PARTIAL_TRANSLATE_DEBOUNCE_MS);
}

function cancelPendingPartialTranslation(): void {
  if (pendingPartialTimer) {
    clearTimeout(pendingPartialTimer);
    pendingPartialTimer = null;
  }
  pendingPartial = null;
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
        console.log(`[main] transcript ${tag} [${e.lang ?? '??'}]: ${preview}`);
        // Send the original immediately so the UI doesn't lag waiting for
        // a translation round-trip. If a translation lands later, we send
        // a follow-up event with `translated: true` so the renderer can
        // upgrade the displayed text.
        send('auris:transcript', e);

        if (e.final) {
          // Observation only — logs what an echo filter would have discarded
          // without discarding anything. Feeds the threshold tuning for the
          // real filter. See echoProbe.ts.
          observeFinal(e.channel, e.text, e.lang, e.ts);

          // A new final arrived — drop any partial we were about to translate;
          // the final supersedes it and gets the full translation pass below.
          cancelPendingPartialTranslation();

          if (claude) {
            // Translate finals in a foreign language so the user always sees
            // them in the preferred language.
            maybeTranslateFinal(e);

            // Always buffer into LLM context (used by both manual and auto).
            claude.pushFinal(e.text);

            if (currentMode === 'auto' && looksLikeQuestion(e.text) && shouldFireAuto(e.text)) {
              console.log(`[main] auto-detected question: ${preview}`);
              lastAutoFireAt = Date.now();
              lastAutoText = e.text.trim();
              send('auris:detected-question', { text: e.text, ts: e.ts });
              void claude.askFromAudio(e.text);
            }
          }
        } else {
          // Partial: schedule a debounced translation. If audio keeps coming,
          // each new partial resets the timer so we only translate the
          // *settled* text. This fixes the "last sentence stays in English"
          // gap that happens when the speaker pauses mid-thought and Whisper
          // doesn't fire a final for several seconds.
          schedulePartialTranslation(e);
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
    // Dual captures mic and loopback as two independent streams so each
    // transcript line carries who said it. That attribution is what makes a
    // post-call record possible: with loopback alone Auris never hears the
    // seller, only the client. Cost of it is two Whisper calls per moment of
    // speech instead of one.
    source: 'dual',
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
  resetEchoProbe();
  refreshPopupVisibility();
}

function toggleSession() {
  if (isRunning) void stopSession();
  else void startSession();
}

/** Apply the incognito flag to both windows and tell the renderers so
 *  their badges update. Safe to call before the windows exist (will be
 *  re-applied on creation). */
function applyIncognito(on: boolean): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setContentProtection(on);
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.setContentProtection(on);
  send('auris:incognito-changed', on);
  console.log(`[main] incognito → ${on ? 'on' : 'off'}`);
}

/** Global hotkey for toggling the session without focusing the app. The
 *  user can pause/resume from any other window — meeting, IDE, browser —
 *  without breaking flow. Logs a warning when the OS rejects the binding
 *  (typically because another app already grabbed it). */
const GLOBAL_TOGGLE_ACCELERATOR = 'CommandOrControl+Shift+Space';

function registerGlobalShortcuts() {
  const ok = globalShortcut.register(GLOBAL_TOGGLE_ACCELERATOR, toggleSession);
  if (!ok) {
    console.warn(
      `[main] failed to register global shortcut "${GLOBAL_TOGGLE_ACCELERATOR}" — ` +
        'another app may already be using it.',
    );
  } else {
    console.log(`[main] global shortcut registered: ${GLOBAL_TOGGLE_ACCELERATOR}`);
  }
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
    "img-src 'self' data: blob: http://localhost:5173",
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
    "img-src 'self' data: blob:",
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
    setPopupShape: (shape) => {
      if (popupWindow) setPopupShape(popupWindow, shape);
    },
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
    clearContext: () => {
      // Abort any in-flight stream + drop the rolling transcript buffer.
      // Auto-mode dedupe state is also reset so the very next detected
      // question fires fresh instead of being dropped as "duplicate".
      claude?.reset();
      lastAutoFireAt = 0;
      lastAutoText = '';
      // Every window keeps its own copy of the transcript, so clearing the
      // buffer in main is invisible to them. Without this broadcast the
      // popup went on showing a conversation the rest of the app had already
      // forgotten — the main window looked cleared, the overlay did not.
      send('auris:context-cleared', null);
      console.log('[main] context cleared');
    },
    getMode: () => currentMode,
    setMode: (mode) => {
      currentMode = mode;
      lastAutoFireAt = 0;
      lastAutoText = '';
      console.log(`[main] mode → ${mode}`);
    },
    getPreferredLang: () => preferredLang,
    setPreferredLang: (lang) => {
      preferredLang = lang;
      console.log(`[main] preferred language → ${lang}`);
      // Broadcast so the popup + main renderer can update the
      // translated-badge guard immediately, without re-fetching.
      send('auris:preferred-lang-changed', lang);
    },
    getIncognito: () => prefs.getIncognito(),
    setIncognito: (on) => {
      prefs.setIncognito(on);
      applyIncognito(on);
    },
    getOnboardingDone: () => prefs.getOnboardingDone(),
    setOnboardingDone: (done) => prefs.setOnboardingDone(done),
  });

  mainWindow = createOverlayWindow();
  popupWindow = createPopupWindow();

  // Apply persisted incognito setting at boot. Windows internally calls
  // SetWindowDisplayAffinity(WDA_MONITOR), which makes the window
  // invisible to screen capture (OBS, Zoom share, OS screenshots).
  applyIncognito(prefs.getIncognito());

  setupAutoUpdater(() => mainWindow);

  // Whenever main window changes visibility state, decide if popup should appear.
  mainWindow.on('minimize', refreshPopupVisibility);
  mainWindow.on('restore', refreshPopupVisibility);
  mainWindow.on('show', refreshPopupVisibility);
  mainWindow.on('hide', refreshPopupVisibility);
  mainWindow.on('focus', refreshPopupVisibility);

  createTray({
    show: showWindow,
    toggleRun: toggleSession,
    quit: () => {
      (globalThis as { __aurisQuitting?: boolean }).__aurisQuitting = true;
      app.quit();
    },
    isRunning: () => isRunning,
  });

  registerGlobalShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createOverlayWindow();
      popupWindow = createPopupWindow();
    }
  });
});

app.on('before-quit', () => {
  (globalThis as { __aurisQuitting?: boolean }).__aurisQuitting = true;
  globalShortcut.unregisterAll();
  sidecar?.stop();
  claude?.reset();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
