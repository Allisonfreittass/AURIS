import { useEffect, useRef, useState } from 'react';
import { TopBar } from './TopBar';
import { LiveRibbon } from './LiveRibbon';
import { Conversation, type Message } from './Conversation';
import { EmptyState } from './EmptyState';
import { AskInput, type AskInputHandle } from './AskInput';
import { AccountScreen } from './AccountScreen';
import { ErrorBanner } from './ErrorBanner';
import { auris } from '../lib/ipc';
import type { AudioErrorEvent, AurisMode, StatusKind } from '../../shared/ipc';

type View = 'main' | 'account';

interface Props {
  onSignedOut: () => void;
}

export function Overlay({ onSignedOut }: Props) {
  const [view, setView] = useState<View>('main');

  const [status, setStatus] = useState<StatusKind>('idle');
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<AurisMode>('manual');

  const [latestFinal, setLatestFinal] = useState('');
  const [partialLine, setPartialLine] = useState('');

  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);

  const [audioError, setAudioError] = useState<AudioErrorEvent | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);
  const askInputRef = useRef<AskInputHandle>(null);

  // ── Initial mode pull from main process ─────────────────────────────
  useEffect(() => {
    auris.getMode().then(setMode).catch(() => {});
  }, []);

  // ── IPC subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    const offT = auris.onTranscript((e) => {
      if (e.final) {
        setLatestFinal(e.text);
        setPartialLine('');
      } else {
        setPartialLine(e.text);
      }
    });

    // Auto-mode: main detected a question and is firing the LLM. Append
    // a "detected" bubble + a placeholder Auris message that the upcoming
    // streamed deltas will fill in (same channel as manual asks).
    const offDQ = auris.onDetectedQuestion((e) => {
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: 'detected', text: e.text },
        { id: makeId(), role: 'auris', text: '', streaming: true },
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
      await auris.stop();
      setIsRunning(false);
    } else {
      setAudioError(null);
      await auris.start();
      setIsRunning(true);
    }
  }

  function handleAskFired(question: string) {
    setMessages((prev) => [
      ...prev,
      { id: makeId(), role: 'user', text: question },
      { id: makeId(), role: 'auris', text: '', streaming: true },
    ]);
  }

  function handlePickExample(text: string) {
    askInputRef.current?.setText(text);
  }

  async function handleModeChange(next: AurisMode) {
    setMode(next);
    try {
      await auris.setMode(next);
    } catch (err) {
      console.error('failed to set mode', err);
    }
  }

  // ── render ───────────────────────────────────────────────────────────
  const empty = messages.length === 0;

  return (
    <div className="relative flex h-full w-full items-stretch justify-stretch overflow-hidden bg-bg">
      {/* atmospheric background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="absolute -left-24 top-12 h-64 w-64 rounded-full bg-brand-to/[0.05] blur-[100px]" />
        <span className="absolute -right-32 bottom-24 h-80 w-80 rounded-full bg-accent/[0.04] blur-[120px]" />
      </div>

      <div className="relative flex w-full flex-col overflow-hidden">
        <TopBar
          status={status}
          isRunning={isRunning}
          onToggleRun={handleToggleRun}
          view={view}
          onOpenAccount={() => setView('account')}
          onCloseAccount={() => setView('main')}
          mode={mode}
          onModeChange={handleModeChange}
        />

        {view === 'account' ? (
          <AccountScreen onSignedOut={onSignedOut} />
        ) : (
          <>
            <LiveRibbon
              status={status}
              partialLine={partialLine}
              latestFinal={latestFinal}
            />

            <div className="h-px w-full bg-white/[0.04]" />

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

            {empty ? (
              <EmptyState
                isRunning={isRunning}
                mode={mode}
                onModeChange={handleModeChange}
                onPickExample={handlePickExample}
              />
            ) : (
              <Conversation messages={messages} />
            )}

            <AskInput
              ref={askInputRef}
              busy={streaming}
              onAsk={handleAskFired}
            />
          </>
        )}
      </div>
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

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
