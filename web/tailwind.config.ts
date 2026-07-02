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
        bg: {
          DEFAULT: '#050508',
          1: '#0a0a0f',
          2: '#0e0e16',
          3: '#131320',
        },
        accent: {
          green: '#63ffb2',
          pink: '#ff4ecd',
          purple: '#a78bfa',
          cyan: '#67e8f9',
          yellow: '#fbbf24',
        },
        border: {
          DEFAULT: 'rgba(255,255,255,0.06)',
          glow: 'rgba(99,255,178,0.15)',
        },
      },
      fontFamily: {
        mono: ['"Fragment Mono"', 'monospace'],
        sans: ['Outfit', 'sans-serif'],
      },
      animation: {
        drift: 'drift 20s linear infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        drift: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '24px 24px' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
