'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import gsap from 'gsap';
import {
  LayoutDashboard,
  Briefcase,
  Brain,
  Link2,
  Download,
  BarChart2,
  FileText,
  User,
  Search,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useGlobalSearch } from '@/components/GlobalSearch';
import clsx from 'clsx';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/jobs', icon: Briefcase, label: 'Jobs' },
  { href: '/analytics', icon: BarChart2, label: 'Analytics' },
  { href: '/train', icon: Brain, label: 'Train' },
  { href: '/resume', icon: FileText, label: 'Resume' },
  { href: '/profile', icon: User, label: 'Profile' },
  { href: '/links', icon: Link2, label: 'Job Boards' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const { open: openSearch } = useGlobalSearch();

  useEffect(() => {
    if (!sidebarRef.current) return;
    const items = sidebarRef.current.querySelectorAll('.nav-item');
    gsap.fromTo(items,
      { x: -30, opacity: 0 },
      { x: 0, opacity: 1, stagger: 0.07, duration: 0.5, ease: 'power3.out', delay: 0.1 }
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
          'hidden md:flex flex-col h-screen sticky top-0 z-40',
          'bg-bg-1 border-r border-border transition-all duration-300 ease-in-out',
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
              <Link
                key={href}
                href={href}
                className={clsx(
                  'nav-item relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group',
                  isActive
                    ? 'bg-accent-green/10 text-accent-green border-l-2 border-accent-green'
                    : 'text-white/40 hover:text-white/80 hover:bg-white/5 border-l-2 border-transparent'
                )}
              >
                <Icon
                  size={18}
                  className={clsx(
                    'flex-shrink-0 transition-all duration-150',
                    isActive ? 'drop-shadow-[0_0_8px_rgba(99,255,178,0.6)]' : ''
                  )}
                />
                {isExpanded && (
                  <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
                    {label}
                  </span>
                )}
                {isActive && isExpanded && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-green shadow-[0_0_6px_rgba(99,255,178,0.8)]" />
                )}
              </Link>
            );
          })}

          {/* Search trigger */}
          <button
            onClick={openSearch}
            className="nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/40 hover:text-white/80 hover:bg-white/5 border-l-2 border-transparent transition-all duration-150 w-full text-left"
          >
            <Search size={18} className="flex-shrink-0" />
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
          <button
            onClick={handleExport}
            className="nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/40 hover:text-accent-yellow hover:bg-accent-yellow/5 transition-all duration-150"
          >
            <Download size={18} className="flex-shrink-0" />
            {isExpanded && <span className="text-sm font-medium whitespace-nowrap">Export</span>}
          </button>

          {/* User avatar */}
          <div className="flex items-center gap-3 px-3 py-2.5 mt-1">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-green to-accent-cyan flex items-center justify-center flex-shrink-0 shadow-[0_0_12px_rgba(99,255,178,0.3)]">
              <span className="text-bg font-mono font-bold text-xs">AP</span>
            </div>
            {isExpanded && (
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-white/90 whitespace-nowrap">Aman Patel</p>
                <p className="text-xs text-white/30 whitespace-nowrap">Job Seeker</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-1/95 backdrop-blur-lg border-t border-border flex items-center justify-around px-2 py-2">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-150',
                isActive ? 'text-accent-green' : 'text-white/40'
              )}
            >
              <Icon
                size={20}
                className={isActive ? 'drop-shadow-[0_0_8px_rgba(99,255,178,0.6)]' : ''}
              />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
        <button
          onClick={openSearch}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-white/40"
        >
          <Search size={20} />
          <span className="text-[10px] font-medium">Search</span>
        </button>
        <button
          onClick={handleExport}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-white/40"
        >
          <Download size={20} />
          <span className="text-[10px] font-medium">Export</span>
        </button>
      </nav>
    </>
  );
}
