import { useEffect, useRef } from 'react';
import { AurisIconMark } from './logo/AurisIconMark';

export interface Message {
  id: string;
  /**
   * - 'user'     → typed by the user
   * - 'detected' → auto-detected from audio (someone asking the user)
   * - 'auris'    → response from the LLM
   */
  role: 'user' | 'detected' | 'auris';
  text: string;
  streaming?: boolean;
  error?: string;
}

interface Props {
  messages: Message[];
}

/**
 * The main canvas — chat-style message flow. User messages are right-aligned
 * with a subtle outline; Auris messages are left-aligned with the ear-mark
 * as an avatar, no bubble (typography-driven, like a person speaking).
 *
 * Latest Auris message can be in `streaming` state (caret blinks at end).
 */
export function Conversation({ messages }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on every change.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  return (
    <div
      ref={scrollRef}
      className="auris-scroll flex-1 overflow-y-auto px-5 py-4"
    >
      <div className="flex flex-col gap-5">
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: Message }) {
  if (message.role === 'user') return <UserMessage text={message.text} />;
  if (message.role === 'detected') return <DetectedMessage text={message.text} />;
  return (
    <AurisMessage
      text={message.text}
      streaming={message.streaming}
      error={message.error}
    />
  );
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end animate-fade-up">
      <div className="max-w-[85%] rounded-2xl rounded-tr-md border border-white/[0.07] bg-elevated px-3.5 py-2 font-sans text-[13px] leading-[1.55] text-text">
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
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-live/[0.10] ring-1 ring-live/25">
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
          <span className="font-mono text-[9px] uppercase tracking-widest text-live/85">
            Detectado no áudio
          </span>
          <p className="font-serif text-[14px] italic leading-[1.55] text-text/85">
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
}: {
  text: string;
  streaming?: boolean;
  error?: string;
}) {
  const isThinking = streaming && !text;

  return (
    <div className="flex items-start gap-3 animate-fade-up">
      {/* avatar */}
      <div className="relative mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-elevated">
        <AurisIconMark className="h-[14px] w-[14px]" alive={streaming} />
        {streaming && (
          <span className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-accent/30 animate-breathe" />
        )}
      </div>

      {/* content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-widest text-accent/80">
            Auris
          </span>
          {isThinking && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-faint">
              · pensando
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-danger/25 bg-danger/[0.08] px-2.5 py-1.5 font-sans text-[12px] text-danger">
            {error}
          </div>
        )}

        {!error && text && (
          <div className="font-sans text-[13.5px] leading-[1.7] text-text/95">
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
      className="block h-2.5 rounded-md"
      style={{
        width,
        background:
          'linear-gradient(90deg, rgba(251,191,36,0.04) 0%, rgba(251,191,36,0.18) 50%, rgba(251,191,36,0.04) 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.6s linear infinite',
      }}
    />
  );
}

/** **bold** → accent-colored text. */
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
      <strong
        key={key++}
        className="font-medium text-accent"
        style={{ textShadow: '0 0 14px rgba(251,191,36,0.25)' }}
      >
        {text.slice(next + 2, close)}
      </strong>,
    );
    i = close + 2;
  }
  return <>{parts}</>;
}
