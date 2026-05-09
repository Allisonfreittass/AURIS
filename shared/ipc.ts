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
  created_at: string;
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

  // Auth (Supabase)
  authState: () => Promise<AuthState>;
  isSupabaseConfigured: () => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<AuthOpResult>;
  signUp: (email: string, password: string) => Promise<AuthOpResult>;
  signOut: () => Promise<void>;
  currentUser: () => Promise<UserInfo | null>;
  getProfile: () => Promise<UserProfile | null>;

  // Ask Auris a question. Main process uses the rolling transcript buffer as
  // context and streams the response back via `onSuggestion`.
  ask: (question: string) => Promise<void>;
  cancelAsk: () => Promise<void>;

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
