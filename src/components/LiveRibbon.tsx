import type { StatusKind } from '../../shared/ipc';

interface Props {
  status: StatusKind;
  partialLine: string;
  latestFinal: string;
}

const STATUS_HINT: Record<StatusKind, string> = {
  idle: 'pronto pra ouvir',
  listening: 'ouvindo',
  processing: 'pensando',
  paused: 'pausado',
  reconnecting: 'reconectando',
  error: 'erro',
};

/**
 * Ambient status strip pinned to the top of the conversation canvas.
 * Replaces the old transcript-as-a-card pattern: instead of competing with
 * the response, the live transcript whispers underneath the brand line.
 *
 * - Idle: just shows brand state ("pronto pra ouvir")
 * - Listening with audio: dot pulses in cyan + last partial scrolls in
 * - Processing/error: dot color matches state
 *
 * Single line, ellipsis-truncated; long sentences fade off the right edge.
 */
export function LiveRibbon({ status, partialLine, latestFinal }: Props) {
  const text = partialLine || latestFinal;

  const dotClass =
    status === 'listening'  ? 'bg-live shadow-live-glow' :
    status === 'processing' ? 'bg-accent shadow-accent-glow' :
    status === 'error'      ? 'bg-danger' :
                              'bg-faint';
  const animate = status === 'listening' || status === 'processing';

  return (
    <div className="relative flex items-center gap-2.5 px-4 py-2.5 text-[12px]">
      {/* breathing dot */}
      <span className="relative grid h-3 w-3 shrink-0 place-items-center">
        {animate && (
          <span
            className={`absolute inset-0 rounded-full opacity-30 ${
              status === 'listening' ? 'bg-live' : 'bg-accent'
            } animate-breathe`}
          />
        )}
        <span className={`relative h-1.5 w-1.5 rounded-full ${dotClass}`} />
      </span>

      <span className="font-mono text-[9px] uppercase tracking-widest text-muted shrink-0">
        {STATUS_HINT[status]}
      </span>

      <span className="h-3 w-px bg-white/[0.08] shrink-0" />

      <div className="relative flex-1 overflow-hidden">
        {text ? (
          <span className="block truncate font-sans text-text/65">
            {text}
          </span>
        ) : (
          <span className="font-sans italic text-faint/70">
            sem áudio capturado ainda
          </span>
        )}
        {/* fade gradient on right edge */}
        <span className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-bg via-bg/80 to-transparent" />
      </div>
    </div>
  );
}
