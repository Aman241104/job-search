import type { Metadata } from 'next';
import { Fragment_Mono, Outfit } from 'next/font/google';
import localFont from 'next/font/local';
import { ThemeProvider } from 'next-themes';
import './globals.css';
import AuthProvider from '@/components/AuthProvider';
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

// Display face — used only for hero moments (dashboard greeting, login,
// onboarding headers) via the `font-display` utility, not the app's body
// text. Self-hosted (Fontshare, free for commercial use) rather than a
// remote <link>, same zero-layout-shift next/font mechanism as the two
// Google fonts above.
const cabinetGrotesk = localFont({
  src: [
    { path: './fonts/CabinetGrotesk-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/CabinetGrotesk-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/CabinetGrotesk-Bold.woff2', weight: '700', style: 'normal' },
    { path: './fonts/CabinetGrotesk-Black.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'JobHunt — Your AI Job Search Dashboard',
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
    <html lang="en" className={`${fragmentMono.variable} ${outfit.variable} ${cabinetGrotesk.variable}`} suppressHydrationWarning>
      <body className="bg-bg font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {/* Google Material Symbols / Pixel-style icons read as filled, not
              thin-outline — this sets that as the app-wide default for every
              Phosphor icon; any icon with its own explicit `weight` prop
              (e.g. active-state toggles) still overrides it as normal. */}
          <IconWeightProvider>
            {/* Dot grid background */}
            <div className="dot-grid fixed inset-0 pointer-events-none z-0" />

            {/* App shell — gated by auth, redirects to /login if no session */}
            <AuthProvider>{children}</AuthProvider>
          </IconWeightProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
