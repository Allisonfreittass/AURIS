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

  // Mode control — manual (user-driven) or auto (question-detection).
  getMode: () => Promise<AurisMode>;
  setMode: (mode: AurisMode) => Promise<void>;

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
