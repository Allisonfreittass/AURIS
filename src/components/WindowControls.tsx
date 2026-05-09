import { auris } from '../lib/ipc';

interface Props {
  /** Position in top-right corner of parent (used on screens without a topbar). */
  floating?: boolean;
}

export function WindowControls({ floating = false }: Props) {
  const wrapper = floating
    ? 'no-drag absolute right-3 top-3 z-10 flex items-center gap-1'
    : 'no-drag flex items-center gap-1';

  return (
    <div className={wrapper}>
      <ControlButton
        onClick={() => auris.minimize()}
        label="Minimizar"
        title="Minimizar (mantém na barra de tarefas)"
      >
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
          <path d="M2 5.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </ControlButton>
      <ControlButton
        onClick={() => auris.minimizeToTray()}
        label="Fechar para a bandeja"
        title="Fechar (esconde na bandeja do sistema)"
        danger
      >
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
          <path
            d="M2 2l7 7M9 2l-7 7"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </ControlButton>
    </div>
  );
}

function ControlButton({
  onClick,
  label,
  title,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const danger_classes = danger
    ? 'hover:bg-danger/12 hover:text-danger'
    : 'hover:bg-white/[0.06] hover:text-text';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      className={`grid h-7 w-7 place-items-center rounded-md text-faint transition-colors ${danger_classes}`}
    >
      {children}
    </button>
  );
}
