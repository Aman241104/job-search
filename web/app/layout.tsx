import type { Metadata } from 'next';
import { Fragment_Mono, Outfit } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import { GlobalSearchProvider } from '@/components/GlobalSearch';

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
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎯</text></svg>",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fragmentMono.variable} ${outfit.variable}`}>
      <body className="bg-bg font-sans antialiased">
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
      </body>
    </html>
  );
}
