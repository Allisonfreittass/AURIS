import type { StatusKind } from '../../shared/ipc';

interface Props {
  status: StatusKind;
}

const LABELS: Record<StatusKind, string> = {
  idle: 'pronto',
  listening: 'ouvindo',
  processing: 'pensando',
  paused: 'pausado',
  reconnecting: 'reconectando',
  error: 'erro',
};

const STYLES: Record<StatusKind, { dot: string; text: string; ring?: string }> = {
  idle:         { dot: 'bg-muted',                 text: 'text-subtle' },
  listening:    { dot: 'bg-live shadow-live-glow', text: 'text-live',   ring: 'bg-live/40' },
  processing:   { dot: 'bg-accent',                text: 'text-accent', ring: 'bg-accent/40' },
  paused:       { dot: 'bg-muted',                 text: 'text-subtle' },
  reconnecting: { dot: 'bg-accent',                text: 'text-accent' },
  error:        { dot: 'bg-danger',                text: 'text-danger' },
};

export function StatusIndicator({ status }: Props) {
  const s = STYLES[status];
  const animated = status === 'listening' || status === 'processing' || status === 'reconnecting';

  return (
    <div className="flex items-center gap-2">
      <span className="relative grid h-3 w-3 place-items-center">
        {animated && s.ring && (
          <span className={`absolute inset-0 rounded-full ${s.ring} animate-breathe`} />
        )}
        <span className={`relative h-1.5 w-1.5 rounded-full ${s.dot}`} />
      </span>
      <span
        className={`font-mono text-[10px] uppercase tracking-widest ${s.text}`}
      >
        {LABELS[status]}
      </span>
    </div>
  );
}
