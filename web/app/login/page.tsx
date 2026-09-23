'use client';

import { useEffect, useRef, useState } from 'react';
import { GoogleLogo } from '@phosphor-icons/react';
import { AUTH_LOGIN_URL } from '@/lib/api';
import HeroBackground from '@/components/HeroBackground';

const LOGIN_ERRORS: Record<string, string> = {
  cancelled: 'Google sign-in was cancelled or your account was not allowed. Try again, or use the account this app is set up for.',
  expired: 'That sign-in attempt expired. Please click the button again.',
  google: 'Google returned an error during sign-in. Please try again.',
  server: 'Something went wrong on our side while signing you in. Please try again in a moment.',
};

export default function LoginPage() {
  const btnRef = useRef<HTMLAnchorElement>(null);
  const [error, setError] = useState<string | null>(null);

  // The backend's OAuth callback redirects here with ?error=<code> on any
  // failure. Read via window.location rather than useSearchParams so the
  // page doesn't need a Suspense boundary.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error');
    if (code) setError(LOGIN_ERRORS[code] ?? LOGIN_ERRORS.server);
  }, []);

  // Lightweight CSS spotlight (mouse-follow light) — a radial gradient
  // positioned via CSS custom properties updated on mousemove, not a JS
  // animation library. Cheap, no new dependency.
  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    btnRef.current!.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    btnRef.current!.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen px-4 overflow-hidden">
      <HeroBackground />
      <div className="w-full max-w-sm text-center relative z-10">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-green to-accent-cyan mx-auto mb-6 flex items-center justify-center">
          <span className="text-bg font-mono font-bold text-lg">J</span>
        </div>
        <h1 className="font-display text-display-sm font-medium text-white/90 mb-2">JobOS</h1>
        <p className="text-sm text-white/40 mb-8">
          Sign in to track your job search, prep interviews, and manage your learning.
        </p>
        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200 text-left">
            {error}
          </p>
        )}
        <a
          ref={btnRef}
          href={AUTH_LOGIN_URL}
          onMouseMove={handleMouseMove}
          className="spotlight-btn relative flex items-center justify-center gap-3 w-full px-4 py-3 rounded-xl bg-bg-1/80 backdrop-blur-sm hover:bg-white/10 border border-border transition-colors text-sm font-medium text-white/90 overflow-hidden"
        >
          <GoogleLogo size={18} weight="bold" className="relative z-10" />
          <span className="relative z-10">Sign in with Google</span>
        </a>
      </div>
    </div>
  );
}
