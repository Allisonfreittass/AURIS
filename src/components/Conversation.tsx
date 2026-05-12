import { Fragment, useEffect, useRef } from 'react';
import { AurisIconMark } from './logo/AurisIconMark';
import { CopyButton } from './CopyButton';
import { ShareButton } from './ShareButton';

export interface Message {
  id: string;
  /**
   * - 'user'     → typed by the user
   * - 'detected' → auto-detected from audio (someone asking the user)
   * - 'auris'    → response from the LLM
   */
  role: 'user' | 'detected' | 'auris';
  text: string;
  /** Created-at timestamp (ms). Used to render time markers between messages. */
  ts: number;
  streaming?: boolean;
  error?: string;
}

/** Threshold in ms above which we render a "── X min depois ──" divider
 *  between two consecutive messages. Below it the gap is conversational. */
const TIME_MARKER_GAP_MS = 2 * 60 * 1000;

interface Props {
  messages: Message[];
  /** Optional: when provided, Auris messages get a share icon that calls
   *  this with the answer text + the preceding user/detected question (so
   *  the share image can render the prompt as context). */
  onShare?: (answer: string, question: string | undefined) => void;
}

/**
 * The main canvas — chat-style message flow. User messages are right-aligned
 * with a subtle outline; Auris messages are left-aligned with the ear-mark
 * as an avatar, no bubble (typography-driven, like a person speaking).
 *
 * Latest Auris message can be in `streaming` state (caret blinks at end).
 */
const NEAR_BOTTOM_PX = 80;

export function Conversation({ messages, onShare }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Track whether the user is reading near the bottom or has scrolled up
  // to read an older response. Only auto-scroll when we're already near
  // the tail — otherwise streaming tokens shouldn't yank the viewport.
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

  // When messages mutate, scroll to bottom only if the user is already
  // there (or hasn't scrolled yet). Smooth on full bumps, instant for
  // streaming deltas to avoid juddering.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // First render: pin to bottom regardless.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={scrollRef}
      className="auris-scroll flex-1 overflow-y-auto px-5 py-4"
    >
      <div className="flex flex-col gap-5 pb-2">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showMarker =
            prev && m.ts - prev.ts > TIME_MARKER_GAP_MS;
          // For an Auris message, the relevant "question" is the most
          // recent preceding user/detected message — that's what the
          // share image uses as context above the answer.
          const question =
            m.role === 'auris' && onShare
              ? findPrecedingQuestion(messages, i)
              : undefined;
          return (
            <Fragment key={m.id}>
              {showMarker && <TimeMarker fromTs={prev.ts} toTs={m.ts} />}
              <MessageRow
                message={m}
                onShare={
                  onShare ? () => onShare(m.text, question) : undefined
                }
              />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/** Soft horizontal divider with the relative gap between two messages,
 *  e.g. "── 5 min depois ──". Helps the user read context boundaries. */
function TimeMarker({ fromTs, toTs }: { fromTs: number; toTs: number }) {
  const diffMs = toTs - fromTs;
  const minutes = Math.round(diffMs / 60_000);
  const label =
    minutes < 60
      ? `${minutes} min depois`
      : minutes < 60 * 24
        ? `${Math.round(minutes / 60)} h depois`
        : `${Math.round(minutes / (60 * 24))} d depois`;
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-border" />
      <span className="font-mono text-[9px] uppercase tracking-widest text-muted">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function MessageRow({
  message,
  onShare,
}: {
  message: Message;
  onShare?: () => void;
}) {
  if (message.role === 'user') return <UserMessage text={message.text} />;
  if (message.role === 'detected') return <DetectedMessage text={message.text} />;
  return (
    <AurisMessage
      text={message.text}
      streaming={message.streaming}
      error={message.error}
      onShare={onShare}
    />
  );
}

/** Walk backwards from `idx` to find the most recent user/detected
 *  message — used as the "question" context above the answer in shares. */
function findPrecedingQuestion(msgs: Message[], idx: number): string | undefined {
  for (let i = idx - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === 'user' || m.role === 'detected') return m.text;
    // If we walk past an earlier auris message, stop — that turn already
    // had its own question, and we want the question for THIS turn.
    if (m.role === 'auris') return undefined;
  }
  return undefined;
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end animate-fade-up">
      <div className="max-w-[85%] rounded-soft border border-border bg-elevated px-3.5 py-2 font-sans text-[13px] leading-[1.55] text-text">
        {text}
      </div>
    </div>
  );
}

/** Question detected in the audio. Distinct visual treatment so user
 *  immediately sees this came from the conversation around them, not from
 *  their own typing. */
function DetectedMessage({ text }: { text: string }) {
  return (
    <div className="flex animate-fade-up">
      <div className="flex w-full items-start gap-3">
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-sharp border border-live/30 bg-live/[0.08]">
          <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true" className="text-live">
            <rect x="5" y="2" width="3" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path
              d="M3.5 6.5c0 1.66 1.34 3 3 3s3-1.34 3-3M6.5 9.5v2"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-live/90">
            Detectado no áudio
          </span>
          <p className="font-sans text-[13.5px] italic font-light leading-[1.6] text-light">
            “{text}”
          </p>
        </div>
      </div>
    </div>
  );
}

function AurisMessage({
  text,
  streaming,
  error,
  onShare,
}: {
  text: string;
  streaming?: boolean;
  error?: string;
  onShare?: () => void;
}) {
  const isThinking = streaming && !text;

  return (
    <div className="flex items-start gap-3 animate-fade-up">
      {/* avatar */}
      <div className="relative mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-sharp border border-border bg-elevated">
        <AurisIconMark className="h-[14px] w-[14px]" alive={streaming} />
        {streaming && (
          <span className="pointer-events-none absolute inset-0 rounded-sharp border border-accent/40 animate-breathe" />
        )}
      </div>

      {/* content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-widest text-accent">
            Auris
          </span>
          {isThinking && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted">
              · pensando
            </span>
          )}
          {!error && text && !streaming && (
            <>
              <CopyButton text={text} title="Copiar resposta" />
              {onShare && <ShareButton onClick={onShare} />}
            </>
          )}
        </div>

        {error && (
          <div className="rounded-sharp border border-danger/30 bg-danger/[0.08] px-2.5 py-1.5 font-sans text-[12px] text-danger">
            {error}
          </div>
        )}

        {!error && text && (
          <div className="font-sans text-[13.5px] leading-[1.7] text-light">
            <RenderInline text={text} />
            {streaming && (
              <span className="ml-0.5 inline-block h-[0.95em] w-[1.5px] -translate-y-[0.05em] bg-accent align-middle animate-caret-blink" />
            )}
          </div>
        )}

        {/* Pure thinking state — no text yet, show a soft skeleton bar. */}
        {isThinking && (
          <div className="flex flex-col gap-1.5">
            <ShimmerBar width="80%" />
            <ShimmerBar width="60%" />
          </div>
        )}
      </div>
    </div>
  );
}

function ShimmerBar({ width }: { width: string }) {
  return (
    <span
      className="block h-2 rounded-sharp"
      style={{
        width,
        background:
          'linear-gradient(90deg, rgba(26,108,240,0.04) 0%, rgba(26,108,240,0.20) 50%, rgba(26,108,240,0.04) 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.6s linear infinite',
      }}
    />
  );
}

/** **bold** → accent-colored text (blue). */
function RenderInline({ text }: { text: string }) {
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
  return <>{parts}</>;
}
