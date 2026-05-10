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
      <div className="glass-strong relative flex w-full flex-col overflow-hidden rounded-2xl shadow-pop ring-1 ring-white/[0.04]">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-to/40 to-transparent" />

        <header className="flex items-center gap-2.5 px-3 pt-2.5">
          <AurisIconMark className="h-[16px] w-[16px]" alive={animate} />
          <span className="font-serif text-[12px] font-light tracking-[0.18em] text-text">
            AURIS
          </span>
          <DotStatus status={status} />
          {mode === 'auto' && (
            <span className="rounded-md border border-live/30 bg-live/10 px-1.5 py-0.5 font-mono text-[8px] font-medium uppercase tracking-widest text-live/90">
              auto
            </span>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => auris.showMainWindow()}
            title="Abrir janela principal"
            aria-label="Abrir janela principal"
            className="no-drag grid h-5 w-5 place-items-center rounded text-faint transition-colors hover:bg-white/[0.06] hover:text-text"
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
          className="no-drag auris-scroll flex-1 overflow-y-auto px-3 pb-2.5 pt-1.5 font-sans text-[11.5px] leading-[1.55]"
        >
          {detectedQuestion && showResponse && (
            <div className="mb-1.5 rounded-md bg-live/[0.08] px-2 py-1 font-serif text-[10.5px] italic leading-tight text-live/90 ring-1 ring-live/20">
              “{truncate(detectedQuestion, 90)}”
            </div>
          )}

          {showTranscript && (
            <span className="text-text/85">
              {history.map((entry, i) => (
                <span key={i} className="inline">
                  {entry.translated && entry.lang && (
                    <span className="mr-0.5 inline-block translate-y-[-1px] rounded border border-accent/30 bg-accent/[0.08] px-1 py-0.5 align-middle font-mono text-[7px] uppercase tracking-widest text-accent/85">
                      ↻ {entry.lang}
                    </span>
                  )}
                  {entry.text}{' '}
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
            <ResponseInline text={response} streaming={streaming} />
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
    status === 'listening' ? 'bg-live/45'
    : status === 'processing' ? 'bg-accent/45'
    : 'bg-faint/30';

  return (
    <div className="drag flex h-full w-full items-center justify-center">
      <button
        type="button"
        onClick={() => auris.showMainWindow()}
        aria-label="Abrir Auris"
        title="Abrir Auris"
        className="no-drag relative grid h-12 w-12 place-items-center rounded-full bg-bg/85 ring-1 ring-white/[0.06] shadow-pop backdrop-blur-md transition-all hover:bg-bg hover:ring-white/[0.12]"
      >
        {animate && (
          <>
            <span
              className={`absolute inset-0 rounded-full ${ringColor} animate-sound-wave pointer-events-none`}
              style={{ animationDelay: '0s' }}
            />
            <span
              className={`absolute inset-0 rounded-full ${ringColor} animate-sound-wave pointer-events-none`}
              style={{ animationDelay: '0.8s' }}
            />
            <span
              className={`absolute inset-0 rounded-full ${ringColor} animate-sound-wave pointer-events-none`}
              style={{ animationDelay: '1.6s' }}
            />
          </>
        )}
        <AurisIconMark className="relative h-[26px] w-[26px]" alive={animate} />
      </button>
    </div>
  );
}

function DotStatus({ status }: { status: StatusKind }) {
  const dot =
    status === 'listening' ? 'bg-live shadow-live-glow' :
    status === 'processing' ? 'bg-accent shadow-accent-glow' :
    status === 'error' ? 'bg-danger' :
    'bg-faint';
  const animate = status === 'listening' || status === 'processing';

  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-1 w-1 rounded-full ${dot} ${animate ? 'animate-breathe' : ''}`} />
      <span className="font-mono text-[8.5px] uppercase tracking-widest text-muted">
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
    <span className="text-text/95">
      {parts}
      {streaming && (
        <span className="ml-0.5 inline-block h-[0.85em] w-[1.5px] -translate-y-[0.05em] bg-accent align-middle animate-caret-blink" />
      )}
    </span>
  );
}
