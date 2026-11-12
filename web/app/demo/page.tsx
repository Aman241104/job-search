'use client';

import { useEffect } from 'react';
import { setDemo } from '@/lib/demo';

// The portfolio links here: switch on demo mode (sample data, no sign-in) and open the dashboard.
// A full page load, so every component starts in demo mode.
export default function DemoPage() {
  useEffect(() => {
    setDemo(true);
    window.location.replace('/dashboard');
  }, []);
  return (
    <div className="flex items-center justify-center min-h-screen text-white/50 font-mono text-sm">
      Opening the demo…
    </div>
  );
}
