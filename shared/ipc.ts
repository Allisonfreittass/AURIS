// Shared types for IPC between main and renderer.
// Imported by both `electron/preload/index.ts` and `src/lib/ipc.ts`.

export type StatusKind = 'idle' | 'listening' | 'processing' | 'paused' | 'reconnecting' | 'error';

export interface StatusEvent {
  status: StatusKind;
  detail?: string;
}

export interface TranscriptEvent {
  text: string;
  final: boolean;
  ts: number;
  /** ISO-639-1 code detected by Whisper for this segment (e.g. 'pt', 'en'). */
  lang?: string;
  /** True when `text` is a translation; `original_text` holds the source. */
  translated?: boolean;
  original_text?: string;
}

export interface SuggestionDelta {
  delta?: string;
  done?: boolean;
  error?: string;
}

export interface AudioErrorEvent {
  code: string;
  message: string;
}

export type AuthState = 'authed' | 'needs-login' | 'needs-key';

/**
 * Two operating modes:
 *  - 'manual': user types questions; Auris answers using the rolling
 *    transcript as context. Default.
 *  - 'auto':   Auris watches the transcript stream for incoming questions
 *    addressed to the user (e.g., interview, sales call, debate) and
 *    proactively suggests an answer.
 */
export type AurisMode = 'manual' | 'auto';

/** Possible visual states of the floating popup overlay. The popup window
 *  resizes itself based on this state — `idle` is just a 72×72 icon, while
 *  the active states grow to fit transcription and response cards. */
export type PopupShape = 'idle' | 'compact' | 'expanded';

export interface DetectedQuestionEvent {
  text: string;
  ts: number;
}

export interface UserInfo {
  id: string;
  email: string;
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

export type AuthOpResult =
  | { ok: true; user: UserInfo }
  | { ok: false; code: string; error: string };

/** Message shape persisted to a session history file. Mirrors the
 *  `Message` used by the Conversation component but drops the transient
 *  `streaming` flag — only the final text is kept on disk. */
export interface StoredMessage {
  id: string;
  role: 'user' | 'detected' | 'auris';
  text: string;
  ts: number;
  error?: string;
}

/** Transcript final entry persisted to a session history file. */
export interface StoredTranscript {
  text: string;
  ts: number;
  lang?: string;
  translated?: boolean;
}

/** A full session as written to disk. One file per session under
 *  `userData/sessions/<id>.json`. Upserted on every auto-save. */
export interface StoredSession {
  id: string;
  startedAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  transcripts: StoredTranscript[];
}

/** Lightweight summary for the history list view. Avoids loading every
 *  message just to render the list. */
export interface SessionSummary {
  id: string;
  startedAt: number;
  updatedAt: number;
  messageCount: number;
  transcriptCount: number;
  /** First user/detected question or first transcript line, truncated. */
  preview: string;
}

export interface AurisApi {
  // Lifecycle
  start: () => Promise<void>;
  stop: () => Promise<void>;
  minimize: () => Promise<void>;        // standard minimize — stays in taskbar
  minimizeToTray: () => Promise<void>;  // close-to-tray — disappears from taskbar
  showMainWindow: () => Promise<void>;  // restore + focus the main overlay (used by popup)
  setPopupShape: (shape: PopupShape) => Promise<void>;  // popup self-resizes by reporting its state

  // Auth (Supabase)
  authState: () => Promise<AuthState>;
  isSupabaseConfigured: () => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<AuthOpResult>;
  signUp: (email: string, password: string) => Promise<AuthOpResult>;
  signOut: () => Promise<void>;
  currentUser: () => Promise<UserInfo | null>;
  getProfile: () => Promise<UserProfile | null>;
  getQuota: () => Promise<QuotaInfo | null>;
  /** Update the user's free-text context (profession, focus, etc.).
   *  Auris injects this into every ask so responses adapt. Pass null to
   *  clear the field. */
  updateUserContext: (context: string | null) => Promise<{ ok: boolean; error?: string }>;
  /** Get/set the user's preferred display language (ISO 639-1). When the
   *  detected audio language differs, finals are auto-translated before
   *  the renderer sees them. Stored in main process memory + persisted to
   *  the OS user settings. */
  getPreferredLang: () => Promise<string>;
  setPreferredLang: (lang: string) => Promise<void>;
  /** Fired when the preferred display language changes. Renderers use
   *  this to keep the translated-badge guard in sync. */
  onPreferredLangChange: (cb: (lang: string) => void) => () => void;

  // Ask Auris a question. Main process uses the rolling transcript buffer as
  // context and streams the response back via `onSuggestion`.
  ask: (question: string) => Promise<void>;
  cancelAsk: () => Promise<void>;
  /** Clear the rolling transcript context (`finals[]` in ClaudeStreamer)
   *  and abort any in-flight LLM stream. Used by the "Limpar conversa"
   *  action so the next question starts from a blank slate. */
  clearContext: () => Promise<void>;

  /** Save Markdown content as a session file under
   *  `Documents/Auris/sessions/`, then reveal it in the OS file manager.
   *  Returns the absolute path or null on failure. */
  saveSession: (content: string) => Promise<string | null>;

  /** Persist a PNG buffer through the OS Save dialog. Used by the share
   *  flow so users get a real native picker (not a forced location).
   *  Returns the saved absolute path or null if cancelled. */
  saveSharePng: (bytes: Uint8Array, defaultName: string) => Promise<string | null>;

  /** Auto-save the current session to history. Upserts by `id`. The main
   *  process writes to `userData/sessions/<id>.json`. Renderer calls this
   *  on a debounced timer; no user action required. */
  saveSessionHistory: (session: StoredSession) => Promise<void>;

  /** Return a summary of all sessions in history, newest first. Caps at
   *  100 entries to keep the list manageable in the UI. */
  listSessions: () => Promise<SessionSummary[]>;

  /** Load a full session by ID. Returns null if missing or unparseable. */
  getSession: (id: string) => Promise<StoredSession | null>;

  /** Remove a session file from history. */
  deleteSession: (id: string) => Promise<void>;

  // Mode control — manual (user-driven) or auto (question-detection).
  getMode: () => Promise<AurisMode>;
  setMode: (mode: AurisMode) => Promise<void>;

  /** Incognito mode: when on, both windows are excluded from screen
   *  captures (OBS, Zoom screen share, OS screenshots). Backed by
   *  `BrowserWindow.setContentProtection`. Persisted across launches. */
  getIncognito: () => Promise<boolean>;
  setIncognito: (on: boolean) => Promise<void>;
  /** Fired whenever incognito state changes (incl. toggles from another
   *  surface like the popup). Renderers use this to keep their badges in
   *  sync without polling. */
  onIncognitoChange: (cb: (on: boolean) => void) => () => void;

  /** Onboarding completion flag — true once the user finished or
   *  skipped the first-run tour. Persisted across launches. */
  getOnboardingDone: () => Promise<boolean>;
  setOnboardingDone: (done: boolean) => Promise<void>;

  // API key management
  hasApiKey: () => Promise<boolean>;
  setApiKey: (key: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  clearApiKey: () => Promise<void>;

  // Streams (subscribe; returns an unsubscribe function)
  onTranscript: (cb: (e: TranscriptEvent) => void) => () => void;
  onSuggestion: (cb: (e: SuggestionDelta) => void) => () => void;
  onStatus: (cb: (e: StatusEvent) => void) => () => void;
  onError: (cb: (e: AudioErrorEvent) => void) => () => void;
  /** Fired in auto mode whenever Auris decides a transcribed final is a
   *  question being asked to the user and is about to suggest an answer. */
  onDetectedQuestion: (cb: (e: DetectedQuestionEvent) => void) => () => void;
}
