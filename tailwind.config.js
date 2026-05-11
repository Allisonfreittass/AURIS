/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces — corporate-dark, near-black with a slight cool bias.
        // Tighter stepping than the old palette: less gradient, more
        // distinct hairline-separated planes.
        bg:        '#0a0c0f', // ink
        surface:   '#161a20', // ink-2
        elevated:  '#1f2530', // ink-3
        raised:    '#252d38', // matches rule on purpose — used for chips/tags
        overlay:   '#2a3340',

        // Hairlines — single, deliberate rule color used 100% strength.
        border:    '#252d38', // rule
        hairline:  '#1f2530', // softer divider where rule is too loud

        // Text — five steps for hierarchy.
        text:      '#ffffff', // white headlines
        light:     '#c8d4e0', // body
        subtle:    '#8a9ab0', // secondary
        muted:     '#5a6880', // tertiary / mono labels
        faint:     '#3a4555', // disabled / dividers in text

        // Primary accent — corporate blue. The brand color; anchors actions,
        // the dot in "Auris.", and the left half of the EQ mark.
        accent: {
          DEFAULT: '#1a6cf0', // blue
          bright:  '#4a8cff',
          deep:    '#0f4ab0', // blue-d
          tint:    '#e8f0fc', // blue-l (light bg/tinted fills)
          ink:     '#ffffff', // text color over solid blue
        },

        // Live / status — teal. Reserved for "Auris is listening" and the
        // right half of the EQ mark.
        live: {
          DEFAULT: '#0db8a0', // teal
          deep:    '#088a78', // teal-d
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
