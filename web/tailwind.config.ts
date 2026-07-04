import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Every color below resolves through a CSS custom property holding a
        // raw "R G B" triplet (not a hex string) via rgb(var(--x) / <alpha-value>)
        // — this is Tailwind's documented pattern for CSS-var-based colors
        // that still support opacity modifiers (bg-white/20, text-accent-green/10,
        // etc. — used at hundreds of call sites across this app). Swapping
        // the variable values in globals.css (:root vs .dark) re-themes the
        // entire app with zero component changes, since nothing here is a
        // static hex value anymore.
        //
        // Overriding Tailwind's built-in `white` (not just extending) means
        // every existing `text-white/NN`, `bg-white/NN`, `border-white/NN`
        // usage across the app automatically becomes ink-on-canvas at the
        // same opacity, instead of requiring a per-file rewrite.
        white: 'rgb(var(--ink) / <alpha-value>)',
        bg: {
          DEFAULT: 'rgb(var(--bg) / <alpha-value>)',
          1: 'rgb(var(--bg-1) / <alpha-value>)',
          2: 'rgb(var(--bg-2) / <alpha-value>)',
          3: 'rgb(var(--bg-3) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
        },
        // Same 5 accent slots as before (keeps every existing className
        // working) — muted, considered tones rather than neon, tuned per
        // theme (light values read clearly on a light card; dark mode gets
        // its own brighter variants for contrast, defined in globals.css).
        accent: {
          green: 'rgb(var(--accent-green) / <alpha-value>)',
          cyan: 'rgb(var(--accent-cyan) / <alpha-value>)',
          purple: 'rgb(var(--accent-purple) / <alpha-value>)',
          yellow: 'rgb(var(--accent-yellow) / <alpha-value>)',
          pink: 'rgb(var(--accent-pink) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
        },
      },
      fontFamily: {
        mono: ['"Fragment Mono"', 'monospace'],
        sans: ['Outfit', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
