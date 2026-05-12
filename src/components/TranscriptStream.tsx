import { useEffect, useRef } from 'react';
import { normalizeLangCode, sameLang } from '../../shared/lang';
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
  /** User's preferred display language (ISO 639-1). Drives the
   *  "translated badge" guard — a badge for "↻ pt" while preferred is
   *  also "pt" is meaningless and confusing, so it gets suppressed. */
  preferredLang: string;
  /** When true, only the header is rendered. The toggle button in the
   *  header lets the user expand again. */
  collapsed?: boolean;
  /** Wire a chevron toggle in the header for collapsing this section.
   *  Optional so the component still works in places that don't need it. */
  onToggleCollapsed?: () => void;
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
export function TranscriptStream({
  status,
  history,
  partialLine,
  preferredLang,
  collapsed = false,
  onToggleCollapsed,
}: Props) {
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
    status === 'listening'    ? 'bg-live shadow-live-glow'
    : status === 'processing' ? 'bg-accent'
    : status === 'error'      ? 'bg-danger'
    : 'bg-muted';
  const animate = status === 'listening' || status === 'processing';

  return (
    <section className="flex flex-col gap-1.5 border-b border-border">
      {/* Header: status + source label + (optional) collapse toggle */}
      <div className="flex items-center gap-2.5 px-4 pt-2 text-[12px]">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass} ${animate ? 'animate-breathe' : ''}`} />
        <span className="font-mono text-[9px] uppercase tracking-widest text-subtle shrink-0">
          {STATUS_HINT[status]}
        </span>
        <span className="h-3 w-px bg-border shrink-0" />
        <span className="font-mono text-[8.5px] uppercase tracking-widest text-muted">
          transcrição · áudio do sistema
        </span>
        {onToggleCollapsed && (
          <>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? 'Expandir transcrição' : 'Recolher transcrição'}
              title={collapsed ? 'Expandir' : 'Recolher'}
              className="grid h-4 w-4 place-items-center text-muted transition-colors hover:text-text"
              style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
            >
              <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
                <path
                  d="M2 3.5L4.5 6L7 3.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Body: scrolling stream of finals + current partial. Hidden when
          the user has collapsed the section to give the chat more room. */}
      {!collapsed && (
      <div
        ref={scrollRef}
        className="auris-scroll overflow-y-auto px-4 pb-2 font-mono text-[11.5px] leading-[1.7] text-subtle max-h-[180px]"
      >
        {history.map((entry, i) => {
          // Defensive guard: only show the translated-from badge when
          // the source language is actually different from what the
          // user wants to read. Catches upstream cases where a PT
          // segment was flagged as translated by mistake.
          const showTranslatedBadge =
            entry.translated &&
            entry.lang &&
            !sameLang(entry.lang, preferredLang);
          return (
            <span key={i} className="inline">
              {showTranslatedBadge && (
                <span className="mr-1 inline-block translate-y-[-1px] rounded-sharp border border-accent/30 bg-accent/[0.08] px-1 py-0.5 align-middle font-mono text-[7.5px] uppercase tracking-widest text-accent">
                  ↻ {normalizeLangCode(entry.lang)}
                </span>
              )}
              <span className="text-light">{entry.text}</span>{' '}
            </span>
          );
        })}
        {partialLine && (
          <span className="text-text">
            {partialLine}
            <span className="ml-0.5 inline-block h-[0.85em] w-[1.5px] -translate-y-[0.05em] bg-text/70 align-middle animate-caret-blink" />
          </span>
        )}
      </div>
      )}
    </section>
  );
}
