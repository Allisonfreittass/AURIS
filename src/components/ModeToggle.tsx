import type { AurisMode } from '../../shared/ipc';

interface Props {
  mode: AurisMode;
  onChange: (mode: AurisMode) => void;
  /** Compact variant for the topbar; larger pill-style for in-canvas use. */
  variant?: 'topbar' | 'pill';
}

/**
 * Two-state toggle between manual asking and auto question-detection.
 *
 * The label "auto" only really makes sense when a session is running, but
 * the toggle is always interactable so the user can pre-arm the mode
 * before starting.
 */
export function ModeToggle({ mode, onChange, variant = 'topbar' }: Props) {
  const isAuto = mode === 'auto';

  if (variant === 'topbar') {
    return (
      <button
        type="button"
        onClick={() => onChange(isAuto ? 'manual' : 'auto')}
        title={
          isAuto
            ? 'Auto: Auris detecta perguntas no áudio e responde sozinho. Clique pra desligar.'
            : 'Manual: você pergunta, Auris responde. Clique pra ativar modo auto.'
        }
        aria-label={isAuto ? 'Desativar modo auto' : 'Ativar modo auto'}
        className={
          isAuto
            ? 'chrome flex items-center gap-1.5 rounded-sharp border border-live/40 bg-live/[0.08] px-2 py-1.5 text-live transition-colors hover:bg-live/[0.14]'
            : 'chrome flex items-center gap-1.5 rounded-sharp border border-border bg-transparent px-2 py-1.5 text-secondary transition-colors hover:border-subtle hover:text-primary'
        }
      >
        <SignalIcon active={isAuto} />
        {isAuto ? 'auto' : 'manual'}
      </button>
    );
  }

  // Pill variant (used in EmptyState).
  return (
    <div className="inline-flex items-center gap-px rounded-sharp border border-border bg-surface p-0.5">
      <PillButton active={!isAuto} onClick={() => onChange('manual')}>
        Manual
      </PillButton>
      <PillButton active={isAuto} onClick={() => onChange('auto')}>
        <SignalIcon active={isAuto} className="opacity-70" />
        Auto
      </PillButton>
    </div>
  );
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'flex items-center gap-1.5 rounded-sharp bg-elevated px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-text'
          : 'flex items-center gap-1.5 rounded-sharp px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-subtle transition-colors hover:text-text'
      }
    >
      {children}
    </button>
  );
}

function SignalIcon({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 9 9"
      aria-hidden="true"
      className={`${className ?? ''} ${active ? 'animate-breathe' : ''}`}
    >
      <circle cx="4.5" cy="4.5" r="1.4" fill="currentColor" />
      <path
        d="M2 7c-0.6-0.7-1-1.6-1-2.5S1.4 2.7 2 2M7 2c0.6 0.7 1 1.6 1 2.5s-0.4 1.8-1 2.5"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
