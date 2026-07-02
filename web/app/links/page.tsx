'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ExternalLink } from 'lucide-react';
import clsx from 'clsx';


interface Platform {
  name: string;
  description: string;
  icon: string;
  url: string;
  color: string;
  accent: string;
  tag: string;
  autoScraped?: boolean;
}

const PLATFORMS: Platform[] = [
  // ── India Platforms ──────────────────────────────────────────────────────
  {
    name: 'Internshala',
    description: 'Best for fresher jobs & internships in India. Auto-scraped by this dashboard.',
    icon: '🎓',
    url: 'https://internshala.com/jobs/react-js-jobs/',
    color: 'border-blue-500/20 hover:border-blue-500/40',
    accent: 'text-blue-400',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'Naukri',
    description: "India's largest job portal. Search React + Ahmedabad for best results.",
    icon: '🟠',
    url: 'https://www.naukri.com/react-developer-jobs-in-ahmedabad',
    color: 'border-orange-500/20 hover:border-orange-500/40',
    accent: 'text-orange-400',
    tag: 'India #1',
  },
  {
    name: 'Foundit',
    description: 'Formerly Monster India — good for full-time tech roles across India.',
    icon: '🔎',
    url: 'https://www.foundit.in/srp/results?query=react+developer&location=Ahmedabad',
    color: 'border-red-500/20 hover:border-red-500/40',
    accent: 'text-red-400',
    tag: 'India',
  },
  {
    name: 'Cutshort',
    description: 'AI-powered matching for tech roles at Indian startups. Strong React/TS listings.',
    icon: '✂️',
    url: 'https://cutshort.io/jobs/react-js?location=ahmedabad',
    color: 'border-pink-500/20 hover:border-pink-500/40',
    accent: 'text-pink-400',
    tag: 'Tech Startups',
  },
  {
    name: 'Instahyre',
    description: 'Hire/get-hired platform for Indian tech pros. Good for startup roles.',
    icon: '⚡',
    url: 'https://www.instahyre.com/search-jobs/?q=react+developer&l=Ahmedabad',
    color: 'border-yellow-500/20 hover:border-yellow-500/40',
    accent: 'text-yellow-400',
    tag: 'India Startups',
  },
  {
    name: 'Hirect',
    description: 'Chat-based direct hiring platform popular with Indian startups.',
    icon: '💬',
    url: 'https://hirect.in',
    color: 'border-emerald-500/20 hover:border-emerald-500/40',
    accent: 'text-emerald-400',
    tag: 'Direct Hire',
  },
  // ── Global / Remote Platforms ────────────────────────────────────────────
  {
    name: 'LinkedIn',
    description: 'Auto-scraped via guest API — React/Frontend/Fullstack jobs in India + Ahmedabad.',
    icon: '💼',
    url: 'https://www.linkedin.com/jobs/search/?keywords=React+Developer&location=Ahmedabad&f_E=1',
    color: 'border-sky-500/20 hover:border-sky-500/40',
    accent: 'text-sky-400',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'Indeed India',
    description: 'Global aggregator with strong India presence. Fresher + React search.',
    icon: '🔍',
    url: 'https://in.indeed.com/jobs?q=react+developer+fresher&l=Ahmedabad',
    color: 'border-yellow-500/20 hover:border-yellow-500/40',
    accent: 'text-yellow-400',
    tag: 'Aggregator',
  },
  {
    name: 'Glassdoor',
    description: 'Jobs + company reviews + salary data. Good for research before applying.',
    icon: '🪟',
    url: 'https://www.glassdoor.co.in/Job/ahmedabad-react-developer-jobs-SRCH_IL.0,9_IC2940658_KO10,25.htm',
    color: 'border-green-500/20 hover:border-green-500/40',
    accent: 'text-green-400',
    tag: 'Reviews + Jobs',
  },
  {
    name: 'Wellfound',
    description: 'Formerly AngelList Talent — startup jobs with equity. Great remote listings.',
    icon: '🚀',
    url: 'https://wellfound.com/jobs?role=frontend-engineer&remote=true',
    color: 'border-accent-cyan/20 hover:border-accent-cyan/40',
    accent: 'text-accent-cyan',
    tag: 'Startups',
  },
  {
    name: 'WeWorkRemotely',
    description: 'Top remote jobs board. Programming section auto-scraped by this dashboard.',
    icon: '🌐',
    url: 'https://weworkremotely.com/categories/remote-programming-jobs',
    color: 'border-accent-green/20 hover:border-accent-green/40',
    accent: 'text-accent-green',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'Remotive',
    description: 'Curated remote tech jobs. Software-dev + frontend auto-scraped.',
    icon: '📡',
    url: 'https://remotive.com/remote-jobs/software-dev',
    color: 'border-violet-500/20 hover:border-violet-500/40',
    accent: 'text-violet-400',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'RemoteOK',
    description: 'Large remote jobs board. React/frontend listings auto-scraped.',
    icon: '🖥️',
    url: 'https://remoteok.com/remote-react-jobs',
    color: 'border-rose-500/20 hover:border-rose-500/40',
    accent: 'text-rose-400',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'Arbeitnow',
    description: 'Free remote job board API. Tech + remote listings auto-scraped.',
    icon: '🌍',
    url: 'https://arbeitnow.com',
    color: 'border-teal-500/20 hover:border-teal-500/40',
    accent: 'text-teal-400',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'Remote.co',
    description: 'Vetted remote developer jobs. RSS feed auto-scraped by dashboard.',
    icon: '🏠',
    url: 'https://remote.co/remote-jobs/developer/',
    color: 'border-indigo-500/20 hover:border-indigo-500/40',
    accent: 'text-indigo-400',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'Jobicy',
    description: 'Remote-first jobs API. React/JS/TS listings auto-scraped.',
    icon: '💻',
    url: 'https://jobicy.com/?q=react',
    color: 'border-purple-500/20 hover:border-purple-500/40',
    accent: 'text-purple-400',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'The Muse',
    description: 'Entry-level engineering jobs. Auto-scraped for frontend/fullstack roles.',
    icon: '🎨',
    url: 'https://www.themuse.com/jobs/engineering',
    color: 'border-amber-500/20 hover:border-amber-500/40',
    accent: 'text-amber-400',
    tag: 'Auto-scraped',
    autoScraped: true,
  },
  {
    name: 'HackerNews Hiring',
    description: 'Monthly "Who is hiring?" — raw authentic startup jobs. Check 1st of each month.',
    icon: '🦊',
    url: 'https://news.ycombinator.com/jobs',
    color: 'border-orange-400/20 hover:border-orange-400/40',
    accent: 'text-orange-300',
    tag: 'HN Community',
  },
];

export default function LinksPage() {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gridRef.current) return;
    gsap.fromTo(
      gridRef.current.querySelectorAll('.platform-card'),
      { y: 25, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.05, duration: 0.55, ease: 'power3.out', delay: 0.1 }
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
                <span className="text-3xl leading-none">{p.icon}</span>
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
              <ExternalLink
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
