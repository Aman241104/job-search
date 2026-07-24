'use client';

import { GoogleLogo } from '@phosphor-icons/react';
import { AUTH_LOGIN_URL } from '@/lib/api';

export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-green to-accent-cyan mx-auto mb-6 flex items-center justify-center">
          <span className="text-bg font-mono font-bold text-lg">J</span>
        </div>
        <h1 className="font-display text-display-sm font-medium text-white/90 mb-2">JobOS</h1>
        <p className="text-sm text-white/40 mb-8">
          Sign in to track your job search, prep interviews, and manage your learning.
        </p>
        <a
          href={AUTH_LOGIN_URL}
          className="flex items-center justify-center gap-3 w-full px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-border transition-colors text-sm font-medium text-white/90"
        >
          <GoogleLogo size={18} weight="bold" />
          Sign in with Google
        </a>
      </div>
    </div>
  );
}
