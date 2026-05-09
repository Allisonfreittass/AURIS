import { AurisLogo } from './logo/AurisLogo';
import { ModeToggle } from './ModeToggle';
import type { AurisMode } from '../../shared/ipc';

interface Props {
  isRunning: boolean;
  mode: AurisMode;
  onModeChange: (mode: AurisMode) => void;
  onPickExample: (text: string) => void;
}

const MANUAL_EXAMPLES = [
  'Resume os últimos 30 segundos',
  'Qual o ponto principal?',
  'Explique aquele termo técnico',
  'O que ele acabou de citar?',
];

export function EmptyState({ isRunning, mode, onModeChange, onPickExample }: Props) {
  const isAuto = mode === 'auto';

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7 px-6 py-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <AurisLogo className="h-[80px] w-[80px]" />
        <div className="flex flex-col gap-1.5">
          <h1 className="font-serif text-[24px] font-light leading-tight text-text">
            {isAuto && isRunning && 'Modo automático ativo.'}
            {isAuto && !isRunning && 'Pronto pra interceptar perguntas.'}
            {!isAuto && isRunning && 'Estou ouvindo.'}
            {!isAuto && !isRunning && 'Pronto pra escutar com você.'}
          </h1>
          <p className="font-sans text-[12.5px] leading-relaxed text-muted max-w-[340px]">
            {isAuto
              ? 'Quando alguém te fizer uma pergunta no áudio (entrevista, reunião, debate), eu detecto e sugiro uma resposta articulada que você pode adaptar e dizer em voz alta.'
              : 'Pergunte qualquer coisa sobre o que está tocando — vídeo, podcast, reunião. Eu uso a transcrição em tempo real como contexto.'}
          </p>
        </div>
      </div>

      {/* Mode picker — pill style for in-canvas use. */}
      <ModeToggle mode={mode} onChange={onModeChange} variant="pill" />

      {/* Examples only make sense in manual mode while listening. */}
      {!isAuto && isRunning && (
        <div className="flex flex-col items-center gap-2.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-faint">
            Exemplos
          </span>
          <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-[360px]">
            {MANUAL_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => onPickExample(ex)}
                className="no-drag rounded-full border border-white/[0.07] bg-elevated/60 px-3 py-1.5 font-sans text-[11.5px] text-muted transition-colors hover:border-accent/30 hover:bg-accent/[0.06] hover:text-accent"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Auto-mode hint while not running */}
      {isAuto && !isRunning && (
        <div className="rounded-lg border border-live/25 bg-live/[0.06] px-4 py-2.5 max-w-[340px]">
          <p className="font-sans text-[11.5px] leading-relaxed text-live/90">
            Clique em <span className="font-medium">▶ iniciar</span> no topo
            para começar a ouvir o áudio do sistema.
          </p>
        </div>
      )}
    </div>
  );
}
