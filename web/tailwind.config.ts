import type { Config } from 'tailwindcss';

// Generates the { 0: 'rgb(var(--green-0)/<alpha-value>)', 10: ..., ... }
// shape for one tonal family, so `bg-green-40`, `text-blue-80` etc. are
// available for components that need a specific tone from the ramp (not
// just the flat `accent-*` alias) — e.g. StatCard's blob visualization.
const TONE_STOPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100];
function tonalScale(family: string): Record<number, string> {
  return Object.fromEntries(
    TONE_STOPS.map((t) => [t, `rgb(var(--${family}-${t}) / <alpha-value>)`])
  );
}

const config: Config = {
  // next-themes toggles a literal `.dark` class on <html> (app/layout.tsx) —
  // without this, Tailwind defaults to 'media' and every `dark:` utility
  // variant responds to OS-level prefers-color-scheme instead of the app's
  // actual theme toggle, while the CSS-var-based colors above (which read
  // .dark via plain CSS selector matching in globals.css) correctly do.
  darkMode: 'class',
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
        // Full 13-stop tonal ramps (Material 3's own tone stops), generated
        // from the same 5 seed hues as the accent-* aliases above — see
        // web/lib/theme.ts for the generator and globals.css for the values.
        // Named `tone-*` (not `green`/`blue`/etc.) to avoid colliding with
        // Tailwind's own default color scales, which are still used
        // elsewhere for source badges (e.g. text-purple-700, text-pink-700).
        'tone-green': tonalScale('green'),
        'tone-blue': tonalScale('blue'),
        'tone-purple': tonalScale('purple'),
        'tone-yellow': tonalScale('yellow'),
        'tone-pink': tonalScale('pink'),
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
        },
      },
      fontFamily: {
        // Reference next/font's own CSS vars (set on <html> in layout.tsx)
        // instead of hardcoding the family name a second time — next/font
        // already appends its own optimized fallback stack to these vars.
        mono: ['var(--font-mono)', 'monospace'],
        sans: ['var(--font-sans)', 'sans-serif'],
        // Hero-moment-only display face (dashboard greeting, login,
        // onboarding headers) — never used for body/dashboard-density text.
        display: ['var(--font-display)', 'sans-serif'],
      },
      fontSize: {
        // Fluid, clamp()-based — for the new display face only. Dashboard
        // body text stays on Tailwind's fixed scale (data density needs
        // predictable line-wrapping; fluid type there would hurt scanning).
        'display-sm': ['clamp(1.5rem, 1.25rem + 1.25vw, 2.25rem)', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        'display-md': ['clamp(2rem, 1.5rem + 2.5vw, 3.25rem)', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display-lg': ['clamp(2.5rem, 1.75rem + 3.75vw, 4.5rem)', { lineHeight: '1', letterSpacing: '-0.02em' }],
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      // Redefining every standard radius key (still under `extend`, so any
      // key not listed here would fall back to Tailwind's default) means
      // every existing rounded-lg/xl/2xl/3xl class across ~240 call sites
      // automatically gets bigger, chunkier, more "Material You" — zero
      // component changes needed, same trick as the color tokens above.
      borderRadius: {
        none: '0',
        sm: '6px',
        DEFAULT: '10px',
        md: '14px',
        lg: '18px',
        xl: '22px',
        '2xl': '28px',
        '3xl': '36px',
        full: '9999px',
      },
    },
  },
  plugins: [],
};

export default config;
