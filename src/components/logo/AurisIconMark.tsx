import { useId } from 'react';

interface Props {
  className?: string;
  strokeWidth?: number;
  /** When true, the inner dot pulses (used for "listening" affordances). */
  alive?: boolean;
}

/**
 * Compact ear-mark used in topbars and popup headers (~16–22px in practice).
 * The full animated logo lives in <AurisLogo />.
 */
export function AurisIconMark({ className, strokeWidth = 2.4, alive = false }: Props) {
  const gradId = useId();
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <path
        d="M 60 28 C 76 28 86 40 86 54 C 86 66 80 74 74 78 C 70 81 68 84 68 88 C 68 91 66 93 63 93 C 60 93 58 91 58 88 L 58 76 C 58 73 60 71 63 71 C 68 71 72 67 72 60 C 72 52 67 46 60 46 C 53 46 48 52 48 60 C 48 64 50 67 53 69 C 55 70 56 72 56 74 L 56 88"
        stroke={`url(#${gradId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="60"
        cy="60"
        r="3.2"
        fill="#3b82f6"
        className={alive ? 'animate-breathe origin-center' : undefined}
        style={alive ? { transformOrigin: '60px 60px' } : undefined}
      />
    </svg>
  );
}
