import { contextBridge, ipcRenderer } from 'electron';
import type {
  AurisApi,
  AudioErrorEvent,
  AurisMode,
  AuthOpResult,
  AuthState,
  DetectedQuestionEvent,
  PopupShape,
  SessionSummary,
  StatusEvent,
  StoredSession,
  SuggestionDelta,
  TranscriptEvent,
  QuotaInfo,
  UserInfo,
  UserProfile,
} from '../../shared/ipc';

const subscribe = <T>(channel: string, cb: (e: T) => void): (() => void) => {
  const listener = (_: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

const api: AurisApi = {
  start: () => ipcRenderer.invoke('auris:start'),
  stop: () => ipcRenderer.invoke('auris:stop'),
  minimize: () => ipcRenderer.invoke('auris:minimize'),
  minimizeToTray: () => ipcRenderer.invoke('auris:minimizeToTray'),
  showMainWindow: () => ipcRenderer.invoke('auris:showMainWindow'),
  setPopupShape: (shape: PopupShape) => ipcRenderer.invoke('auris:setPopupShape', shape),

  ask: (question: string) => ipcRenderer.invoke('auris:ask', question),
  cancelAsk: () => ipcRenderer.invoke('auris:cancelAsk'),
  clearContext: () => ipcRenderer.invoke('auris:clearContext'),
  saveSession: (content: string) =>
    ipcRenderer.invoke('auris:saveSession', content) as Promise<string | null>,
  saveSharePng: (bytes: Uint8Array, defaultName: string) =>
    ipcRenderer.invoke('auris:saveSharePng', bytes, defaultName) as Promise<string | null>,
  saveSessionHistory: (session: StoredSession) =>
    ipcRenderer.invoke('auris:saveSessionHistory', session) as Promise<void>,
  listSessions: () => ipcRenderer.invoke('auris:listSessions') as Promise<SessionSummary[]>,
  getSession: (id: string) =>
    ipcRenderer.invoke('auris:getSession', id) as Promise<StoredSession | null>,
  deleteSession: (id: string) =>
    ipcRenderer.invoke('auris:deleteSession', id) as Promise<void>,
  generatePostCall: (id: string) =>
    ipcRenderer.invoke('auris:generatePostCall', id) as ReturnType<
      AurisApi['generatePostCall']
    >,

  getMode: () => ipcRenderer.invoke('auris:getMode') as Promise<AurisMode>,
  setMode: (mode: AurisMode) => ipcRenderer.invoke('auris:setMode', mode),

  getIncognito: () => ipcRenderer.invoke('auris:getIncognito') as Promise<boolean>,
  setIncognito: (on: boolean) => ipcRenderer.invoke('auris:setIncognito', on),
  onIncognitoChange: (cb) => subscribe<boolean>('auris:incognito-changed', cb),

  getOnboardingDone: () =>
    ipcRenderer.invoke('auris:getOnboardingDone') as Promise<boolean>,
  setOnboardingDone: (done: boolean) =>
    ipcRenderer.invoke('auris:setOnboardingDone', done) as Promise<void>,

  getAppVersion: () => ipcRenderer.invoke('auris:getAppVersion') as Promise<string>,

  authState: () => ipcRenderer.invoke('auris:authState') as Promise<AuthState>,
  isSupabaseConfigured: () => ipcRenderer.invoke('auris:isSupabaseConfigured') as Promise<boolean>,
  signIn: (email: string, password: string) =>
    ipcRenderer.invoke('auris:signIn', email, password) as Promise<AuthOpResult>,
  signUp: (email: string, password: string) =>
    ipcRenderer.invoke('auris:signUp', email, password) as Promise<AuthOpResult>,
  signOut: () => ipcRenderer.invoke('auris:signOut'),
  currentUser: () => ipcRenderer.invoke('auris:currentUser') as Promise<UserInfo | null>,
  getProfile: () => ipcRenderer.invoke('auris:getProfile') as Promise<UserProfile | null>,
  getQuota: () => ipcRenderer.invoke('auris:getQuota') as Promise<QuotaInfo | null>,
  updateUserContext: (context: string | null) =>
    ipcRenderer.invoke('auris:updateUserContext', context) as Promise<{ ok: boolean; error?: string }>,
  getPreferredLang: () => ipcRenderer.invoke('auris:getPreferredLang') as Promise<string>,
  setPreferredLang: (lang: string) => ipcRenderer.invoke('auris:setPreferredLang', lang) as Promise<void>,
  onPreferredLangChange: (cb) => subscribe<string>('auris:preferred-lang-changed', cb),

  hasApiKey: () => ipcRenderer.invoke('auris:hasApiKey'),
  setApiKey: (key: string) => ipcRenderer.invoke('auris:setApiKey', key),
  clearApiKey: () => ipcRenderer.invoke('auris:clearApiKey'),

  onTranscript: (cb) => subscribe<TranscriptEvent>('auris:transcript', cb),
  onSuggestion: (cb) => subscribe<SuggestionDelta>('auris:suggestion', cb),
  onStatus: (cb) => subscribe<StatusEvent>('auris:status', cb),
  onError: (cb) => subscribe<AudioErrorEvent>('auris:error', cb),
  onDetectedQuestion: (cb) => subscribe<DetectedQuestionEvent>('auris:detected-question', cb),
  onContextCleared: (cb) => subscribe<null>('auris:context-cleared', () => cb()),
};

contextBridge.exposeInMainWorld('auris', api);
