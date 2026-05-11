interface Props {
  /** Number of transcript finals captured since last clear. The rolling
   *  context window in main is 40 — at full it pulses to nudge clearing. */
  count: number;
  max?: number;
}

const DEFAULT_MAX = 40;

/**
 * Small SVG donut showing how full the rolling transcript context is.
 * Hidden when empty (no audio captured yet) so it doesn't add noise during
 * idle; pulses when ≥80% to gently suggest clearing before the model loses
 * the oldest frames.
 */
export function ContextIndicator({ count, max = DEFAULT_MAX }: Props) {
  if (count === 0) return null;

  const fraction = Math.min(count / max, 1);
  const isFull = fraction >= 0.8;
  const tone = isFull ? 'text-accent' : 'text-subtle';
  const dashArray = `${(fraction * 100).toFixed(1)} 100`;

  return (
    <div
      className={`flex items-center gap-1.5 ${tone} ${isFull ? 'animate-breathe' : ''}`}
      title={`Contexto: ${count}/${max} trechos transcritos. Quando passa de 40, os mais antigos são esquecidos. Limpe (Ctrl+L) ou shift-clique em Limpar pra preservar a última troca.`}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle
          cx="7"
          cy="7"
          r="5.2"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="1.4"
        />
        <circle
          cx="7"
          cy="7"
          r="5.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray={dashArray}
          pathLength="100"
          transform="rotate(-90 7 7)"
        />
      </svg>
      <span className="font-mono text-[9px] uppercase tracking-widest">
        {count}/{max}
      </span>
    </div>
  );
}
