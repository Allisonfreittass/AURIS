import { contextBridge, ipcRenderer } from 'electron';
import type {
  AurisApi,
  AudioErrorEvent,
  AurisMode,
  AuthOpResult,
  AuthState,
  DetectedQuestionEvent,
  StatusEvent,
  SuggestionDelta,
  TranscriptEvent,
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

  ask: (question: string) => ipcRenderer.invoke('auris:ask', question),
  cancelAsk: () => ipcRenderer.invoke('auris:cancelAsk'),

  getMode: () => ipcRenderer.invoke('auris:getMode') as Promise<AurisMode>,
  setMode: (mode: AurisMode) => ipcRenderer.invoke('auris:setMode', mode),

  authState: () => ipcRenderer.invoke('auris:authState') as Promise<AuthState>,
  isSupabaseConfigured: () => ipcRenderer.invoke('auris:isSupabaseConfigured') as Promise<boolean>,
  signIn: (email: string, password: string) =>
    ipcRenderer.invoke('auris:signIn', email, password) as Promise<AuthOpResult>,
  signUp: (email: string, password: string) =>
    ipcRenderer.invoke('auris:signUp', email, password) as Promise<AuthOpResult>,
  signOut: () => ipcRenderer.invoke('auris:signOut'),
  currentUser: () => ipcRenderer.invoke('auris:currentUser') as Promise<UserInfo | null>,
  getProfile: () => ipcRenderer.invoke('auris:getProfile') as Promise<UserProfile | null>,

  hasApiKey: () => ipcRenderer.invoke('auris:hasApiKey'),
  setApiKey: (key: string) => ipcRenderer.invoke('auris:setApiKey', key),
  clearApiKey: () => ipcRenderer.invoke('auris:clearApiKey'),

  onTranscript: (cb) => subscribe<TranscriptEvent>('auris:transcript', cb),
  onSuggestion: (cb) => subscribe<SuggestionDelta>('auris:suggestion', cb),
  onStatus: (cb) => subscribe<StatusEvent>('auris:status', cb),
  onError: (cb) => subscribe<AudioErrorEvent>('auris:error', cb),
  onDetectedQuestion: (cb) => subscribe<DetectedQuestionEvent>('auris:detected-question', cb),
};

contextBridge.exposeInMainWorld('auris', api);
