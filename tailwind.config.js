/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces — five layers of elevation, all near-black with a slight cool bias.
        bg:        '#08090d',
        surface:   '#0f1218',
        elevated:  '#161a23',
        raised:    '#1d222d',
        overlay:   '#262c3a',

        // Hairlines — used at 30–60% opacity rather than full strength.
        border:    '#2a3142',
        hairline:  '#1a1f2a',

        // Text — three steps for hierarchy.
        text:      '#f6f6f8',
        muted:     '#8a90a3',
        faint:     '#4a4f60',

        // Primary accent — warm amber. The single warm color in the system;
        // anchors all "this is where you act" affordances.
        accent: {
          DEFAULT:  '#fbbf24',
          bright:   '#fcd34d',
          deep:     '#f59e0b',
          ink:      '#7c4f02',
        },

        // Live / status — cool cyan; reserved for "Auris is listening".
        live: {
          DEFAULT: '#22d3ee',
          deep:    '#0891b2',
        },

        // System
        success: '#10b981',
        danger:  '#f87171',

        // Brand gradient stops (used inside the logo SVG).
        brand: {
          from: '#5eead4', // mint-cyan
          to:   '#3b82f6', // blue
        },
      },
      fontFamily: {
        // Default UI font — clean, neutral, dense readable.
        sans:  ['Inter', '-apple-system', 'system-ui', 'sans-serif'],
        // Brand wordmark + display moments only.
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        // Code, identifiers, small caps labels.
        mono:  ['"DM Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        wider: '0.06em',
        widest: '0.18em',
        eyebrow: '0.22em',
      },
      boxShadow: {
        'panel':       '0 24px 60px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.03) inset',
        'card':        '0 8px 24px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.04) inset',
        'pop':         '0 18px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset',
        'accent-glow': '0 0 0 1px rgba(251, 191, 36, 0.2), 0 8px 24px rgba(251, 191, 36, 0.12)',
        'live-glow':   '0 0 12px rgba(34, 211, 238, 0.55)',
      },
      keyframes: {
        // Brand mark: gentle breathing for the glow ring.
        'pulse-ring': {
          '0%, 100%': { opacity: '0.18', transform: 'scale(1)' },
          '50%':      { opacity: '0.45', transform: 'scale(1.08)' },
        },
        // Brand mark: floats upward then settles.
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-3px)' },
        },
        // Live status indicator — slower breathe, more analog feel.
        breathe: {
          '0%, 100%': { opacity: '1',   transform: 'scale(1)' },
          '50%':      { opacity: '0.55', transform: 'scale(1.18)' },
        },
        // Streaming caret.
        'caret-blink': {
          '0%, 70%, 100%': { opacity: '1' },
          '20%, 50%':      { opacity: '0' },
        },
        // Subtle entrance for screens.
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Soft loading shimmer for skeletons / streaming bg.
        shimmer: {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'pulse-ring':  'pulse-ring 3s ease-in-out infinite',
        float:         'float 4s ease-in-out infinite',
        breathe:       'breathe 1.8s ease-in-out infinite',
        'caret-blink': 'caret-blink 1.1s ease-in-out infinite',
        'fade-up':     'fade-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        shimmer:       'shimmer 2.4s linear infinite',
      },
      backdropBlur: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '20px',
        xl: '32px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
