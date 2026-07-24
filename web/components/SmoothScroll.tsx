'use client';

import { ReactLenis } from 'lenis/react';

// Inertia scroll for long-form content pages (docs/guide) — NOT mounted
// globally. The app-shell dashboard pages don't really scroll past one
// viewport in normal use, and Lenis's global scroll hijack doesn't mix well
// with pages that have their own nested scrollable panels (chat, drawers).
export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  return (
    <ReactLenis root options={{ lerp: 0.12, duration: 1.1 }}>
      {children}
    </ReactLenis>
  );
}
