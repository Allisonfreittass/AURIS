// Shared types for IPC between main and renderer.
// Imported by both `electron/preload/index.ts` and `src/lib/ipc.ts`.

export type StatusKind = 'idle' | 'listening' | 'processing' | 'paused' | 'reconnecting' | 'error';

export interface StatusEvent {
  status: StatusKind;
  detail?: string;
}

/**
 * Who a transcript line came from.
 *
 * The sidecar reports the raw stream (`mic` / `loopback`); the main process
 * maps it to a speaker here. The mapping rests on one assumption worth
 * stating: the person running Auris is the seller, so their microphone is
 * `vendedor` and whatever comes out of their speakers is `cliente`.
 *
 * `mixed` is the legacy single-stream mode, where the two are summed and
 * attribution is impossible.
 */
export type TranscriptChannel = 'vendedor' | 'cliente' | 'mixed';

export interface TranscriptEvent {
  text: string;
  final: boolean;
  ts: number;
  /** ISO-639-1 code detected by Whisper for this segment (e.g. 'pt', 'en'). */
  lang?: string;
  /** Which side of the call spoke. Absent on sessions recorded before
   *  dual-channel capture existed. */
  channel?: TranscriptChannel;
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
  channel?: TranscriptChannel;
}

/** One committed action coming out of a call. */
export interface PostCallNextStep {
  acao: string;
  /** Who owns it. 'nos' = the seller's side. */
  responsavel: 'nos' | 'cliente';
  /** Only set when a deadline was actually spoken. */
  prazo: string | null;
}

/** A resistance the client raised, and what the seller actually answered.
 *  Deliberately descriptive: v1 records what happened and does not propose
 *  a better answer. */
export interface PostCallObjection {
  objecao: string;
  resposta_dada: string | null;
}

export interface PostCallFollowUp {
  /** Empty when the call gave nothing worth writing about. That is a valid
   *  outcome, not a generation failure — see `hasFollowUp`. */
  assunto: string;
  /** In the language of the call — this is what the seller sends. */
  corpo: string;
  /** Portuguese rendering of `corpo`, for display only, filled in when the
   *  call was not in Portuguese. Never sent; the seller sends `corpo`. */
  traducao_pt?: string;
}

/** Metadata that comes from code, never from the model: the clock, the
 *  channel tags and Whisper's language field. Nothing here can be
 *  hallucinated. */
export interface PostCallMeta {
  /** Epoch ms. */
  startedAt: number;
  /** Seconds between first and last transcript line. */
  durationSec: number;
  /** Dominant ISO-639-1 code across finals, or null when unknown. */
  lang: string | null;
  /** Which speakers actually appear in the transcript. */
  channels: TranscriptChannel[];
  /** True when the transcript was too long and only the tail was analyzed. */
  truncated: boolean;
}

/** True when there is an actual email to send. Both fields empty means the
 *  model was asked for a follow-up and correctly declined to invent one. */
export function hasFollowUp(f: PostCallFollowUp): boolean {
  return f.corpo.trim().length > 0;
}

export interface PostCallReport {
  resumo: string;
  proximos_passos: PostCallNextStep[];
  objecoes: PostCallObjection[];
  follow_up: PostCallFollowUp;
  meta: PostCallMeta;
  /** Epoch ms when this report was produced. */
  generatedAt: number;
  /** Prompt versions that produced it — so a bad report can be traced back
   *  to the prompt that wrote it. */
  promptVersions: { system: number; report: number };
}

/** A full session as written to disk. One file per session under
 *  `userData/sessions/<id>.json`. Upserted on every auto-save. */
export interface StoredSession {
  id: string;
  startedAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  transcripts: StoredTranscript[];
  /** Post-call record, present once generated. Absent until the user asks
   *  for it. */
  report?: PostCallReport;
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
  /** True when a post-call report has already been generated for it. Lets
   *  the list mark which calls still need one without loading every file. */
  hasReport: boolean;
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

  /** Generate the post-call record for a stored session and persist it into
   *  that session's file. Reads the transcript from disk rather than taking
   *  it as an argument, so there is one source of truth. Returns the report
   *  or a reason it could not be produced. */
  generatePostCall: (
    sessionId: string,
  ) => Promise<{ ok: true; report: PostCallReport } | { ok: false; error: string }>;

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

  /** Reads the running app's version string straight from the main
   *  process (Electron's `app.getVersion()`, sourced from package.json
   *  at build time). Single source of truth — avoids hardcoded
   *  defaults drifting out of sync after a release bump. */
  getAppVersion: () => Promise<string>;

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

  /** Fired when the rolling context is cleared, from any surface. Each window
   *  holds its own transcript, so they each have to drop it on this signal —
   *  clearing in one window is not visible to the others. */
  onContextCleared: (cb: () => void) => () => void;
}
