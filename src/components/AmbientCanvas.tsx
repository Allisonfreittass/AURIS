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

  // Color of the ripple rings tracks the status — cyan for listening,
  // amber for processing, faint for everything else.
  const waveColor =
    listening ? 'bg-live/60' :
    processing ? 'bg-accent/60' :
    'bg-faint/40';

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
    <div className="flex flex-1 flex-col items-center justify-center gap-7 px-6 py-8 text-center">
      {/* Icon halo */}
      <div className="relative grid h-[160px] w-[160px] place-items-center">
        {/* Three concentric ripples staggered in time. Only render the DOM
            for them when audio is actually flowing — otherwise the layout
            stays static and there's nothing distracting on screen. */}
        {animated && (
          <>
            <span
              className={`absolute h-[88px] w-[88px] rounded-full ${waveColor} animate-sound-wave`}
              style={{ animationDelay: '0s' }}
            />
            <span
              className={`absolute h-[88px] w-[88px] rounded-full ${waveColor} animate-sound-wave`}
              style={{ animationDelay: '0.8s' }}
            />
            <span
              className={`absolute h-[88px] w-[88px] rounded-full ${waveColor} animate-sound-wave`}
              style={{ animationDelay: '1.6s' }}
            />
          </>
        )}

        {/* Soft glow disc behind the icon — anchors it visually so the
            ripples have something to emanate FROM, even when no animation. */}
        <span
          className="absolute h-[110px] w-[110px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(94,234,212,0.10) 0%, rgba(59,130,246,0.04) 60%, transparent 100%)',
          }}
        />

        {/* The mark itself, with the inner-dot pulse when alive. */}
        <AurisIconMark
          alive={animated}
          className="relative h-[80px] w-[80px]"
        />
      </div>

      {/* Status copy — short, light serif. */}
      <div className="flex max-w-[320px] flex-col items-center gap-1.5">
        <h1 className="font-serif text-[22px] font-light leading-tight text-text">
          {headline}
        </h1>
        <p className="font-sans text-[12.5px] leading-relaxed text-muted">
          {hint}
        </p>
      </div>
    </div>
  );
}
