import type { Metadata } from 'next';
import { Fragment_Mono, Outfit } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import { GlobalSearchProvider } from '@/components/GlobalSearch';
import IconWeightProvider from '@/components/IconWeightProvider';

const fragmentMono = Fragment_Mono({
  weight: ['400'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const outfit = Outfit({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'JobHunt — Aman\'s Job Search Dashboard',
  description: 'Track, find, and ace your job search with AI-powered insights.',
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='24' fill='%23FBFAF7'/%3E%3Ccircle cx='50' cy='50' r='32' fill='none' stroke='%233F7355' stroke-width='9'/%3E%3Ccircle cx='50' cy='50' r='12' fill='%233F7355'/%3E%3C/svg%3E",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fragmentMono.variable} ${outfit.variable}`} suppressHydrationWarning>
      <body className="bg-bg font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {/* Google Material Symbols / Pixel-style icons read as filled, not
              thin-outline — this sets that as the app-wide default for every
              Phosphor icon; any icon with its own explicit `weight` prop
              (e.g. active-state toggles) still overrides it as normal. */}
          <IconWeightProvider>
            {/* Dot grid background */}
            <div className="dot-grid fixed inset-0 pointer-events-none z-0" />

            {/* App shell */}
            <GlobalSearchProvider>
              <div className="relative z-10 flex min-h-screen">
                <Sidebar />
                <main className="flex-1 overflow-y-auto min-h-screen">
                  {children}
                </main>
              </div>
            </GlobalSearchProvider>
          </IconWeightProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
