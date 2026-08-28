/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every colour resolves to a CSS variable declared in src/index.css.
        // That file is the single source of truth; nothing here holds a
        // literal except the few status colours that have no token yet.
        //
        // The `rgb(var(--x) / <alpha-value>)` form is what keeps Tailwind's
        // opacity modifiers (`bg-danger/10`, `hover:bg-elevated/50`) working.
        bg:        'rgb(var(--bg-app) / <alpha-value>)',
        surface:   'rgb(var(--bg-panel) / <alpha-value>)',
        elevated:  'rgb(var(--bg-elevated) / <alpha-value>)',
        raised:    'rgb(var(--border) / <alpha-value>)',
        overlay:   'rgb(var(--border) / <alpha-value>)',

        border:    'rgb(var(--border) / <alpha-value>)',
        hairline:  'rgb(var(--border-subtle) / <alpha-value>)',

        // Content voice. `primary`/`secondary`/`label`/`muted` mirror the
        // token names exactly; `text`, `light`, `subtle` and `faint` are the
        // legacy keys, repointed at the nearest token so existing components
        // pick up the new palette without being rewritten.
        primary:   'rgb(var(--text-primary) / <alpha-value>)',
        secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
        label:     'rgb(var(--text-label) / <alpha-value>)',
        muted:     'rgb(var(--text-muted) / <alpha-value>)',

        text:      'rgb(var(--text-primary) / <alpha-value>)',
        light:     'rgb(var(--text-primary) / <alpha-value>)',
        subtle:    'rgb(var(--text-secondary) / <alpha-value>)',
        faint:     'rgb(var(--text-label) / <alpha-value>)',

        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          bright:  'rgb(var(--accent) / <alpha-value>)',
          deep:    '#0f4ab0',
          tint:    '#e8f0fc',
          ink:     '#ffffff',
        },

        // Live / status — teal. Reserved for "Auris is listening" and the
        // right half of the EQ mark.
        live: {
          DEFAULT: '#0db8a0',
          deep:    '#088a78',
          tint:    '#0db8a014',
        },

        // System
        success: '#0db8a0',
        danger:  '#f06060',

        // Paper — used for light-mode logo variants only.
        paper:   '#f0f3f7',
      },
      fontFamily: {
        // Display + UI — geometric sans for the corporate-grid feel.
        sans: ['Epilogue', '-apple-system', 'system-ui', 'sans-serif'],
        // Mono — labels, statuses, code, telemetry.
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        wider: '0.06em',
        widest: '0.18em',
        eyebrow: '0.22em',
      },
      maxWidth: {
        // Reading measure — 65-70 characters. Applied to every block of
        // prose so a wide window never stretches a paragraph past the point
        // where the eye loses the next line.
        reading: '62ch',
      },
      borderRadius: {
        // Sharp/hairline aesthetic — no large radii anywhere in the system.
        sharp: '2px',
        soft:  '4px',
      },
      boxShadow: {
        // Drop shadow drama dialed back — the design relies on hairlines.
        pop:    '0 24px 64px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.5)',
        card:   '0 12px 32px rgba(0,0,0,0.4)',
        'blue-glow':  '0 0 0 1px rgba(26,108,240,0.18), 0 8px 24px rgba(26,108,240,0.14)',
        'live-glow':  '0 0 6px rgba(13,184,160,0.7)',
      },
      keyframes: {
        // EQ bars subtle aliveness — vertical pulse when listening.
        'eq-pulse': {
          '0%, 100%': { transform: 'scaleY(1)' },
          '50%':      { transform: 'scaleY(0.7)' },
        },
        // Live status indicator — softer breathe.
        breathe: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.35' },
        },
        // Streaming caret.
        'caret-blink': {
          '0%, 70%, 100%': { opacity: '1' },
          '20%, 50%':      { opacity: '0' },
        },
        // Concentric ripples emanating from the popup idle icon when listening.
        'sound-wave': {
          '0%':   { transform: 'scale(1)',   opacity: '0.45' },
          '70%':  { opacity: '0.05' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        // Subtle entrance for screens.
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Loading shimmer used by ShimmerBar in the conversation while
        // waiting for the first response token.
        shimmer: {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'eq-pulse':    'eq-pulse 1.6s ease-in-out infinite',
        breathe:       'breathe 2s ease-in-out infinite',
        'caret-blink': 'caret-blink 1.1s ease-in-out infinite',
        'sound-wave':  'sound-wave 2.4s cubic-bezier(0.2, 0.8, 0.2, 1) infinite',
        'fade-up':     'fade-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        shimmer:       'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
