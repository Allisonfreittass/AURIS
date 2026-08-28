import { useEffect, useRef, useState } from 'react';
import { TopBar } from './TopBar';
import { TranscriptStream } from './TranscriptStream';
import { Conversation, type Message } from './Conversation';
import { AmbientCanvas } from './AmbientCanvas';
import { AskInput, type AskInputHandle } from './AskInput';
import { AccountScreen } from './AccountScreen';
import { HistoryScreen } from './HistoryScreen';
import { ShareModal } from './ShareModal';
import { ConversationToolbar } from './ConversationToolbar';
import { ErrorBanner } from './ErrorBanner';
import { auris } from '../lib/ipc';
import type {
  AudioErrorEvent,
  AurisMode,
  StatusKind,
  TranscriptChannel,
} from '../../shared/ipc';
import { toMillis } from '../../shared/time';

/** How many transcript finals a session keeps. Sized to outlast a full
 *  call rather than just to bound memory — see the note at the push site. */
const MAX_TRANSCRIPT_ENTRIES = 2000;

type View = 'main' | 'account' | 'history';

interface Props {
  onSignedOut: () => void;
}

export function Overlay({ onSignedOut }: Props) {
  const [view, setView] = useState<View>('main');
  // Transcript section can be folded away when the user wants more room
  // for the chat. Defaults to expanded — the live audio is the whole
  // point, hide it only on demand.
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);

  const [status, setStatus] = useState<StatusKind>('idle');
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<AurisMode>('manual');

  const [partialLine, setPartialLine] = useState('');

  // Full history of transcript finals since last clear. Capped to keep
  // memory sane on multi-hour sessions; the same cap roughly tracks the
  // rolling buffer in main (`finals[]` in ClaudeStreamer).
  type TranscriptEntry = { text: string; ts: number; lang?: string; translated?: boolean; channel?: TranscriptChannel };
  const [transcriptHistory, setTranscriptHistory] = useState<TranscriptEntry[]>([]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);

  // Number of transcript finals captured since the last clearContext().
  // Used by the TopBar context indicator. The actual rolling buffer in
  // main is capped at 40, so we cap the visual at the same number.
  const [finalCount, setFinalCount] = useState(0);

  const [audioError, setAudioError] = useState<AudioErrorEvent | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [incognito, setIncognito] = useState(false);
  const [share, setShare] = useState<{ answer: string; question?: string } | null>(null);
  const [preferredLang, setPreferredLang] = useState('pt');
  const askInputRef = useRef<AskInputHandle>(null);

  // Session-history auto-save refs. Declared up here (above handlers that
  // touch them) to avoid any TDZ-ish ordering surprises.
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartedAtRef = useRef<number>(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initial mode pull from main process ─────────────────────────────
  useEffect(() => {
    auris.getMode().then(setMode).catch(() => {});
    auris.getIncognito().then(setIncognito).catch(() => {});
    auris.getPreferredLang().then(setPreferredLang).catch(() => {});
    const offIncog = auris.onIncognitoChange(setIncognito);
    const offLang = auris.onPreferredLangChange(setPreferredLang);
    return () => {
      offIncog();
      offLang();
    };
  }, []);

  // ── IPC subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    const offT = auris.onTranscript((e) => {
      if (e.final) {
        setPartialLine('');

        // Translation events upgrade the entry that was already pushed
        // (matched by `ts`); originals push a new entry.
        //
        // The cap has to outlast a whole call, not just bound memory: the
        // post-call report is generated from what got persisted here, so a
        // cap that trims the opening of a one-hour meeting produces a
        // summary that is quietly missing half the conversation. At roughly
        // 5-10 finals per minute, 2000 covers a three-hour call; the entries
        // are short strings, so the memory cost is negligible.
        setTranscriptHistory((prev) => {
          if (e.translated) {
            const out = prev.map((entry) =>
              entry.ts === e.ts
                ? { ...entry, text: e.text, translated: true, lang: e.lang ?? entry.lang }
                : entry,
            );
            return out;
          }
          const next = [
            ...prev,
            { text: e.text, ts: e.ts, lang: e.lang, translated: false, channel: e.channel },
          ];
          return next.length > MAX_TRANSCRIPT_ENTRIES
            ? next.slice(next.length - MAX_TRANSCRIPT_ENTRIES)
            : next;
        });

        if (!e.translated) {
          setFinalCount((c) => Math.min(c + 1, 40));
        }
      } else {
        setPartialLine(e.text);
      }
    });

    // Auto-mode: main detected a question and is firing the LLM. Append
    // a "detected" bubble + a placeholder Auris message that the upcoming
    // streamed deltas will fill in (same channel as manual asks).
    const offDQ = auris.onDetectedQuestion((e) => {
      const now = Date.now();
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: 'detected', text: e.text, ts: now },
        { id: makeId(), role: 'auris', text: '', ts: now, streaming: true },
      ]);
      setStreaming(true);
    });

    const offS = auris.onSuggestion((e) => {
      if (e.error) {
        setMessages((prev) =>
          updateLastAuris(prev, (m) => ({ ...m, streaming: false, error: e.error })),
        );
        // Surface to the global banner too (covers cases like rate-limit
        // where the user needs to know what happened beyond a single bubble).
        setLlmError(e.error);
        setStreaming(false);
        return;
      }
      // Successful response — clear any prior error.
      setLlmError(null);
      if (e.delta !== undefined) {
        setMessages((prev) =>
          updateLastAuris(prev, (m) => ({
            ...m,
            text: m.text + (e.delta ?? ''),
            streaming: true,
          })),
        );
        setStreaming(true);
      }
      if (e.done) {
        setMessages((prev) => {
          const updated = updateLastAuris(prev, (m) => ({ ...m, streaming: false }));
          // Drop "Auris said nothing" responses (auto-mode filter for noise).
          // Also remove the preceding 'detected' bubble so the conversation
          // doesn't fill up with floating quoted-questions that went unanswered.
          const last = updated[updated.length - 1];
          if (last && last.role === 'auris' && isEmptyResponse(last.text)) {
            const prevMsg = updated[updated.length - 2];
            if (prevMsg && prevMsg.role === 'detected') {
              return updated.slice(0, -2);
            }
            return updated.slice(0, -1);
          }
          return updated;
        });
        setStreaming(false);
      }
    });

    const offStat = auris.onStatus((e) => setStatus(e.status));
    const offErr = auris.onError((e) => setAudioError(e));

    return () => {
      offT();
      offDQ();
      offS();
      offStat();
      offErr();
    };
  }, []);

  // ── actions ──────────────────────────────────────────────────────────
  async function handleToggleRun() {
    if (isRunning) {
      // No auto-save dialog — that surprised users. Exporting is explicit
      // via the "Exportar" button in the conversation toolbar.
      await auris.stop();
      setIsRunning(false);
    } else {
      setAudioError(null);
      await auris.start();
      setIsRunning(true);
    }
  }

  function handleAskFired(question: string) {
    const now = Date.now();
    setMessages((prev) => [
      ...prev,
      { id: makeId(), role: 'user', text: question, ts: now },
      { id: makeId(), role: 'auris', text: '', ts: now, streaming: true },
    ]);
  }

  async function handleModeChange(next: AurisMode) {
    setMode(next);
    try {
      await auris.setMode(next);
    } catch (err) {
      console.error('failed to set mode', err);
    }
  }

  async function handleClearContext(partial: boolean = false) {
    if (partial) {
      // Keep the most recent user/auris exchange (last 2 messages) so a
      // follow-up question still has continuity. We DON'T touch the main
      // process's transcript buffer in this case — let the rolling window
      // age out naturally.
      setMessages((prev) => prev.slice(-2));
      setStreaming(false);
      return;
    }
    setMessages([]);
    setStreaming(false);
    setFinalCount(0);
    setTranscriptHistory([]);
    // Drop the active session id so the NEXT message/transcript starts a
    // fresh history entry. The just-cleared session was already on disk
    // from the last debounced save; we don't overwrite it.
    sessionIdRef.current = null;
    sessionStartedAtRef.current = 0;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    try {
      await auris.clearContext();
    } catch (err) {
      console.error('failed to clear context', err);
    }
  }

  async function handleExport() {
    if (messages.length === 0 && transcriptHistory.length === 0) return;
    const md = renderSessionAsMarkdown(messages, transcriptHistory);
    // Goes through main → writes under Documents/Auris/sessions/ and
    // reveals the file in Explorer. No browser download dialog.
    await auris.saveSession(md);
  }

  // Ctrl+L → limpar contexto (terminal convention).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        void handleClearContext(e.shiftKey);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-save current session to history ─────────────────────────
  // The renderer owns the session id for the duration of one "context
  // window" — it's reset when the user clears (Ctrl+L or button) or
  // auto-clears after idle. The first piece of content (message OR
  // transcript) generates an id; subsequent saves upsert by that id.
  // Debounced to 5s so a burst of streaming deltas results in one disk
  // write, not hundreds.
  useEffect(() => {
    if (messages.length === 0 && transcriptHistory.length === 0) return;
    if (sessionIdRef.current === null) {
      sessionIdRef.current =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStartedAtRef.current = Date.now();
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const id = sessionIdRef.current;
      if (!id) return;
      // Strip transient `streaming` flag — only final state goes to disk.
      const storedMessages = messages.map(({ id: mId, role, text, ts, error }) => ({
        id: mId, role, text, ts, ...(error ? { error } : {}),
      }));
      void auris.saveSessionHistory({
        id,
        startedAt: sessionStartedAtRef.current,
        updatedAt: Date.now(),
        messages: storedMessages,
        transcripts: transcriptHistory,
      }).catch((err) => console.warn('failed to save session history', err));
    }, 5000);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [messages, transcriptHistory]);

  // Auto-clear after N minutes of complete inactivity (no new transcript
  // finals + no asks). Resets the timer on any signal of activity. Default
  // 5 min; tweak the constant to taste.
  const lastActivityRef = useRef<number>(Date.now());
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, [messages, transcriptHistory, partialLine, streaming]);

  useEffect(() => {
    const IDLE_LIMIT_MS = 5 * 60 * 1000;
    idleTimerRef.current = setInterval(() => {
      if (messages.length === 0) return;
      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor >= IDLE_LIMIT_MS) {
        console.log('[overlay] auto-clearing context after idle');
        void handleClearContext(false);
      }
    }, 30_000);
    return () => {
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // ── render ───────────────────────────────────────────────────────────
  const empty = messages.length === 0;

  return (
    <div className="relative flex h-full w-full items-stretch justify-stretch overflow-hidden bg-bg">
      {/* Faint grid overlay — corporate-system feel, very subtle. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(rgba(37,45,56,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(37,45,56,0.5) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative flex w-full flex-col overflow-hidden">
        <TopBar
          status={status}
          isRunning={isRunning}
          onToggleRun={handleToggleRun}
          view={view}
          onOpenAccount={() => setView('account')}
          onCloseAccount={() => setView('main')}
          onOpenHistory={() => setView('history')}
          mode={mode}
          onModeChange={handleModeChange}
          contextCount={finalCount}
          incognito={incognito}
        />

        {view === 'account' ? (
          <AccountScreen onSignedOut={onSignedOut} />
        ) : view === 'history' ? (
          <HistoryScreen />
        ) : (
          <>
            <ErrorBanner
              audioError={audioError}
              llmError={llmError}
              onRetryAudio={async () => {
                setAudioError(null);
                if (!isRunning) {
                  await auris.start();
                  setIsRunning(true);
                }
              }}
              onDismissLlm={() => setLlmError(null)}
            />

            {/* Live transcript at the top — shown whenever there's
                content. Collapsible so the user can give the chat more
                room when they're focused on the conversation. */}
            {(transcriptHistory.length > 0 || partialLine) && (
              <TranscriptStream
                status={status}
                history={transcriptHistory}
                partialLine={partialLine}
                preferredLang={preferredLang}
                collapsed={transcriptCollapsed}
                onToggleCollapsed={() => setTranscriptCollapsed((v) => !v)}
              />
            )}

            {messages.length > 0 ? (
              <Conversation
                messages={messages}
                onShare={(answer, question) => setShare({ answer, question })}
              />
            ) : transcriptHistory.length === 0 ? (
              <AmbientCanvas
                status={status}
                isRunning={isRunning}
                mode={mode}
              />
            ) : null}

            <ConversationToolbar
              messageCount={messages.length}
              transcriptCount={transcriptHistory.length}
              onClearContext={handleClearContext}
              onExport={handleExport}
            />
            <AskInput
              ref={askInputRef}
              busy={streaming}
              onAsk={handleAskFired}
            />
          </>
        )}
      </div>

      {share && (
        <ShareModal
          answer={share.answer}
          question={share.question}
          onClose={() => setShare(null)}
        />
      )}
    </div>
  );
}

function updateLastAuris(
  msgs: Message[],
  fn: (m: Message) => Message,
): Message[] {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'auris') {
      const next = msgs.slice();
      next[i] = fn(msgs[i]);
      return next;
    }
  }
  return msgs;
}

/** Detect responses that effectively say "nothing useful" — used in auto
 *  mode to silently drop noise rather than show empty/dash messages. */
function isEmptyResponse(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return true;
  // Various dashes the model might produce when filtering.
  if (/^[—–-]+$/.test(t)) return true;
  if (t.length <= 3) return true;
  return false;
}

interface TranscriptEntry {
  text: string;
  ts: number;
  lang?: string;
  translated?: boolean;
  channel?: TranscriptChannel;
}

/** Render the session as a Markdown document for export. Includes both
 *  the live audio transcript (when there is one) and the Q&A conversation
 *  with Auris, in chronological order so the user gets a single document
 *  describing what they listened to + what they asked about it. */
function renderSessionAsMarkdown(
  msgs: Message[],
  transcripts: TranscriptEntry[],
): string {
  const earliest =
    Math.min(
      msgs[0]?.ts ?? Number.POSITIVE_INFINITY,
      transcripts[0]?.ts ?? Number.POSITIVE_INFINITY,
    ) || Date.now();
  const stamp = new Date(earliest).toLocaleString('pt-BR');

  const lines: string[] = [
    '# Sessão Auris',
    '',
    `_Iniciada em ${stamp}_`,
    '',
    '---',
    '',
  ];

  // Audio transcript section (skip if empty).
  if (transcripts.length > 0) {
    lines.push('## Transcrição do áudio');
    lines.push('');
    for (const t of transcripts) {
      const time = new Date(toMillis(t.ts)).toLocaleTimeString('pt-BR');
      const langTag = t.lang
        ? t.translated
          ? ` _[${t.lang} → traduzido]_`
          : ` _[${t.lang}]_`
        : '';
      lines.push(`- **${time}**${langTag} ${t.text}`);
    }
    lines.push('');
  }

  // Q&A conversation section (skip if empty).
  if (msgs.length > 0) {
    lines.push('## Conversa com Auris');
    lines.push('');
    for (const m of msgs) {
      const t = new Date(m.ts).toLocaleTimeString('pt-BR');
      if (m.role === 'user') {
        lines.push(`**Você** · ${t}`);
        lines.push('');
        lines.push(m.text);
      } else if (m.role === 'detected') {
        lines.push(`**Pergunta detectada no áudio** · ${t}`);
        lines.push('');
        lines.push(`> ${m.text}`);
      } else {
        lines.push(`**Auris** · ${t}`);
        lines.push('');
        lines.push(m.text || (m.error ? `_erro: ${m.error}_` : ''));
      }
      lines.push('');
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(`_Exportado em ${new Date().toLocaleString('pt-BR')} via Auris desktop_`);
  return lines.join('\n');
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
