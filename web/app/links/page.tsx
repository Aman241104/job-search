'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ArrowSquareOut, GraduationCap, Briefcase, MagnifyingGlass, Scissors, Lightning, ChatCircle, UsersFour, Buildings, TrendUp, Globe, Radio, Monitor, GlobeHemisphereWest, House, Laptop, Palette, Newspaper, Icon } from '@phosphor-icons/react';
import clsx from 'clsx';


interface Platform {
  name: string;
  description: string;
  icon: Icon;
  url: string;
  color: string;
  accent: string;
  tag: string;
  autoScraped?: boolean;
}

// Every accent cycles through the app's 5 defined tokens (which have real
// --accent-* CSS custom properties in globals.css) rather than reaching for
// one-off Tailwind default colors — the previous version referenced colors
// like text-blue-400/text-orange-400 whose `var(--blue-400)` doesn't exist
// as a custom property at all, so the hover glow effect below silently did
// nothing for most of these cards even before this redesign.
const PLATFORMS: Platform[] = [
  // ── India Platforms ──────────────────────────────────────────────────────
  {
    name: 'Internshala',
    description: 'Best for fresher jobs & internships in India. Auto-scraped by this dashboard.',
    icon: GraduationCap,
    url: 'https://internshala.com/jobs/react-js-jobs/',
    color: 'border-accent-cyan/20 hover:border-accent-cyan/40',
    accent: 'text-accent-cyan',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'Naukri',
    description: "India's largest job portal. Search React + Ahmedabad for best results.",
    icon: Briefcase,
    url: 'https://www.naukri.com/react-developer-jobs-in-ahmedabad',
    color: 'border-accent-yellow/20 hover:border-accent-yellow/40',
    accent: 'text-accent-yellow',
    tag: 'India #1',
  },
  {
    name: 'Foundit',
    description: 'Formerly Monster India — good for full-time tech roles across India.',
    icon: MagnifyingGlass,
    url: 'https://www.foundit.in/srp/results?query=react+developer&location=Ahmedabad',
    color: 'border-accent-pink/20 hover:border-accent-pink/40',
    accent: 'text-accent-pink',
    tag: 'India',
  },
  {
    name: 'Cutshort',
    description: 'AI-powered matching for tech roles at Indian startups. Strong React/TS listings.',
    icon: Scissors,
    url: 'https://cutshort.io/jobs/react-js?location=ahmedabad',
    color: 'border-accent-purple/20 hover:border-accent-purple/40',
    accent: 'text-accent-purple',
    tag: 'Tech Startups',
  },
  {
    name: 'Instahyre',
    description: 'Hire/get-hired platform for Indian tech pros. Good for startup roles.',
    icon: Lightning,
    url: 'https://www.instahyre.com/search-jobs/?q=react+developer&l=Ahmedabad',
    color: 'border-accent-yellow/20 hover:border-accent-yellow/40',
    accent: 'text-accent-yellow',
    tag: 'India Startups',
  },
  {
    name: 'Hirect',
    description: 'Chat-based direct hiring platform popular with Indian startups.',
    icon: ChatCircle,
    url: 'https://hirect.in',
    color: 'border-accent-green/20 hover:border-accent-green/40',
    accent: 'text-accent-green',
    tag: 'Direct Hire',
  },
  // ── Global / Remote Platforms ────────────────────────────────────────────
  {
    name: 'LinkedIn',
    description: 'Auto-scraped via guest API — React/Frontend/Fullstack jobs in India + Ahmedabad.',
    icon: UsersFour,
    url: 'https://www.linkedin.com/jobs/search/?keywords=React+Developer&location=Ahmedabad&f_E=1',
    color: 'border-accent-cyan/20 hover:border-accent-cyan/40',
    accent: 'text-accent-cyan',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'Indeed India',
    description: 'Global aggregator with strong India presence. Fresher + React search.',
    icon: MagnifyingGlass,
    url: 'https://in.indeed.com/jobs?q=react+developer+fresher&l=Ahmedabad',
    color: 'border-accent-yellow/20 hover:border-accent-yellow/40',
    accent: 'text-accent-yellow',
    tag: 'Aggregator',
  },
  {
    name: 'Glassdoor',
    description: 'Jobs + company reviews + salary data. Good for research before applying.',
    icon: Buildings,
    url: 'https://www.glassdoor.co.in/Job/ahmedabad-react-developer-jobs-SRCH_IL.0,9_IC2940658_KO10,25.htm',
    color: 'border-accent-green/20 hover:border-accent-green/40',
    accent: 'text-accent-green',
    tag: 'Reviews + Jobs',
  },
  {
    name: 'Wellfound',
    description: 'Formerly AngelList Talent — startup jobs with equity. Great remote listings.',
    icon: TrendUp,
    url: 'https://wellfound.com/jobs?role=frontend-engineer&remote=true',
    color: 'border-accent-cyan/20 hover:border-accent-cyan/40',
    accent: 'text-accent-cyan',
    tag: 'Startups',
  },
  {
    name: 'WeWorkRemotely',
    description: 'Top remote jobs board. Programming section auto-scraped by this dashboard.',
    icon: Globe,
    url: 'https://weworkremotely.com/categories/remote-programming-jobs',
    color: 'border-accent-green/20 hover:border-accent-green/40',
    accent: 'text-accent-green',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'Remotive',
    description: 'Curated remote tech jobs. Software-dev + frontend auto-scraped.',
    icon: Radio,
    url: 'https://remotive.com/remote-jobs/software-dev',
    color: 'border-accent-purple/20 hover:border-accent-purple/40',
    accent: 'text-accent-purple',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'RemoteOK',
    description: 'Large remote jobs board. React/frontend listings auto-scraped.',
    icon: Monitor,
    url: 'https://remoteok.com/remote-react-jobs',
    color: 'border-accent-pink/20 hover:border-accent-pink/40',
    accent: 'text-accent-pink',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'Arbeitnow',
    description: 'Free remote job board API. Tech + remote listings auto-scraped.',
    icon: GlobeHemisphereWest,
    url: 'https://arbeitnow.com',
    color: 'border-accent-cyan/20 hover:border-accent-cyan/40',
    accent: 'text-accent-cyan',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'Remote.co',
    description: 'Vetted remote developer jobs. RSS feed auto-scraped by dashboard.',
    icon: House,
    url: 'https://remote.co/remote-jobs/developer/',
    color: 'border-accent-purple/20 hover:border-accent-purple/40',
    accent: 'text-accent-purple',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'Jobicy',
    description: 'Remote-first jobs API. React/JS/TS listings auto-scraped.',
    icon: Laptop,
    url: 'https://jobicy.com/?q=react',
    color: 'border-accent-green/20 hover:border-accent-green/40',
    accent: 'text-accent-green',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'The Muse',
    description: 'Entry-level engineering jobs. Auto-scraped for frontend/fullstack roles.',
    icon: Palette,
    url: 'https://www.themuse.com/jobs/engineering',
    color: 'border-accent-yellow/20 hover:border-accent-yellow/40',
    accent: 'text-accent-yellow',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'HackerNews Hiring',
    description: 'Monthly "Who is hiring?" — raw authentic startup jobs. Check 1st of each month.',
    icon: Newspaper,
    url: 'https://news.ycombinator.com/jobs',
    color: 'border-accent-yellow/20 hover:border-accent-yellow/40',
    accent: 'text-accent-yellow',
    tag: 'HN Community',
  },
];

export default function LinksPage() {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gridRef.current) return;
    gsap.fromTo(
      gridRef.current.querySelectorAll('.platform-card'),
      { y: 25, opacity: 0, scale: 0.95 },
      { y: 0, opacity: 1, scale: 1, stagger: 0.05, duration: 0.6, ease: 'back.out(1.6)', delay: 0.1 }
    );
  }, []);

  return (
    <div className="min-h-screen p-6 md:p-8 pb-24 md:pb-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white/90 mb-1">Job Board Links</h1>
        <p className="text-white/35 text-sm">
          Your curated list of the best platforms for finding remote and India-based tech jobs.
        </p>
      </div>

      {/* Quick stats bar */}
      <div className="flex flex-wrap items-center gap-5 mb-8 px-5 py-3.5 bg-bg-2 border border-border rounded-2xl">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
          <span className="text-xs text-white/50">Auto-scraped</span>
          <span className="text-xs font-mono font-bold text-accent-green">
            {PLATFORMS.filter(p => p.autoScraped).length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-orange-400" />
          <span className="text-xs text-white/50">India Platforms</span>
          <span className="text-xs font-mono font-bold text-orange-400">6</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent-cyan" />
          <span className="text-xs text-white/50">Remote Global</span>
          <span className="text-xs font-mono font-bold text-accent-cyan">8</span>
        </div>
        <div className="ml-auto text-xs text-white/25">{PLATFORMS.length} platforms total</div>
      </div>

      {/* Grid */}
      <div
        ref={gridRef}
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
      >
        {PLATFORMS.map((p) => (
          <a
            key={p.name}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className={clsx(
              'platform-card group bg-bg-2 border rounded-2xl p-5 transition-all duration-200 flex flex-col gap-4 relative overflow-hidden',
              p.color
            )}
          >
            {/* Glow bg */}
            <div
              className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-15 transition-opacity duration-300 pointer-events-none"
              style={{
                background: `var(--${p.accent.replace('text-', '')})`,
              }}
            />

            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/5', p.accent)}>
                  <p.icon size={18} />
                </span>
                <div>
                  <h3 className={clsx('font-semibold text-sm', p.accent)}>{p.name}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-white/25 font-mono">{p.tag}</span>
                    {p.autoScraped && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent-green/15 text-accent-green border border-accent-green/20">
                        AUTO
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ArrowSquareOut
                size={14}
                className="text-white/20 group-hover:text-white/50 transition-colors mt-0.5"
              />
            </div>

            <p className="text-xs text-white/40 leading-relaxed">{p.description}</p>

            <div
              className={clsx(
                'text-xs font-semibold py-2 px-3 rounded-xl border text-center transition-all duration-150 group-hover:opacity-100 opacity-0',
                'bg-white/5 border-white/10',
                p.accent
              )}
            >
              Open {p.name} →
            </div>
          </a>
        ))}
      </div>

      {/* Footer note */}
      <div className="mt-8 text-center">
        <p className="text-xs text-white/20">
          Tip: Use the &ldquo;Find New Jobs&rdquo; button on the Dashboard to automatically scrape these platforms.
        </p>
      </div>
    </div>
  );
}
