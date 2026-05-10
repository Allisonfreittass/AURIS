import { AurisIconMark } from './logo/AurisIconMark';
import { ContextIndicator } from './ContextIndicator';
import { WindowControls } from './WindowControls';
import { ModeToggle } from './ModeToggle';
import type { AurisMode, StatusKind } from '../../shared/ipc';

interface Props {
  status: StatusKind;
  isRunning: boolean;
  onToggleRun: () => void;
  view: 'main' | 'account';
  onOpenAccount: () => void;
  onCloseAccount: () => void;
  mode: AurisMode;
  onModeChange: (mode: AurisMode) => void;
  contextCount: number;
}

export function TopBar({
  isRunning,
  onToggleRun,
  view,
  onOpenAccount,
  onCloseAccount,
  mode,
  onModeChange,
  contextCount,
}: Props) {
  const isAccount = view === 'account';

  return (
    <header className="drag flex h-12 items-center justify-between gap-3 border-b border-white/[0.04] bg-bg/80 px-3 backdrop-blur-md">
      {/* Left: brand or back */}
      <div className="flex items-center gap-2.5">
        {isAccount ? (
          <button
            onClick={onCloseAccount}
            aria-label="Voltar"
            title="Voltar"
            className="no-drag grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
              <path
                d="M7 2L3 5.5l4 3.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </button>
        ) : (
          <AurisIconMark className="h-[20px] w-[20px]" alive={isRunning} />
        )}
        <span className="font-serif text-[15px] font-light tracking-[0.16em] text-text">
          {isAccount ? 'CONTA' : 'AURIS'}
        </span>
      </div>

      {/* Right: actions */}
      <div className="no-drag flex items-center gap-1.5">
        {!isAccount && (
          <>
            <ContextIndicator count={contextCount} />
            <ModeToggle mode={mode} onChange={onModeChange} variant="topbar" />
            <button
              onClick={onToggleRun}
              className={
                isRunning
                  ? 'flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted transition-colors hover:border-white/15 hover:text-text'
                  : 'flex items-center gap-1.5 rounded-md bg-accent px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-widest text-accent-ink shadow-accent-glow transition-all hover:bg-accent-bright'
              }
              aria-label={isRunning ? 'parar' : 'iniciar'}
            >
              {isRunning ? (
                <>
                  <span className="h-2 w-2 rounded-sm bg-current opacity-80" />
                  parar
                </>
              ) : (
                <>
                  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                    <path d="M1 0.5L7 4L1 7.5z" fill="currentColor" />
                  </svg>
                  iniciar
                </>
              )}
            </button>
            <button
              onClick={onOpenAccount}
              aria-label="Conta"
              title="Conta"
              className="grid h-7 w-7 place-items-center rounded-md text-faint transition-colors hover:bg-white/[0.06] hover:text-text"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <circle cx="6" cy="4" r="2" stroke="currentColor" strokeWidth="1.3" fill="none" />
                <path
                  d="M2 11c0-2.2 1.8-4 4-4s4 1.8 4 4"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </button>
            <span className="mx-1 h-4 w-px bg-white/[0.08]" />
          </>
        )}
        <WindowControls />
      </div>
    </header>
  );
}
