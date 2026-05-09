import { useId } from 'react';

interface Props {
  className?: string;
}

/**
 * Full-size animated Auris logomark — used on auth + setup screens.
 * Glow ring (pulse-ring) + soft float on the mark + saturated brand gradient.
 */
export function AurisLogo({ className }: Props) {
  const glowId = useId();
  const earId = useId();
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible' }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={earId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>

      <circle
        className="origin-center animate-pulse-ring"
        cx="60"
        cy="60"
        r="52"
        stroke="#3b82f6"
        strokeOpacity="0.35"
        strokeWidth="0.6"
        fill={`url(#${glowId})`}
      />

      <g className="origin-center animate-float">
        {/* Sound waves */}
        <path d="M 28 60 Q 34 50 28 40" stroke="#3b82f6" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M 22 64 Q 30 50 22 36" stroke="#3b82f6" strokeOpacity="0.3"  strokeWidth="1"   strokeLinecap="round" />
        <path d="M 92 60 Q 86 50 92 40" stroke="#3b82f6" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M 98 64 Q 90 50 98 36" stroke="#3b82f6" strokeOpacity="0.3"  strokeWidth="1"   strokeLinecap="round" />

        {/* Stylized ear */}
        <path
          d="M 60 28 C 76 28 86 40 86 54 C 86 66 80 74 74 78 C 70 81 68 84 68 88 C 68 91 66 93 63 93 C 60 93 58 91 58 88 L 58 76 C 58 73 60 71 63 71 C 68 71 72 67 72 60 C 72 52 67 46 60 46 C 53 46 48 52 48 60 C 48 64 50 67 53 69 C 55 70 56 72 56 74 L 56 88"
          stroke={`url(#${earId})`}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <circle cx="60" cy="60" r="3.4" fill="#3b82f6" />
        <circle cx="60" cy="60" r="1.4" fill="#5eead4" />
      </g>
    </svg>
  );
}
