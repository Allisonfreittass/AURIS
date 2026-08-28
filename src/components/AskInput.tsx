import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { auris } from '../lib/ipc';

interface Props {
  busy: boolean;
  /** Called with the question text right before auris.ask() is invoked. */
  onAsk: (question: string) => void;
  /** Optional placeholder override — defaults to "Pergunte sobre a conversa…". */
  placeholder?: string;
}

export interface AskInputHandle {
  /** Externally seed the input (used by EmptyState example chips). */
  setText: (text: string) => void;
  focus: () => void;
}

export const AskInput = forwardRef<AskInputHandle, Props>(function AskInput(
  { busy, onAsk, placeholder = 'Pergunte sobre a conversa…' },
  ref,
) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    setText: (text: string) => {
      setValue(text);
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    focus: () => inputRef.current?.focus(),
  }));

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [value]);

  function submit() {
    const q = value.trim();
    if (!q || busy) return;
    onAsk(q);
    void auris.ask(q);
    setValue('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const canSubmit = value.trim().length > 0 && !busy;

  return (
    <div className="no-drag px-4 pb-3 pt-2">
      <div
        className={`flex items-end gap-2 rounded-soft border bg-surface px-3.5 py-2.5 transition-colors ${
          focused
            ? 'border-accent/50'
            : 'border-border hover:border-subtle/40'
        }`}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          disabled={busy}
          className="flex-1 resize-none border-none bg-transparent font-sans text-[13.5px] leading-[1.5] text-text placeholder:text-muted focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={busy ? () => auris.cancelAsk() : submit}
          disabled={!busy && !canSubmit}
          title={busy ? 'Parar resposta' : 'Enviar (Enter)'}
          aria-label={busy ? 'Parar' : 'Enviar'}
          className={
            busy
              ? 'shrink-0 grid h-8 w-8 place-items-center rounded-sharp border border-danger/30 bg-danger/[0.10] text-danger transition-colors hover:bg-danger/[0.18]'
              : canSubmit
                ? 'shrink-0 grid h-8 w-8 place-items-center rounded-sharp bg-accent text-accent-ink transition-colors hover:bg-accent-bright'
                : 'shrink-0 grid h-8 w-8 place-items-center rounded-sharp border border-border bg-transparent text-muted disabled:cursor-not-allowed'
          }
        >
          {busy ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
              <path
                d="M2 6.5h8M7 3l3.5 3.5L7 10"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          )}
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between px-1 font-mono text-[9px] uppercase tracking-widest text-muted">
        <span>↵ enviar · ⇧ ↵ nova linha</span>
        <span>{value.length > 0 ? `${value.length} caracteres` : ''}</span>
      </div>
    </div>
  );
});
