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

/**
 * Top chrome of the main window. Layout (left → right):
 *   [mark] Auris.    [ContextIndicator] [ModeToggle] [run/stop] [account] | [-][▢][×]
 *
 * Visual idiom: hairline rule below, no blur or glass. Pills use 2px corners
 * and mono labels (9–10px tracked-out) per the brand identity.
 */
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
    <header className="drag flex h-12 items-center justify-between gap-3 border-b border-border bg-bg px-3">
      {/* Left: brand or back */}
      <div className="flex items-center gap-2.5">
        {isAccount ? (
          <button
            onClick={onCloseAccount}
            aria-label="Voltar"
            title="Voltar"
            className="no-drag grid h-7 w-7 place-items-center rounded-sharp text-muted transition-colors hover:bg-elevated hover:text-text"
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
          <AurisIconMark className="h-[18px] w-[18px]" alive={isRunning} />
        )}
        <span className="font-sans text-[14px] font-semibold tracking-[-0.005em] text-text leading-none">
          {isAccount ? 'Conta' : 'Auris'}
          <span className="text-accent">.</span>
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
                  ? 'flex items-center gap-1.5 rounded-sharp border border-border bg-transparent px-2.5 py-1 font-mono text-[9px] font-medium uppercase tracking-widest text-subtle transition-colors hover:border-subtle hover:text-text'
                  : 'flex items-center gap-1.5 rounded-sharp border border-accent/30 bg-accent/[0.08] px-2.5 py-1 font-mono text-[9px] font-medium uppercase tracking-widest text-accent transition-colors hover:bg-accent/[0.14] hover:border-accent/50'
              }
              aria-label={isRunning ? 'parar' : 'iniciar'}
            >
              {isRunning ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-[1px] bg-current" />
                  parar
                </>
              ) : (
                <>
                  <svg width="7" height="7" viewBox="0 0 7 7" aria-hidden="true">
                    <path d="M0.5 0L6.5 3.5L0.5 7z" fill="currentColor" />
                  </svg>
                  iniciar
                </>
              )}
            </button>
            <button
              onClick={onOpenAccount}
              aria-label="Conta"
              title="Conta"
              className="grid h-7 w-7 place-items-center rounded-sharp text-muted transition-colors hover:bg-elevated hover:text-text"
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
            <span className="mx-1 h-4 w-px bg-border" />
          </>
        )}
        <WindowControls />
      </div>
    </header>
  );
}
