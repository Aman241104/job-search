'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import Link from 'next/link';
import {
  Briefcase,
  Send,
  MessageCircle,
  Trophy,
  Download,
  Link2,
  Brain,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  Flame,
  TrendingUp,
  Bell,
  CheckCircle2,
} from 'lucide-react';
import StatCard from '@/components/StatCard';
import FindButton from '@/components/FindButton';
import ScoreRing from '@/components/ScoreRing';
import { ToastProvider } from '@/components/Toast';
import { api, Stats, Job } from '@/lib/api';
import clsx from 'clsx';

/* ─────────── helpers ─────────── */

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function daysSince(dateStr?: string): number {
  if (!dateStr) return 0;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

const statusColorMap: Record<string, string> = {
  found: 'bg-white/10',
  applied: 'bg-blue-500/60',
  interviewing: 'bg-accent-yellow/60',
  offer: 'bg-accent-green/60',
  rejected: 'bg-red-500/60',
  ghosted: 'bg-white/20',
};

/* ─────────── Activity Chart ─────────── */

interface TimelineEntry {
  date: string;
  found: number;
  applied: number;
}

function ActivityChart({ data }: { data: TimelineEntry[] }) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    entry: TimelineEntry;
  } | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-white/25 text-sm">
        No activity data yet
      </div>
    );
  }

  const W = 560;
  const H = 200;
  const PAD = { top: 20, right: 10, bottom: 32, left: 32 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(...data.map((d) => Math.max(d.found, d.applied)), 1);
  const n = data.length;

  const xPos = (i: number) => PAD.left + (i / Math.max(n - 1, 1)) * chartW;
  const yPos = (v: number) => PAD.top + chartH - (v / maxVal) * chartH;

  const toPath = (vals: number[]) =>
    vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(v).toFixed(1)}`)
      .join(' ');

  const foundPath = toPath(data.map((d) => d.found));
  const appliedPath = toPath(data.map((d) => d.applied));

  // week markers: every 7th point
  const weekMarkers = data
    .map((d, i) => ({ i, label: d.date.slice(5) }))
    .filter((_, i) => i % 7 === 0);

  // Y axis ticks
  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  return (
    <div className="relative w-full" style={{ maxWidth: W }}>
      {/* Legend */}
      <div className="absolute top-0 right-0 flex items-center gap-4 text-xs text-white/50">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent-green" />
          Found
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent-cyan" />
          Applied
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 200 }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Grid lines */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yPos(v)}
              y2={yPos(v)}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 6}
              y={yPos(v) + 4}
              textAnchor="end"
              fill="rgba(255,255,255,0.3)"
              fontSize="9"
            >
              {v}
            </text>
          </g>
        ))}

        {/* X axis week labels */}
        {weekMarkers.map(({ i, label }) => (
          <text
            key={i}
            x={xPos(i)}
            y={H - 6}
            textAnchor="middle"
            fill="rgba(255,255,255,0.25)"
            fontSize="9"
          >
            {label}
          </text>
        ))}

        {/* Area fills */}
        <path
          d={`${foundPath} L ${xPos(n - 1)} ${PAD.top + chartH} L ${xPos(0)} ${PAD.top + chartH} Z`}
          fill="rgba(74,222,128,0.06)"
        />
        <path
          d={`${appliedPath} L ${xPos(n - 1)} ${PAD.top + chartH} L ${xPos(0)} ${PAD.top + chartH} Z`}
          fill="rgba(34,211,238,0.06)"
        />

        {/* Lines */}
        <path d={foundPath} fill="none" stroke="#4ade80" strokeWidth="1.5" strokeLinejoin="round" />
        <path d={appliedPath} fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinejoin="round" />

        {/* Dots + hover targets */}
        {data.map((entry, i) => (
          <g key={i}>
            <circle cx={xPos(i)} cy={yPos(entry.found)} r="3" fill="#4ade80" />
            <circle cx={xPos(i)} cy={yPos(entry.applied)} r="3" fill="#22d3ee" />
            {/* Invisible wide hit area */}
            <rect
              x={xPos(i) - (chartW / Math.max(n - 1, 1)) / 2}
              y={PAD.top}
              width={chartW / Math.max(n - 1, 1)}
              height={chartH}
              fill="transparent"
              onMouseEnter={() =>
                setTooltip({
                  x: xPos(i),
                  y: Math.min(yPos(entry.found), yPos(entry.applied)) - 8,
                  entry,
                })
              }
            />
          </g>
        ))}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <line
              x1={tooltip.x}
              x2={tooltip.x}
              y1={PAD.top}
              y2={PAD.top + chartH}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="1"
              strokeDasharray="3 2"
            />
            <rect
              x={Math.min(tooltip.x + 8, W - 110)}
              y={tooltip.y - 28}
              width={102}
              height={44}
              rx="6"
              fill="rgba(20,20,30,0.92)"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1"
            />
            <text
              x={Math.min(tooltip.x + 12, W - 106)}
              y={tooltip.y - 12}
              fill="rgba(255,255,255,0.5)"
              fontSize="9"
            >
              {tooltip.entry.date}
            </text>
            <text
              x={Math.min(tooltip.x + 12, W - 106)}
              y={tooltip.y + 2}
              fill="#4ade80"
              fontSize="9"
            >
              Found: {tooltip.entry.found}
            </text>
            <text
              x={Math.min(tooltip.x + 12, W - 106)}
              y={tooltip.y + 14}
              fill="#22d3ee"
              fontSize="9"
            >
              Applied: {tooltip.entry.applied}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/* ─────────── Follow-ups widget ─────────── */

function FollowupsWidget({ onStatusChange }: { onStatusChange: () => void }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    api
      .followups()
      .then((res) => setJobs(res.jobs ?? []))
      .catch(() => setJobs(null)); // silently hide on error
  }, []);

  if (jobs === null) return null; // endpoint failed → hide
  if (jobs.length === 0) {
    return (
      <div className="anim-card bg-bg-2 border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Bell size={14} className="text-accent-cyan" />
          <h2 className="font-semibold text-white/90 text-sm">Follow-ups Needed</h2>
        </div>
        <div className="flex items-center gap-2 text-accent-green text-sm mt-3">
          <CheckCircle2 size={14} />
          <span>All caught up!</span>
        </div>
      </div>
    );
  }

  async function handleAction(id: string, status: string) {
    setUpdating(id + status);
    try {
      // Try PATCH first (as spec says), fall back to POST (existing api.update)
      await api.updateStatus(id, status).catch(() => api.update(id, status));
      setJobs((prev) => (prev ? prev.filter((j) => j.id !== id) : prev));
      onStatusChange();
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="anim-card bg-bg-2 border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bell size={14} className="text-accent-yellow" />
        <h2 className="font-semibold text-white/90 text-sm">
          Follow-ups Needed
          <span className="ml-2 text-xs font-normal text-white/35">
            ({jobs.length} job{jobs.length > 1 ? 's' : ''} applied 7+ days ago)
          </span>
        </h2>
      </div>
      <div className="space-y-2">
        {jobs.map((job) => {
          const days = daysSince(job.date_applied);
          return (
            <div
              key={job.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-bg-3 border border-border"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/80 truncate">{job.title}</p>
                <p className="text-xs text-white/40 truncate">{job.company}</p>
                <p className="text-xs text-amber-400/80 mt-0.5">Applied {days} day{days !== 1 ? 's' : ''} ago</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  disabled={!!updating}
                  onClick={() => handleAction(job.id, 'ghosted')}
                  className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-all disabled:opacity-40"
                >
                  {updating === job.id + 'ghosted' ? '…' : 'Mark Ghosted'}
                </button>
                <button
                  disabled={!!updating}
                  onClick={() => handleAction(job.id, 'interviewing')}
                  className="text-xs px-2.5 py-1 rounded-lg bg-accent-green/10 border border-accent-green/20 text-accent-green hover:bg-accent-green/20 transition-all disabled:opacity-40"
                >
                  {updating === job.id + 'interviewing' ? '…' : 'Interview Scheduled'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────── Onboarding empty state ─────────── */

function OnboardingCard({ onComplete }: { onComplete: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cardRef.current) return;
    gsap.fromTo(
      cardRef.current,
      { y: 40, opacity: 0, scale: 0.97 },
      { y: 0, opacity: 1, scale: 1, duration: 0.7, ease: 'power3.out' }
    );
  }, []);

  const steps = [
    {
      n: 1,
      icon: '✅',
      label: 'Dashboard built',
      sub: "You're all set up",
      done: true,
      active: false,
    },
    {
      n: 2,
      icon: '🔍',
      label: "Click 'Find New Jobs' below",
      sub: 'Scrapes 9 job boards automatically',
      done: false,
      active: true,
    },
    {
      n: 3,
      icon: '📋',
      label: 'Browse and apply to matches',
      sub: 'Head to /jobs for full list',
      done: false,
      active: false,
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div
        ref={cardRef}
        className="w-full max-w-lg bg-bg-2 border border-border rounded-3xl p-8 md:p-10 shadow-2xl"
        style={{ opacity: 0 }}
      >
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🚀</div>
          <h1 className="text-2xl font-bold text-white/90 mb-2">
            Let&apos;s find your first jobs
          </h1>
          <p className="text-white/40 text-sm">
            Three quick steps to get your search rolling
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-3 mb-8">
          {steps.map((step) => (
            <div
              key={step.n}
              className={clsx(
                'flex items-start gap-4 p-4 rounded-2xl border transition-all',
                step.done
                  ? 'bg-accent-green/5 border-accent-green/20'
                  : step.active
                  ? 'bg-accent-cyan/5 border-accent-cyan/30 ring-1 ring-accent-cyan/20'
                  : 'bg-bg-3 border-border opacity-50'
              )}
            >
              <div
                className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                  step.done
                    ? 'bg-accent-green/20 text-accent-green'
                    : step.active
                    ? 'bg-accent-cyan/20 text-accent-cyan'
                    : 'bg-white/5 text-white/30'
                )}
              >
                {step.n}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base">{step.icon}</span>
                  <p
                    className={clsx(
                      'text-sm font-medium',
                      step.done
                        ? 'text-accent-green'
                        : step.active
                        ? 'text-white/90'
                        : 'text-white/40'
                    )}
                  >
                    {step.label}
                  </p>
                </div>
                <p className="text-xs text-white/35 mt-0.5 ml-7">{step.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Find button */}
        <FindButton onComplete={onComplete} />
      </div>
    </div>
  );
}

/* ─────────── Main dashboard ─────────── */

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [topJobs, setTopJobs] = useState<Job[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [firstName, setFirstName] = useState<string>('Aman');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, jobsData] = await Promise.all([
        api.stats(),
        api.jobs({ per_page: 5, page: 1 }),
      ]);
      setStats(statsData);
      setTopJobs(jobsData.jobs || []);
    } catch {
      setError('Unable to connect to the backend. Make sure FastAPI is running on port 8000.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load timeline and user profile in parallel (non-blocking)
  useEffect(() => {
    api
      .statsTimeline()
      .then((res) => setTimeline(res.timeline ?? []))
      .catch(() => {});

    api
      .userProfile()
      .then((profile) => {
        const first = ((profile.name as string) ?? '').split(' ')[0];
        if (first) setFirstName(first);
      })
      .catch(() => {}); // fall back to "Aman"
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!cardsRef.current || loading) return;
    gsap.fromTo(
      cardsRef.current.querySelectorAll('.anim-card'),
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.08, duration: 0.6, ease: 'power3.out' }
    );
  }, [loading]);

  const totalJobs = stats
    ? stats.found + stats.applied + stats.interviewing + stats.offers + stats.rejected + stats.ghosted
    : 0;

  // This-week applied count from timeline
  const thisWeekApplied = (() => {
    if (timeline.length === 0) return 0;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return timeline
      .filter((d) => new Date(d.date) >= cutoff)
      .reduce((sum, d) => sum + d.applied, 0);
  })();

  const actions = stats
    ? [
        ...(stats.found > 0 && stats.applied === 0
          ? [{ label: 'Apply to top jobs', sub: `You have ${stats.found} found but 0 applied`, href: '/jobs', urgent: true }]
          : []),
        ...(stats.found > 10 && stats.applied / Math.max(stats.found, 1) < 0.1
          ? [{ label: 'Apply more aggressively', sub: `Apply rate ${Math.round((stats.applied / Math.max(stats.found, 1)) * 100)}% — aim for 15%+`, href: '/jobs', urgent: true }]
          : []),
        ...(stats.interviewing > 0
          ? [{ label: 'Prepare for interviews', sub: `${stats.interviewing} active interview${stats.interviewing > 1 ? 's' : ''}`, href: '/train', urgent: false }]
          : []),
        ...(stats.applied > 0 && stats.interviewing === 0
          ? [{ label: 'Practice interview skills', sub: 'No interviews yet — keep sharpening', href: '/train', urgent: false }]
          : []),
        { label: 'Check new job boards', sub: 'Browse Cutshort, Wellfound, HackerNews', href: '/links', urgent: false },
      ].slice(0, 3)
    : [];

  // Show onboarding when data loaded and total is zero
  if (!loading && !error && stats && stats.total === 0) {
    return (
      <ToastProvider>
        <div className="min-h-screen p-6 md:p-8">
          {/* Keep the greeting header */}
          <div className="mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white/90 mb-1">
                  {getGreeting()}, {firstName}{' '}
                  <span className="text-2xl">👋</span>
                </h1>
                <p className="text-white/35 text-sm font-mono">{formatDate()}</p>
              </div>
              <button
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition-colors p-2"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
          <OnboardingCard onComplete={fetchData} />
        </div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen p-6 md:p-8 pb-24 md:pb-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white/90 mb-1">
                {getGreeting()}, {firstName}{' '}
                <span className="text-2xl">👋</span>
              </h1>
              <p className="text-white/35 text-sm font-mono">{formatDate()}</p>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition-colors p-2"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        <div ref={cardsRef} className="space-y-8">
          {/* Stats row */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="anim-card">
              <StatCard
                label="Total Found"
                value={stats?.total ?? 0}
                icon={Briefcase}
                color="green"
                loading={loading}
              />
            </div>
            <div className="anim-card">
              <StatCard
                label="Applied"
                value={stats?.applied ?? 0}
                icon={Send}
                color="cyan"
                loading={loading}
              />
            </div>
            <div className="anim-card">
              <StatCard
                label="Interviewing"
                value={stats?.interviewing ?? 0}
                icon={MessageCircle}
                color="purple"
                loading={loading}
              />
            </div>
            {/* 4th card: Offers if any, else "This Week" */}
            <div className="anim-card">
              {stats && stats.offers > 0 ? (
                <StatCard
                  label="Offers"
                  value={stats.offers}
                  icon={Trophy}
                  color="yellow"
                  loading={loading}
                />
              ) : (
                <StatCard
                  label="This Week"
                  value={thisWeekApplied}
                  icon={TrendingUp}
                  color="purple"
                  loading={loading}
                />
              )}
            </div>
          </div>

          {/* Main content grid */}
          <div className="grid xl:grid-cols-3 gap-6">
            {/* Left: Find jobs + pipeline */}
            <div className="xl:col-span-2 space-y-6">
              {/* Find new jobs */}
              <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-white/90 mb-0.5">Find New Jobs</h2>
                    <p className="text-xs text-white/35">
                      Scrapes Internshala, Naukri, Jobicy and more
                    </p>
                  </div>
                  {stats && (
                    <div className="text-right">
                      <div className="font-mono text-lg font-bold text-accent-green">
                        {stats.high_match}
                      </div>
                      <div className="text-xs text-white/35">high matches</div>
                    </div>
                  )}
                </div>
                <FindButton onComplete={fetchData} />
              </div>

              {/* Top Opportunities */}
              <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-white/90">Top Opportunities</h2>
                  <div className="flex items-center gap-3">
                    <Link
                      href="/jobs?min_score=70&sort=score"
                      className="text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors"
                    >
                      High Match →
                    </Link>
                    <Link
                      href="/jobs"
                      className="flex items-center gap-1.5 text-xs text-accent-green hover:text-accent-green/80 transition-colors"
                    >
                      View all
                      <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>

                {loading ? (
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="skeleton h-14 rounded-xl" />
                    ))}
                  </div>
                ) : topJobs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="text-3xl mb-3">🔍</div>
                    <p className="text-white/40 text-sm">No jobs found yet</p>
                    <p className="text-white/25 text-xs mt-1">
                      Click &ldquo;Find New Jobs&rdquo; to start searching
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {topJobs.map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/3 transition-all duration-150 group"
                      >
                        <ScoreRing score={job.score} size={36} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white/85 truncate">
                            {job.title}
                          </p>
                          <p className="text-xs text-white/35 truncate">{job.company}</p>
                        </div>
                        <span className="text-xs text-white/25 font-mono">{job.source}</span>
                        {job.url && (
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/20 group-hover:text-accent-green transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <ArrowRight size={13} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Queue */}
              {actions.length > 0 && (
                <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Flame size={15} className="text-accent-yellow" />
                    <h2 className="font-semibold text-white/90">Do This Next</h2>
                  </div>
                  <div className="space-y-2">
                    {actions.map((action, i) => (
                      <Link
                        key={i}
                        href={action.href}
                        className={clsx(
                          'flex items-center justify-between gap-3 p-3 rounded-xl border transition-all duration-150 group',
                          action.urgent
                            ? 'bg-accent-yellow/5 border-accent-yellow/20 hover:border-accent-yellow/40'
                            : 'bg-bg-3 border-border hover:border-white/15'
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {action.urgent && (
                            <AlertTriangle size={13} className="text-accent-yellow flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p
                              className={clsx(
                                'text-sm font-medium truncate',
                                action.urgent ? 'text-accent-yellow' : 'text-white/80'
                              )}
                            >
                              {action.label}
                            </p>
                            <p className="text-xs text-white/30 truncate">{action.sub}</p>
                          </div>
                        </div>
                        <ChevronRight
                          size={14}
                          className="text-white/20 group-hover:text-white/50 flex-shrink-0 transition-colors"
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Follow-ups widget — between action queue and pipeline (in flow) */}
              <FollowupsWidget onStatusChange={fetchData} />

              {/* Activity Chart */}
              {timeline.length > 0 && (
                <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
                  <h2 className="font-semibold text-white/90 mb-4">Activity — Last 30 Days</h2>
                  <ActivityChart data={timeline} />
                </div>
              )}
            </div>

            {/* Right: Pipeline + Quick links */}
            <div className="space-y-6">
              {/* Application pipeline */}
              <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
                <h2 className="font-semibold text-white/90 mb-4">Pipeline</h2>
                {loading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="skeleton h-8 rounded-lg" />
                    ))}
                  </div>
                ) : stats ? (
                  <div className="space-y-3">
                    {[
                      { label: 'Found', value: stats.found, key: 'found' },
                      { label: 'Applied', value: stats.applied, key: 'applied' },
                      { label: 'Interviewing', value: stats.interviewing, key: 'interviewing' },
                      { label: 'Offers', value: stats.offers, key: 'offer' },
                      { label: 'Rejected', value: stats.rejected, key: 'rejected' },
                    ].map(({ label, value, key }) => (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-xs text-white/40 w-20 flex-shrink-0">{label}</span>
                        <div className="flex-1 h-2 bg-bg-3 rounded-full overflow-hidden">
                          <div
                            className={clsx(
                              'h-full rounded-full transition-all duration-1000',
                              statusColorMap[key]
                            )}
                            style={{
                              width: totalJobs > 0 ? `${(value / totalJobs) * 100}%` : '0%',
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono text-white/60 w-6 text-right">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {stats && (
                  <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                    <span className="text-xs text-white/35">Avg score</span>
                    <span className="font-mono text-sm font-bold text-accent-green">
                      {stats.avg_score ?? 0}
                    </span>
                  </div>
                )}
              </div>

              {/* Quick links */}
              <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
                <h2 className="font-semibold text-white/90 mb-4">Quick Actions</h2>
                <div className="space-y-2">
                  <button
                    onClick={() => api.export()}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-3 border border-border hover:border-accent-yellow/30 text-white/60 hover:text-accent-yellow transition-all duration-150 text-sm"
                  >
                    <Download size={15} />
                    Export to Excel
                  </button>
                  <Link
                    href="/links"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-3 border border-border hover:border-accent-cyan/30 text-white/60 hover:text-accent-cyan transition-all duration-150 text-sm"
                  >
                    <Link2 size={15} />
                    Open Job Boards
                  </Link>
                  <Link
                    href="/train"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-3 border border-border hover:border-accent-purple/30 text-white/60 hover:text-accent-purple transition-all duration-150 text-sm"
                  >
                    <Brain size={15} />
                    Start Training
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
