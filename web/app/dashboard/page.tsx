'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import Link from 'next/link';
import { Briefcase, PaperPlaneTilt, ChatCircle, Trophy, DownloadSimple, LinkSimple, Brain, ArrowRight, ArrowClockwise, Warning, CaretRight, Fire, TrendUp, Bell, CheckCircle, MagnifyingGlass, ClipboardText, Compass, SlidersHorizontal } from '@phosphor-icons/react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import type { TooltipContentProps } from 'recharts/types/component/Tooltip';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import FindButton from '@/components/FindButton';
import ScoreRing from '@/components/ScoreRing';
import HeroBackground from '@/components/HeroBackground';
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
  applied: 'bg-accent-cyan/60',
  interviewing: 'bg-accent-yellow/60',
  offer: 'bg-accent-green/60',
  rejected: 'bg-accent-pink/60',
  ghosted: 'bg-white/20',
};

/* ─────────── Activity Chart ─────────── */

interface TimelineEntry {
  date: string;
  found: number;
  applied: number;
}

function ActivityTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-bg-1 border border-border rounded-lg px-3 py-2 shadow-[0_4px_16px_rgb(var(--ink)/0.08)]">
      <p className="text-[10px] text-ink-muted mb-1">{label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="text-[10px]" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

function ActivityChart({ data }: { data: TimelineEntry[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-white/25 text-sm">
        No activity data yet
      </div>
    );
  }

  // Week markers only, same as the original hand-rolled chart, to avoid a
  // cluttered x-axis when the timeline spans many days.
  const tickData = data.filter((_, i) => i % 7 === 0).map((d) => d.date);

  return (
    <div className="relative w-full">
      <div className="absolute top-0 right-0 flex items-center gap-4 text-xs text-white/50 z-10">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent-green" />
          Found
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent-cyan" />
          Applied
        </span>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 20, right: 10, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="foundFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="rgb(var(--accent-green))" stopOpacity={0.18} />
              <stop offset="95%" stopColor="rgb(var(--accent-green))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="appliedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="rgb(var(--accent-cyan))" stopOpacity={0.18} />
              <stop offset="95%" stopColor="rgb(var(--accent-cyan))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--ink) / 0.06)" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={tickData}
            tickFormatter={(v: string) => v.slice(5)}
            tick={{ fill: 'rgb(var(--ink) / 0.3)', fontSize: 9 }}
            axisLine={{ stroke: 'rgb(var(--ink) / 0.1)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'rgb(var(--ink) / 0.35)', fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip content={ActivityTooltip} />
          <Area
            type="monotone"
            dataKey="found"
            name="Found"
            stroke="rgb(var(--accent-green))"
            strokeWidth={1.5}
            fill="url(#foundFill)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
          <Area
            type="monotone"
            dataKey="applied"
            name="Applied"
            stroke="rgb(var(--accent-cyan))"
            strokeWidth={1.5}
            fill="url(#appliedFill)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
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
          <CheckCircle size={14} />
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
                <p className="text-xs text-accent-yellow/80 mt-0.5">Applied {days} day{days !== 1 ? 's' : ''} ago</p>
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
      icon: CheckCircle,
      label: 'Dashboard built',
      sub: "You're all set up",
      done: true,
      active: false,
    },
    {
      n: 2,
      icon: MagnifyingGlass,
      label: "Click 'Find New Jobs' below",
      sub: 'Scrapes 9 job boards automatically',
      done: false,
      active: true,
    },
    {
      n: 3,
      icon: ClipboardText,
      label: 'Browse and apply to matches',
      sub: 'Head to /jobs for full list',
      done: false,
      active: false,
    },
    {
      n: 4,
      icon: SlidersHorizontal,
      label: 'Optional: tune job sources, scoring, email & Telegram alerts',
      sub: 'All in Profile — none of this is required to start',
      done: false,
      active: false,
      href: '/profile',
    },
  ];

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[70vh] px-4 overflow-hidden">
      <HeroBackground />
      <div
        ref={cardRef}
        className="relative w-full max-w-lg bg-bg-2/90 backdrop-blur-sm border border-border rounded-3xl p-8 md:p-10 shadow-2xl"
        style={{ opacity: 0 }}
      >
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="chip-breathe w-16 h-16 rounded-2xl bg-accent-green/10 text-accent-green flex items-center justify-center mx-auto mb-4">
            <Compass size={28} />
          </div>
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
                  <step.icon
                    size={15}
                    className={clsx(
                      step.done ? 'text-accent-green' : step.active ? 'text-accent-cyan' : 'text-white/30'
                    )}
                  />
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
                    {step.href ? (
                      <Link href={step.href} className="hover:underline underline-offset-2">
                        {step.label}
                      </Link>
                    ) : (
                      step.label
                    )}
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
  const [firstName, setFirstName] = useState<string>('');
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
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!cardsRef.current || loading) return;
    gsap.fromTo(
      cardsRef.current.querySelectorAll('.anim-card'),
      { y: 30, opacity: 0, scale: 0.96 },
      { y: 0, opacity: 1, scale: 1, stagger: 0.08, duration: 0.7, ease: 'back.out(1.6)' }
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
                <h1 className="font-display text-display-sm font-medium text-white/90 mb-1">
                  {getGreeting()}{firstName ? `, ${firstName}` : ''}
                </h1>
                <p className="text-white/35 text-sm font-mono">{formatDate()}</p>
              </div>
              <button
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition-colors p-2"
              >
                <ArrowClockwise size={14} />
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
                {getGreeting()}, {firstName}
              </h1>
              <p className="text-white/35 text-sm font-mono">{formatDate()}</p>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition-colors p-2"
            >
              <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {error && (
            <div className="mt-4 bg-accent-pink/10 border border-accent-pink/20 rounded-xl px-4 py-3 text-sm text-accent-pink">
              {error}
            </div>
          )}
        </div>

        <div ref={cardsRef} className="space-y-8">
          {/* Stats row */}
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
            <div className="anim-card xl:col-span-2">
              <StatCard
                label="Total Found"
                value={stats?.total ?? 0}
                icon={Briefcase}
                color="green"
                loading={loading}
                featured
              />
            </div>
            <div className="anim-card">
              <StatCard
                label="Applied"
                value={stats?.applied ?? 0}
                icon={PaperPlaneTilt}
                color="cyan"
                loading={loading}
              />
            </div>
            <div className="anim-card">
              <StatCard
                label="Interviewing"
                value={stats?.interviewing ?? 0}
                icon={ChatCircle}
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
                  icon={TrendUp}
                  color="purple"
                  loading={loading}
                />
              )}
            </div>
          </div>

          {/* Main content grid */}
          <div className="grid xl:grid-cols-3 gap-6">
            {/* Left: Find jobs + pipeline */}
            {/* min-w-0 is required here: CSS Grid tracks default to `auto`
                sizing (not `minmax(0,1fr)`), so without this the column
                refuses to shrink below its content's intrinsic width on
                mobile — the exact cause of text silently clipping off the
                right edge instead of truncating with an ellipsis. */}
            <div className="xl:col-span-2 space-y-6 min-w-0">
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
                  <EmptyState
                    icon={MagnifyingGlass}
                    title="No jobs found yet"
                    description="Click “Find New Jobs” above to start searching."
                  />
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
                    <Fire size={15} className="text-accent-yellow" />
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
                            <Warning size={13} className="text-accent-yellow flex-shrink-0" />
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
                        <CaretRight
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
            <div className="space-y-6 min-w-0">
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
                    <DownloadSimple size={15} />
                    Export to Excel
                  </button>
                  <Link
                    href="/links"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-3 border border-border hover:border-accent-cyan/30 text-white/60 hover:text-accent-cyan transition-all duration-150 text-sm"
                  >
                    <LinkSimple size={15} />
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
