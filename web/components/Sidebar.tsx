'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { SquaresFour, Briefcase, Brain, LinkSimple, DownloadSimple, ChartBar, FileText, User, MagnifyingGlass, DotsThree, GraduationCap, BookmarkSimple, PaperPlaneTilt, BookOpen, Compass, Sun, Moon, SignOut, X as CloseIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useGlobalSearch } from '@/components/GlobalSearch';
import { useAuth } from '@/components/AuthProvider';
import clsx from 'clsx';

const navItems = [
  { href: '/dashboard', icon: SquaresFour, label: 'Dashboard' },
  { href: '/jobs', icon: Briefcase, label: 'Jobs' },
  { href: '/batch', icon: PaperPlaneTilt, label: 'Batch Apply' },
  { href: '/analytics', icon: ChartBar, label: 'Analytics' },
  { href: '/train', icon: Brain, label: 'Train' },
  { href: '/learning', icon: GraduationCap, label: 'Learning' },
  { href: '/stories', icon: BookmarkSimple, label: 'Story Bank' },
  { href: '/resume', icon: FileText, label: 'Resume' },
  { href: '/profile', icon: User, label: 'Profile' },
  { href: '/links', icon: LinkSimple, label: 'Job Boards' },
  { href: '/guide', icon: Compass, label: 'Guide' },
  { href: '/docs', icon: BookOpen, label: 'Docs' },
];

// Mobile bottom nav only has room for ~5 comfortable tabs on a 375px screen
// (9 items — 7 nav links + Search + Export — was overflowing/cramping badly).
// Keep the 4 most-used destinations visible; everything else lives in "More".
const mobilePrimaryHrefs = ['/dashboard', '/jobs', '/train', '/analytics'];
const mobilePrimaryItems = navItems.filter((n) => mobilePrimaryHrefs.includes(n.href));
const mobileMoreItems = navItems.filter((n) => !mobilePrimaryHrefs.includes(n.href));

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const { open: openSearch } = useGlobalSearch();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes reads localStorage client-side only — theme is undefined
  // during SSR/first paint, so avoid rendering the wrong icon before the
  // real value is known (the CSS var swap itself has no such flash, since
  // next-themes injects a pre-hydration script for that).
  useEffect(() => setMounted(true), []);

  // Close the "More" sheet on route change so it doesn't stay open after navigating.
  useEffect(() => {
    setShowMore(false);
  }, [pathname]);

  useEffect(() => {
    if (!sidebarRef.current) return;
    const items = sidebarRef.current.querySelectorAll('.nav-item');
    gsap.fromTo(items,
      { x: -20, opacity: 0, scale: 0.9 },
      { x: 0, opacity: 1, scale: 1, stagger: 0.06, duration: 0.6, ease: 'back.out(1.7)', delay: 0.1 }
    );
  }, []);

  const handleExport = () => {
    api.export();
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        ref={sidebarRef}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
        className={clsx(
          'hidden md:flex flex-col sticky top-4 z-40 my-4 ml-4 rounded-[28px]',
          'h-[calc(100vh-2rem)] bg-bg-1 border border-border shadow-[0_4px_20px_rgb(var(--ink)/0.06)]',
          'transition-all duration-300 ease-in-out',
          isExpanded ? 'w-[220px]' : 'w-[64px]'
        )}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-border overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-accent-green/10 border border-accent-green/30 flex items-center justify-center flex-shrink-0">
            <span className="text-accent-green font-mono text-xs font-bold">JH</span>
          </div>
          {isExpanded && (
            <span className="ml-3 font-sans font-semibold text-white/90 whitespace-nowrap overflow-hidden text-sm">
              JobHunt
            </span>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 flex flex-col gap-1 px-2" ref={itemsRef}>
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <motion.div key={href} whileTap={{ scale: 0.94 }} whileHover={{ x: 2 }} transition={{ type: 'spring', stiffness: 400, damping: 17 }}>
                <Link
                  href={href}
                  className={clsx(
                    'nav-item relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-150 group',
                    isActive
                      ? 'bg-accent-green/10 text-accent-green border-l-2 border-accent-green'
                      : 'text-white/40 hover:text-white/80 hover:bg-white/5 border-l-2 border-transparent'
                  )}
                >
                  <Icon size={18} weight={isActive ? 'fill' : 'regular'} className="flex-shrink-0 transition-all duration-150" />
                  {isExpanded && (
                    <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
                      {label}
                    </span>
                  )}
                  {isActive && isExpanded && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-green" />
                  )}
                </Link>
              </motion.div>
            );
          })}

          {/* Search trigger */}
          <button
            onClick={openSearch}
            className="nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/40 hover:text-white/80 hover:bg-white/5 border-l-2 border-transparent transition-all duration-150 w-full text-left"
          >
            <MagnifyingGlass size={18} className="flex-shrink-0" />
            {isExpanded && (
              <span className="flex-1 flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium whitespace-nowrap">Search</span>
                <span className="ml-auto text-[10px] font-mono text-white/20 bg-white/5 px-1 py-0.5 rounded border border-white/6 flex-shrink-0">
                  ⌘K
                </span>
              </span>
            )}
          </button>
        </nav>

        {/* Bottom actions */}
        <div className="py-4 px-2 border-t border-border flex flex-col gap-1">
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/40 hover:text-accent-purple hover:bg-accent-purple/5 transition-all duration-150 active:scale-[0.97]"
            >
              {theme === 'dark' ? <Sun size={18} className="flex-shrink-0" /> : <Moon size={18} className="flex-shrink-0" />}
              {isExpanded && (
                <span className="text-sm font-medium whitespace-nowrap">
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </span>
              )}
            </button>
          )}
          <button
            onClick={handleExport}
            className="nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/40 hover:text-accent-yellow hover:bg-accent-yellow/5 transition-all duration-150"
          >
            <DownloadSimple size={18} className="flex-shrink-0" />
            {isExpanded && <span className="text-sm font-medium whitespace-nowrap">Export</span>}
          </button>

          {/* User avatar */}
          <div className="flex items-center gap-3 px-3 py-2.5 mt-1">
            {user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar_url} alt={user.name} className="w-8 h-8 rounded-full flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-green to-accent-cyan flex items-center justify-center flex-shrink-0">
                <span className="text-bg font-mono font-bold text-xs">
                  {(user?.name || '?').slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            {isExpanded && (
              <div className="overflow-hidden flex-1">
                <p className="text-xs font-semibold text-white/90 whitespace-nowrap truncate">{user?.name || 'Loading...'}</p>
                <p className="text-xs text-white/30 whitespace-nowrap truncate">{user?.email || ''}</p>
              </div>
            )}
            <button
              onClick={logout}
              title="Sign out"
              className="p-1.5 rounded-lg text-white/30 hover:text-accent-pink hover:bg-accent-pink/10 transition-colors flex-shrink-0"
            >
              <SignOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile "More" sheet — everything not in the primary 4-tab bar */}
      {showMore && (
        <>
          <div
            className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMore(false)}
          />
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-1 border-t border-border rounded-t-2xl px-4 pt-4 pb-8">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-white/30 uppercase tracking-widest">More</span>
              <button onClick={() => setShowMore(false)} className="p-1 text-white/40">
                <CloseIcon size={18} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {mobileMoreItems.map(({ href, icon: Icon, label }) => {
                const isActive = pathname === href || pathname.startsWith(href + '/');
                return (
                  <Link
                    key={href}
                    href={href}
                    className={clsx(
                      'flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all duration-150 active:scale-95',
                      isActive ? 'text-accent-green bg-accent-green/10' : 'text-white/50 bg-white/5'
                    )}
                  >
                    <Icon size={20} />
                    <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
                  </Link>
                );
              })}
              <button
                onClick={() => { setShowMore(false); openSearch(); }}
                className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-white/50 bg-white/5"
              >
                <MagnifyingGlass size={20} />
                <span className="text-[10px] font-medium">Search</span>
              </button>
              <button
                onClick={() => { setShowMore(false); handleExport(); }}
                className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-white/50 bg-white/5"
              >
                <DownloadSimple size={20} />
                <span className="text-[10px] font-medium">Export</span>
              </button>
              {mounted && (
                <button
                  onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); }}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-white/50 bg-white/5 active:scale-95"
                >
                  {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                  <span className="text-[10px] font-medium">{theme === 'dark' ? 'Light' : 'Dark'}</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Mobile Bottom Nav — 4 primary destinations + More, sized to fit 375px comfortably */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-1/95 backdrop-blur-lg border-t border-border flex items-center justify-around px-2 py-2">
        {mobilePrimaryItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <motion.div key={href} whileTap={{ scale: 0.85 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }}>
              <Link
                href={href}
                className={clsx(
                  'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl',
                  isActive ? 'text-accent-green' : 'text-white/40'
                )}
              >
                <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            </motion.div>
          );
        })}
        <motion.button
          onClick={() => setShowMore(true)}
          whileTap={{ scale: 0.85 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
          className={clsx(
            'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl',
            showMore ? 'text-accent-green' : 'text-white/40'
          )}
        >
          <DotsThree size={20} weight={showMore ? 'fill' : 'regular'} />
          <span className="text-[10px] font-medium">More</span>
        </motion.button>
      </nav>
    </>
  );
}
