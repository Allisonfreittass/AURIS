import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Source text to copy. Empty string disables the button. */
  text: string;
  /** Extra Tailwind classes (size, color overrides). Defaults to a subtle
   *  20×20 button matching the popup header buttons. */
  className?: string;
  /** Optional title prefix — e.g. "Copiar resposta". Defaults to "Copiar". */
  title?: string;
}

/** Small icon button that copies `text` to the clipboard and morphs into
 *  a checkmark for ~1.5s as feedback. Used in the popup header and on
 *  Auris messages in the main conversation. */
export function CopyButton({ text, className, title = 'Copiar' }: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.warn('[clipboard] write failed:', err);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!text}
      title={copied ? 'Copiado' : title}
      aria-label={title}
      className={
        'no-drag grid h-5 w-5 place-items-center rounded-sharp transition-colors disabled:opacity-40 ' +
        (copied
          ? 'text-live'
          : 'text-muted hover:bg-elevated hover:text-text') +
        (className ? ' ' + className : '')
      }
    >
      {copied ? (
        <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
          <path
            d="M1.5 4.5L3.5 6.5L7.5 2.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      ) : (
        <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
          <rect
            x="2.5"
            y="2.5"
            width="5"
            height="5.5"
            rx="0.6"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
          />
          <path
            d="M3.5 2V1.6C3.5 1.27 3.77 1 4.1 1H5.9C6.23 1 6.5 1.27 6.5 1.6V2"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
