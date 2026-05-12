interface Props {
  /** Open the share modal pre-filled with this answer text. */
  onClick: () => void;
  className?: string;
}

/** Small icon button that opens the ShareModal for an Auris response.
 *  Matches the visual footprint of CopyButton so they sit cleanly side
 *  by side in the message header. */
export function ShareButton({ onClick, className }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Compartilhar"
      aria-label="Compartilhar resposta"
      className={
        'no-drag grid h-5 w-5 place-items-center rounded-sharp text-muted transition-colors hover:bg-elevated hover:text-text' +
        (className ? ' ' + className : '')
      }
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <circle cx="2.2" cy="2.8" r="0.95" stroke="currentColor" strokeWidth="0.85" fill="none" />
        <circle cx="2.2" cy="7.2" r="0.95" stroke="currentColor" strokeWidth="0.85" fill="none" />
        <circle cx="7.5" cy="5" r="0.95" stroke="currentColor" strokeWidth="0.85" fill="none" />
        <path
          d="M3 3.3L6.7 4.6M3 6.7L6.7 5.4"
          stroke="currentColor"
          strokeWidth="0.85"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
