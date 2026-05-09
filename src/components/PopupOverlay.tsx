import { useEffect, useRef, useState } from 'react';
import { AurisIconMark } from './logo/AurisIconMark';
import { auris } from '../lib/ipc';
import type { AurisMode, StatusKind } from '../../shared/ipc';

const STATUS_LABEL: Record<StatusKind, string> = {
  idle: 'pronto',
  listening: 'ouvindo',
  processing: 'pensando',
  paused: 'pausado',
  reconnecting: 'reconectando',
  error: 'erro',
};

/**
 * Top-center floating popup. Shows the latest detected question + Auris's
 * suggested response while the main window is minimized. `focusable: false`
 * on the BrowserWindow keeps keyboard focus on whatever app the user is
 * actually working in.
 */
export function PopupOverlay() {
  const [status, setStatus] = useState<StatusKind>('idle');
  const [mode, setMode] = useState<AurisMode>('manual');
  const [latestTranscript, setLatestTranscript] = useState('');
  const [partial, setPartial] = useState('');
  const [detectedQuestion, setDetectedQuestion] = useState<string | null>(null);
  const [response, setResponse] = useState('');
  const [streaming, setStreaming] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    auris.getMode().then(setMode).catch(() => {});

    const offT = auris.onTranscript((e) => {
      if (e.final) {
        setLatestTranscript(e.text);
        setPartial('');
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

  const dot =
    status === 'listening'  ? 'bg-live shadow-live-glow' :
    status === 'processing' ? 'bg-accent shadow-accent-glow' :
    status === 'error'      ? 'bg-danger' :
    'bg-faint';
  const animate = status === 'listening' || status === 'processing';

  const showResponse = streaming || response;
  const showTranscript = !showResponse && (latestTranscript || partial);

  return (
    <div className="drag flex h-full w-full items-stretch justify-stretch p-2">
      <div className="glass-strong relative flex w-full flex-col overflow-hidden rounded-2xl shadow-pop ring-1 ring-white/[0.04]">
        {/* hairline glow on top */}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-to/40 to-transparent" />

        <header className="flex items-center gap-2.5 px-3 pt-2.5">
          <AurisIconMark className="h-[16px] w-[16px]" alive={animate} />
          <span className="font-serif text-[12px] font-light tracking-[0.18em] text-text">
            AURIS
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`h-1 w-1 rounded-full ${dot} ${animate ? 'animate-breathe' : ''}`} />
            <span className="font-mono text-[8.5px] uppercase tracking-widest text-muted">
              {STATUS_LABEL[status]}
            </span>
          </span>
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
          ref={responseRef}
          className="auris-scroll flex-1 overflow-y-auto px-3 pb-2.5 pt-2 font-sans text-[11.5px] leading-[1.55]"
        >
          {!showResponse && !showTranscript && (
            <span className="italic text-faint">
              {mode === 'auto'
                ? 'Esperando alguém te fazer uma pergunta no áudio.'
                : 'Toque um vídeo, podcast ou chamada — Auris escuta em silêncio.'}
            </span>
          )}

          {/* Detected question banner shown above the response when in auto. */}
          {detectedQuestion && showResponse && (
            <div className="mb-1.5 rounded-md bg-live/[0.08] px-2 py-1 font-serif text-[10.5px] italic leading-tight text-live/90 ring-1 ring-live/20">
              “{truncate(detectedQuestion, 90)}”
            </div>
          )}

          {showTranscript && (
            <span className="text-text/85">{partial || latestTranscript}</span>
          )}
          {showResponse && (
            <ResponseInline text={response} streaming={streaming} />
          )}
        </div>
      </div>
    </div>
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
