interface Props {
  className?: string;
  /** When true, the bars subtly pulse to signal "listening". */
  alive?: boolean;
}

/**
 * Compact equalizer-bars mark used in topbars and popup headers
 * (~16–22px in practice). Five vertical bars: three blue ascending,
 * two teal descending — a symmetric waveform that reads as "sound" without
 * being literal. The full-size variant lives in <AurisLogo />.
 */
export function AurisIconMark({ className, alive = false }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <Bar x={10} y={24} h={20} fill="#1a6cf0" opacity={0.4}  alive={alive} delay="0s"     />
      <Bar x={17} y={16} h={28} fill="#1a6cf0" opacity={0.65} alive={alive} delay="0.18s"  />
      <Bar x={24} y={10} h={36} fill="#1a6cf0" opacity={1}    alive={alive} delay="0.36s"  />
      <Bar x={31} y={16} h={28} fill="#0db8a0" opacity={0.8}  alive={alive} delay="0.54s"  />
      <Bar x={38} y={22} h={22} fill="#0db8a0" opacity={0.5}  alive={alive} delay="0.72s"  />
    </svg>
  );
}

/** A single vertical EQ bar. `alive` enables the scaleY pulse, staggered
 *  per bar via `delay` so they animate as a sequence not in unison. */
function Bar({
  x, y, h, fill, opacity, alive, delay,
}: {
  x: number; y: number; h: number; fill: string; opacity: number;
  alive: boolean; delay: string;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={4}
      height={h}
      rx={1}
      fill={fill}
      opacity={opacity}
      className={alive ? 'animate-eq-pulse' : undefined}
      style={alive ? {
        transformBox: 'fill-box',
        transformOrigin: 'bottom',
        animationDelay: delay,
      } : undefined}
    />
  );
}
