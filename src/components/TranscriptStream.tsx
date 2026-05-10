import { useEffect, useRef } from 'react';
import type { StatusKind } from '../../shared/ipc';

interface TranscriptEntry {
  text: string;
  ts: number;
  lang?: string;
  translated?: boolean;
}

interface Props {
  status: StatusKind;
  history: TranscriptEntry[];
  partialLine: string;
  /** When true, the stream takes the full canvas height. When false, it
   *  caps at a smaller height so a Conversation can sit below it. */
  expanded: boolean;
}

const STATUS_HINT: Record<StatusKind, string> = {
  idle: 'pronto pra ouvir',
  listening: 'ouvindo',
  processing: 'pensando',
  paused: 'pausado',
  reconnecting: 'reconectando',
  error: 'erro',
};

const NEAR_BOTTOM_PX = 60;

/**
 * Cumulative transcript view. Replaces the old single-line LiveRibbon with
 * a CC-style stream that keeps everything we've heard since the last
 * clear, so the user can read backwards if they missed something.
 *
 * Tail-following scroll: if the user is at the bottom, new finals push
 * the view down; if they scrolled up to read older lines, we leave them
 * alone until they scroll back to the bottom.
 */
export function TranscriptStream({ status, history, partialLine, expanded }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottom.current = distance < NEAR_BOTTOM_PX;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [history, partialLine]);

  const dotClass =
    status === 'listening'  ? 'bg-live shadow-live-glow'
    : status === 'processing' ? 'bg-accent shadow-accent-glow'
    : status === 'error'      ? 'bg-danger'
    : 'bg-faint';
  const animate = status === 'listening' || status === 'processing';

  return (
    <section className={`flex flex-col gap-1.5 ${expanded ? 'flex-1 min-h-0' : ''}`}>
      {/* Header: status + lang badge of latest entry */}
      <div className="flex items-center gap-2.5 px-4 pt-2 text-[12px]">
        <span className="relative grid h-3 w-3 shrink-0 place-items-center">
          {animate && (
            <span
              className={`absolute inset-0 rounded-full opacity-30 ${
                status === 'listening' ? 'bg-live' : 'bg-accent'
              } animate-breathe`}
            />
          )}
          <span className={`relative h-1.5 w-1.5 rounded-full ${dotClass}`} />
        </span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted shrink-0">
          {STATUS_HINT[status]}
        </span>
        <span className="h-3 w-px bg-white/[0.08] shrink-0" />
        <span className="font-mono text-[8.5px] uppercase tracking-widest text-faint">
          transcrição · áudio do sistema
        </span>
      </div>

      {/* Body: scrolling stream of finals + current partial */}
      <div
        ref={scrollRef}
        className={`auris-scroll overflow-y-auto px-4 pb-2 font-sans text-[12.5px] leading-[1.65] text-text/75 ${
          expanded ? 'flex-1 min-h-0' : 'max-h-[140px]'
        }`}
      >
        {history.map((entry, i) => (
          <span key={i} className="inline">
            {entry.translated && entry.lang && (
              <span className="mr-1 inline-block translate-y-[-1px] rounded border border-accent/30 bg-accent/[0.08] px-1 py-0.5 align-middle font-mono text-[7.5px] uppercase tracking-widest text-accent/85">
                ↻ {entry.lang}
              </span>
            )}
            {entry.text}{' '}
          </span>
        ))}
        {partialLine && (
          <span className="text-text">
            {partialLine}
            <span className="ml-0.5 inline-block h-[0.85em] w-[1.5px] -translate-y-[0.05em] bg-text/70 align-middle animate-caret-blink" />
          </span>
        )}
      </div>
    </section>
  );
}
