import { useEffect, useRef, useState } from 'react';
import { AurisIconMark } from './logo/AurisIconMark';
import { auris } from '../lib/ipc';
import type { AurisMode, PopupShape, StatusKind } from '../../shared/ipc';

const STATUS_LABEL: Record<StatusKind, string> = {
  idle: 'pronto',
  listening: 'ouvindo',
  processing: 'pensando',
  paused: 'pausado',
  reconnecting: 'reconectando',
  error: 'erro',
};

/**
 * Floating popup at top-center of the primary display.
 *
 * Two visual layouts gated by the `shape` derived state:
 *   - 'idle'      → just a 72×72 floating icon, no card chrome
 *   - 'compact'   → status header + 1-line transcript
 *   - 'expanded'  → header + detected-question banner + multi-line response
 *
 * The renderer reports the desired shape to main via `auris.setPopupShape`,
 * which physically resizes the BrowserWindow. Transitions are animated by
 * Electron on Windows.
 *
 * `focusable: false` on the BrowserWindow keeps keyboard focus on whatever
 * app the user is actually working in.
 */
interface TranscriptEntry {
  text: string;
  ts: number;
  lang?: string;
  translated?: boolean;
}

const MAX_HISTORY = 50;

export function PopupOverlay() {
  const [status, setStatus] = useState<StatusKind>('idle');
  const [mode, setMode] = useState<AurisMode>('manual');
  const [history, setHistory] = useState<TranscriptEntry[]>([]);
  const [partial, setPartial] = useState('');
  const [detectedQuestion, setDetectedQuestion] = useState<string | null>(null);
  const [response, setResponse] = useState('');
  const [streaming, setStreaming] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  // Tail-follow only when the user is already near the bottom — otherwise
  // they're reading older lines and we shouldn't yank them back down.
  const stickToBottom = useRef(true);

  useEffect(() => {
    auris.getMode().then(setMode).catch(() => {});

    const offT = auris.onTranscript((e) => {
      if (e.final) {
        setPartial('');
        setHistory((prev) => {
          // Translation event: upgrade existing entry by ts.
          if (e.translated) {
            return prev.map((entry) =>
              entry.ts === e.ts
                ? { ...entry, text: e.text, translated: true, lang: e.lang ?? entry.lang }
                : entry,
            );
          }
          const next = [...prev, { text: e.text, ts: e.ts, lang: e.lang, translated: false }];
          return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
        });
      } else {
        setPartial(e.text);
      }
    });
    const offDQ = auris.onDetectedQuestion((e) => {
      setDetectedQuestion(e.text);
      setResponse('');
      setStreaming(true);
    });
    const offS = auris.onSuggestion((e) => {
      if (e.error) {
        setStreaming(false);
        return;
      }
      if (e.delta !== undefined) {
        setResponse((prev) => prev + e.delta);
        setStreaming(true);
      }
      if (e.done) setStreaming(false);
    });
    const offStat = auris.onStatus((e) => setStatus(e.status));
    return () => {
      offT();
      offDQ();
      offS();
      offStat();
    };
  }, []);

  useEffect(() => {
    const el = responseRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [response]);

  // ── Derive the shape and notify main to resize the window ──────────────
  const showResponse = streaming || Boolean(response);
  const showTranscript = !showResponse && (history.length > 0 || Boolean(partial));

  const shape: PopupShape = showResponse
    ? 'expanded'
    : showTranscript
      ? 'compact'
      : 'idle';

  useEffect(() => {
    void auris.setPopupShape(shape);
  }, [shape]);

  // Track whether the user has scrolled away from the bottom of the
  // transcript pane. If they have, new arrivals don't pull them down.
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottom.current = distance < 60;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [showTranscript]);

  // Tail-follow the transcript stream as new finals arrive — but only
  // when the user is already at the bottom.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [history, partial]);

  const animate = status === 'listening' || status === 'processing';

  // ── Idle: just the floating icon, no card ──────────────────────────────
  if (shape === 'idle') {
    return <IdleIcon animate={animate} status={status} />;
  }

  // ── Active: full card with header + content ────────────────────────────
  return (
    <div className="drag flex h-full w-full items-stretch justify-stretch p-2">
      <div className="relative flex w-full flex-col overflow-hidden rounded-soft border border-border bg-bg shadow-pop">
        {/* Top hairline accent — single-pixel blue line, signature of the
            corporate-system identity. */}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-accent/40" />

        <header className="flex items-center gap-2.5 border-b border-border bg-surface px-3 py-2">
          <AurisIconMark className="h-[14px] w-[14px]" alive={animate} />
          <span className="font-sans text-[12px] font-semibold tracking-[-0.005em] text-text leading-none">
            Auris<span className="text-accent">.</span>
          </span>
          <DotStatus status={status} />
          {mode === 'auto' && (
            <span className="rounded-sharp border border-live/40 bg-live/[0.08] px-1.5 py-0.5 font-mono text-[8px] font-medium uppercase tracking-widest text-live">
              auto
            </span>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => auris.showMainWindow()}
            title="Abrir janela principal"
            aria-label="Abrir janela principal"
            className="no-drag grid h-5 w-5 place-items-center rounded-sharp text-muted transition-colors hover:bg-elevated hover:text-text"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
              <path
                d="M2 2h5v5M2 7L7 2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </button>
        </header>

        <div
          ref={showResponse ? responseRef : transcriptRef}
          className="no-drag auris-scroll flex-1 overflow-y-auto px-3 pb-2.5 pt-2 leading-[1.6]"
        >
          {detectedQuestion && showResponse && (
            <div className="mb-2 rounded-sharp border border-live/25 bg-live/[0.06] px-2 py-1.5 font-sans text-[11px] italic font-light leading-tight text-light">
              “{truncate(detectedQuestion, 90)}”
            </div>
          )}

          {showTranscript && (
            <span className="font-mono text-[11px] text-subtle">
              {history.map((entry, i) => (
                <span key={i} className="inline">
                  {entry.translated && entry.lang && (
                    <span className="mr-0.5 inline-block translate-y-[-1px] rounded-sharp border border-accent/30 bg-accent/[0.08] px-1 py-0.5 align-middle font-mono text-[7px] uppercase tracking-widest text-accent">
                      ↻ {entry.lang}
                    </span>
                  )}
                  <span className="text-light">{entry.text}</span>{' '}
                </span>
              ))}
              {partial && (
                <span className="text-text">
                  {partial}
                  <span className="ml-0.5 inline-block h-[0.85em] w-[1.5px] -translate-y-[0.05em] bg-text/70 align-middle animate-caret-blink" />
                </span>
              )}
            </span>
          )}
          {showResponse && (
            <span className="font-sans text-[11.5px] text-light">
              <ResponseInline text={response} streaming={streaming} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** The 72×72 idle popup. Pure floating icon, no card. Click forwards focus
 *  to the main window so the user can come back to the app quickly. */
function IdleIcon({
  animate,
  status,
}: {
  animate: boolean;
  status: StatusKind;
}) {
  const ringColor =
    status === 'listening'    ? 'bg-live/40'
    : status === 'processing' ? 'bg-accent/40'
    : 'bg-muted/25';

  return (
    <div className="drag flex h-full w-full items-center justify-center">
      <button
        type="button"
        onClick={() => auris.showMainWindow()}
        aria-label="Abrir Auris"
        title="Abrir Auris"
        className="no-drag relative grid h-12 w-12 place-items-center rounded-sharp border border-border bg-bg shadow-pop transition-colors hover:border-subtle/40"
      >
        {animate && (
          <>
            <span
              className={`absolute inset-0 rounded-sharp ${ringColor} animate-sound-wave pointer-events-none`}
              style={{ animationDelay: '0s' }}
            />
            <span
              className={`absolute inset-0 rounded-sharp ${ringColor} animate-sound-wave pointer-events-none`}
              style={{ animationDelay: '0.8s' }}
            />
            <span
              className={`absolute inset-0 rounded-sharp ${ringColor} animate-sound-wave pointer-events-none`}
              style={{ animationDelay: '1.6s' }}
            />
          </>
        )}
        <AurisIconMark className="relative h-[28px] w-[28px]" alive={animate} />
      </button>
    </div>
  );
}

function DotStatus({ status }: { status: StatusKind }) {
  const dot =
    status === 'listening'    ? 'bg-live shadow-live-glow' :
    status === 'processing'   ? 'bg-accent' :
    status === 'error'        ? 'bg-danger' :
    'bg-muted';
  const animate = status === 'listening' || status === 'processing';

  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-1 w-1 rounded-full ${dot} ${animate ? 'animate-breathe' : ''}`} />
      <span className={`font-mono text-[8.5px] uppercase tracking-widest ${
        status === 'listening'  ? 'text-live'
        : status === 'error'    ? 'text-danger'
        : status === 'processing' ? 'text-accent'
        : 'text-subtle'
      }`}>
        {STATUS_LABEL[status]}
      </span>
    </span>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

function ResponseInline({ text, streaming }: { text: string; streaming: boolean }) {
  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const next = text.indexOf('**', i);
    if (next === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (next > i) parts.push(text.slice(i, next));
    const close = text.indexOf('**', next + 2);
    if (close === -1) {
      parts.push(text.slice(next));
      break;
    }
    parts.push(
      <strong key={key++} className="font-medium text-accent">
        {text.slice(next + 2, close)}
      </strong>,
    );
    i = close + 2;
  }
  return (
    <>
      {parts}
      {streaming && (
        <span className="ml-0.5 inline-block h-[0.85em] w-[1.5px] -translate-y-[0.05em] bg-accent align-middle animate-caret-blink" />
      )}
    </>
  );
}
