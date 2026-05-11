import { AurisIconMark } from './logo/AurisIconMark';
import type { AurisMode, StatusKind } from '../../shared/ipc';

interface Props {
  status: StatusKind;
  isRunning: boolean;
  mode: AurisMode;
}

/**
 * Compact ambient state shown when there's no conversation yet.
 *
 * Idea: when nothing's happening Auris is just a quiet icon, not a wall of
 * cards. As soon as audio is flowing it pulses + radiates concentric sound
 * waves. The moment a response arrives the parent renders <Conversation/>
 * instead and this whole canvas fades away.
 *
 * No example chips — the AskInput placeholder is enough of a hint, and a
 * cluttered empty state contradicts the whole point of the redesign.
 */
export function AmbientCanvas({ status, isRunning, mode }: Props) {
  const listening = status === 'listening';
  const processing = status === 'processing';
  const animated = listening || processing;
  const isAuto = mode === 'auto';

  // Color of the ripple rings tracks the status — teal for listening,
  // blue for processing, faint for everything else.
  const waveColor =
    listening ? 'bg-live/50' :
    processing ? 'bg-accent/50' :
    'bg-muted/30';

  // Subtitle copy — mirrors what the icon is doing.
  const headline =
    !isRunning ? 'Pronto pra escutar com você.' :
    isAuto && listening ? 'Ouvindo. Vou interceptar a próxima pergunta.' :
    isAuto ? 'Modo automático ativo.' :
    listening ? 'Estou ouvindo.' :
    processing ? 'Processando…' :
    'Pronto.';

  const hint =
    !isRunning ? 'Toque um vídeo, podcast ou chamada e clique em ▶ iniciar.' :
    isAuto ? 'Quando alguém te perguntar algo, sugiro a resposta.' :
    'Pergunte abaixo sobre o que está ouvindo.';

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-8 text-center">
      {/* Mark halo — concentric squarish ripples (matches the corporate
          grid feel) when audio is flowing; static when idle. */}
      <div className="relative grid h-[160px] w-[160px] place-items-center">
        {animated && (
          <>
            <span
              className={`absolute h-[88px] w-[88px] rounded-sharp ${waveColor} animate-sound-wave`}
              style={{ animationDelay: '0s' }}
            />
            <span
              className={`absolute h-[88px] w-[88px] rounded-sharp ${waveColor} animate-sound-wave`}
              style={{ animationDelay: '0.8s' }}
            />
            <span
              className={`absolute h-[88px] w-[88px] rounded-sharp ${waveColor} animate-sound-wave`}
              style={{ animationDelay: '1.6s' }}
            />
          </>
        )}

        {/* The EQ-bar mark, alive when listening. */}
        <AurisIconMark
          alive={animated}
          className="relative h-[88px] w-[88px]"
        />
      </div>

      {/* Status copy — sans, restrained. */}
      <div className="flex max-w-[320px] flex-col items-center gap-2">
        <h1 className="font-sans text-[20px] font-semibold tracking-[-0.01em] leading-tight text-text">
          {headline}
        </h1>
        <p className="font-sans text-[12.5px] leading-relaxed text-subtle">
          {hint}
        </p>
      </div>
    </div>
  );
}
