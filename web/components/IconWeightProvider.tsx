'use client';

import { IconContext } from '@phosphor-icons/react';

// React Context providers need a Client Component boundary — using
// IconContext.Provider directly inside app/layout.tsx (a Server Component)
// broke the Next.js build ("createContext is not a function" during static
// page data collection). This tiny wrapper is the fix, same pattern
// next-themes' own ThemeProvider already uses internally.
export default function IconWeightProvider({ children }: { children: React.ReactNode }) {
  return <IconContext.Provider value={{ weight: 'fill' }}>{children}</IconContext.Provider>;
}
