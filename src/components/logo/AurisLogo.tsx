interface Props {
  className?: string;
  /** When true, the bars subtly pulse to signal "listening". */
  alive?: boolean;
}

/**
 * Full-size Auris mark — same EQ bars as <AurisIconMark/> but rendered at
 * display sizes (40px+) with a baseline rule for the corporate-grid feel.
 * Used on auth + setup screens.
 */
export function AurisLogo({ className, alive = true }: Props) {
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
      {/* Baseline rule — grounds the bars and echoes the brand-system hairlines. */}
      <line x1={8} y1={48} x2={48} y2={48} stroke="#252d38" strokeWidth={1} />
    </svg>
  );
}

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
