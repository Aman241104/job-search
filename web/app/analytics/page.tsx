'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { motion } from 'framer-motion';
import {
  TrendUp, TrendDown, Target, Lightning, Buildings, WarningCircle, CheckCircle, Info,
  Brain, Sparkle, ArrowDown, CurrencyDollar, Fire,
} from '@phosphor-icons/react';
import clsx from 'clsx';
import { api, Job } from '@/lib/api';
import PremiumSlider from '@/components/PremiumSlider';
import AnimatedCounter from '@/components/AnimatedCounter';

// ─── Interfaces (real backend shapes, unchanged) ────────────────────────────

interface Funnel {
  found: number;
  applied: number;
  interviewing: number;
  offer: number;
  apply_rate: number;
  interview_rate: number;
  offer_rate: number;
}

interface SourceRow {
  source: string;
  count: number;
  avg_score: number;
  high_match: number;
}

interface ScoreBucket {
  range: string;
  count: number;
  color: string;
}

interface Company {
  company: string;
  count: number;
  avg_score: number;
}

interface Tip {
  type: 'warning' | 'success' | 'info';
  msg: string;
}

interface Analytics {
  funnel: Funnel;
  source_breakdown: SourceRow[];
  score_distribution: ScoreBucket[];
  top_companies: Company[];
  tips: Tip[];
  total_jobs: number;
  avg_score: number;
}

interface SalaryStats {
  ranges: { label: string; count: number }[];
  avg_mentioned: number;
  jobs_with_salary: number;
}

interface TimelineEntry {
  date: string;
  found: number;
  applied: number;
}

// Same category regex technique as the Jobs page's Explore mode and Batch
// Apply's AI Recommendations — reused here so "strengths/weaknesses" are a
// real average of the user's own found jobs, never an invented per-category
// score.
const CATEGORIES: { label: string; match: (j: Job) => boolean }[] = [
  { label: 'Frontend', match: (j) => /front[\s-]?end|react|next\.?js|vue|angular/i.test(j.title) },
  { label: 'Full Stack', match: (j) => /full[\s-]?stack/i.test(j.title) },
  { label: 'Backend', match: (j) => /back[\s-]?end|node|django|api engineer/i.test(j.title) },
  { label: 'Remote', match: (j) => /remote|work from home|wfh/i.test(j.location || '') },
  { label: 'Fresher-friendly', match: (j) => /fresher|entry.level|intern/i.test(j.title + ' ' + (j.score_reason || '')) },
  { label: 'AI / ML', match: (j) => /\bai\b|machine learning|\bml\b|llm/i.test(j.title) },
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Same LPA-extraction regex as lib/api.ts's salaryStats() — duplicated
// (not exported there) so we can restrict it to the high-match subset.
function parseLpa(salary: string | undefined): number | null {
  const raw = (salary || '').toLowerCase().replace(/,/g, '');
  const rangeMatch = raw.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(?:lpa|l\s*p\s*a|lakh)/i);
  const lpaMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:lpa|l\s*p\s*a|lakh)/i);
  if (rangeMatch) return (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
  if (lpaMatch) return parseFloat(lpaMatch[1]);
  return null;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const JOURNEY_TEXT: Record<string, string> = {
  purple: 'text-accent-purple', cyan: 'text-accent-cyan', yellow: 'text-accent-yellow', green: 'text-accent-green',
};

function JourneyNode({ label, value, color, delay }: { label: string; value: number; color: 'purple' | 'cyan' | 'yellow' | 'green'; delay: number }) {
  return (
    <div className="flex flex-col items-center w-full">
      <div
        className="anim-journey-node flex flex-col items-center justify-center w-28 h-28 rounded-full border-2 opacity-0"
        style={{ borderColor: `rgb(var(--accent-${color}) / 0.4)`, backgroundColor: `rgb(var(--accent-${color}) / 0.06)`, animationDelay: `${delay}s` }}
      >
        <AnimatedCounter value={value} className={clsx('font-mono font-bold text-2xl', JOURNEY_TEXT[color])} />
        <span className="text-[10px] text-white/35 uppercase tracking-wide mt-0.5 text-center px-2">{label}</span>
      </div>
    </div>
  );
}

function MatchQualityCard({ label, count, color }: { label: string; count: number; color: string }) {
  const bg: Record<string, string> = {
    green: 'bg-tint-mint-95 dark:bg-tint-mint-20/10 border-tint-mint-80/40 dark:border-tint-mint-30/20',
    cyan: 'bg-tint-blue-95 dark:bg-tint-blue-20/10 border-tint-blue-80/40 dark:border-tint-blue-30/20',
    yellow: 'bg-tint-cream-95 dark:bg-tint-cream-20/10 border-tint-cream-80/40 dark:border-tint-cream-30/20',
    pink: 'bg-tint-lavender-95 dark:bg-tint-lavender-20/10 border-tint-lavender-80/40 dark:border-tint-lavender-30/20',
  };
  const text: Record<string, string> = {
    green: 'text-accent-green', cyan: 'text-accent-cyan', yellow: 'text-accent-yellow', pink: 'text-accent-pink',
  };
  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.02 }}
      className={clsx('flex-1 text-center rounded-2xl border p-5 transition-shadow', bg[color])}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-3">{label}</p>
      <p className={clsx('font-mono font-bold text-3xl', text[color])}>{count}</p>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [salaryData, setSalaryData] = useState<SalaryStats | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [allFound, setAllFound] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extraApplications, setExtraApplications] = useState(10);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      api.analytics() as unknown as Promise<Analytics>,
      api.salaryStats().catch(() => null),
      api.statsTimeline().catch(() => ({ timeline: [] })),
      api.jobs({ status: 'found', sort: 'score', per_page: 500 }).catch(() => ({ jobs: [] })),
    ])
      .then(([analytics, salary, tl, found]) => {
        setData(analytics);
        setSalaryData(salary);
        setTimeline(tl.timeline || []);
        setAllFound(found.jobs || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load your career data. Is the backend running?');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!pageRef.current || loading) return;
    gsap.fromTo(
      pageRef.current.querySelectorAll('.anim-card'),
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.1, duration: 0.6, ease: 'power3.out' }
    );
    gsap.fromTo(
      pageRef.current.querySelectorAll('.anim-journey-node'),
      { scale: 0.7, opacity: 0 },
      { scale: 1, opacity: 1, stagger: 0.12, duration: 0.5, ease: 'back.out(1.6)', delay: 0.3 }
    );
  }, [loading]);

  // ── Real week-over-week application trend (same technique as Dashboard) ──
  const weekTrend = useMemo(() => {
    if (timeline.length < 14) return null;
    const last7 = timeline.slice(-7).reduce((s, e) => s + (e.applied || 0), 0);
    const prev7 = timeline.slice(-14, -7).reduce((s, e) => s + (e.applied || 0), 0);
    if (prev7 === 0) return null;
    return Math.round(((last7 - prev7) / prev7) * 100);
  }, [timeline]);

  // ── Career Health — transparent composite of 3 real inputs ──
  const careerHealth = useMemo(() => {
    if (!data || data.total_jobs === 0) return null;
    const matchComponent = data.avg_score;
    const applyComponent = Math.min((data.funnel.apply_rate / 30) * 100, 100);
    const interviewComponent = Math.min((data.funnel.interview_rate / 50) * 100, 100);
    const score = Math.round(0.4 * matchComponent + 0.3 * applyComponent + 0.3 * interviewComponent);
    return { score, matchComponent: Math.round(matchComponent), applyComponent: Math.round(applyComponent), interviewComponent: Math.round(interviewComponent) };
  }, [data]);

  // ── Real category strengths/weaknesses ──
  const categoryStats = useMemo(() => {
    if (allFound.length === 0) return [];
    return CATEGORIES
      .map((c) => {
        const matches = allFound.filter(c.match);
        const avg = matches.length > 0 ? Math.round(matches.reduce((s, j) => s + j.score, 0) / matches.length) : 0;
        return { label: c.label, count: matches.length, avg };
      })
      .filter((c) => c.count >= 2)
      .sort((a, b) => b.avg - a.avg);
  }, [allFound]);

  const strengths = categoryStats.slice(0, 3);
  const weaknesses = [...categoryStats].reverse().slice(0, 2);

  // ── Real high-match salary anchor (score >= 70, real parsed LPA) ──
  const highMatchAvgSalary = useMemo(() => {
    const lpas = allFound.filter((j) => j.score >= 70).map((j) => parseLpa(j.salary)).filter((n): n is number => n !== null && n > 0);
    if (lpas.length === 0) return null;
    return Math.round((lpas.reduce((s, n) => s + n, 0) / lpas.length) * 10) / 10;
  }, [allFound]);

  // ── Real day-of-week activity from the 30-day timeline ──
  const weekdayActivity = useMemo(() => {
    const totals = WEEKDAYS.map((label, i) => ({ label, i, found: 0, applied: 0, days: 0 }));
    timeline.forEach((e) => {
      const d = new Date(e.date);
      const idx = (d.getDay() + 6) % 7; // Mon=0..Sun=6
      totals[idx].found += e.found;
      totals[idx].applied += e.applied;
      totals[idx].days += 1;
    });
    return totals;
  }, [timeline]);
  const maxWeekdayActivity = Math.max(...weekdayActivity.map((w) => w.found + w.applied), 1);
  const bestWeekday = [...weekdayActivity].sort((a, b) => (b.found + b.applied) - (a.found + a.applied))[0];

  // ── Real what-if projection at current conversion rate ──
  const projection = useMemo(() => {
    if (!data) return null;
    const projectedApplied = data.funnel.applied + extraApplications;
    const projectedInterviews = Math.round(projectedApplied * (data.funnel.interview_rate / 100));
    return { projectedApplied, projectedInterviews };
  }, [data, extraApplications]);

  const tipIcon = (type: Tip['type']) => {
    if (type === 'warning') return <WarningCircle size={14} className="text-accent-yellow flex-shrink-0" />;
    if (type === 'success') return <CheckCircle size={14} className="text-accent-green flex-shrink-0" />;
    return <Info size={14} className="text-accent-cyan flex-shrink-0" />;
  };

  const groupedMatchTiers = data
    ? [
        { label: 'Perfect', count: data.score_distribution.find((b) => b.range === '80–100')?.count ?? 0, color: 'green' },
        { label: 'Great Match', count: data.score_distribution.find((b) => b.range === '60–79')?.count ?? 0, color: 'cyan' },
        { label: 'Good Match', count: data.score_distribution.find((b) => b.range === '40–59')?.count ?? 0, color: 'yellow' },
        {
          label: 'Low Match',
          count:
            (data.score_distribution.find((b) => b.range === '20–39')?.count ?? 0) +
            (data.score_distribution.find((b) => b.range === '0–19')?.count ?? 0),
          color: 'pink',
        },
      ]
    : [];

  const maxSalaryCount = salaryData ? Math.max(...salaryData.ranges.map((r) => r.count), 1) : 1;

  return (
    <div className="min-h-screen p-6 md:p-8 pb-24 md:pb-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-display-sm font-medium text-white/90 mb-1">Career Intelligence</h1>
        <p className="text-white/35 text-sm">Why you&apos;re succeeding — and where the next win is hiding.</p>
      </div>

      {error && (
        <div className="bg-accent-pink/10 border border-accent-pink/20 rounded-xl px-5 py-4 text-sm text-accent-pink mb-6">
          {error}
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-48 rounded-2xl" />
          ))}
        </div>
      )}

      {data && (
        <div ref={pageRef} className="space-y-6">
          {/* ── Career Health hero ── */}
          <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6 md:p-8 shadow-tint-green text-center">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/50 mb-4">
              <Sparkle size={11} weight="fill" className="text-accent-green" />
              Career Health
            </div>
            {careerHealth ? (
              <>
                <AnimatedCounter value={careerHealth.score} suffix="%" className="block font-mono font-bold text-5xl text-accent-green" />
                <p className="text-sm text-white/40 mt-2">
                  {careerHealth.score >= 70 ? 'Excellent progress' : careerHealth.score >= 45 ? 'Solid progress' : 'Early days — momentum is building'}
                </p>
                {weekTrend !== null && (
                  <p className={clsx('text-xs font-medium mt-3 inline-flex items-center gap-1', weekTrend >= 0 ? 'text-accent-green' : 'text-accent-pink')}>
                    {weekTrend >= 0 ? <TrendUp size={12} weight="fill" /> : <TrendDown size={12} weight="fill" />}
                    Applications {weekTrend >= 0 ? 'up' : 'down'} {Math.abs(weekTrend)}% this week
                  </p>
                )}
                <div className="flex items-center justify-center gap-6 mt-6 pt-5 border-t border-border max-w-md mx-auto text-xs text-white/35">
                  <span>Match quality <span className="text-white/60 font-mono">{careerHealth.matchComponent}</span></span>
                  <span>Apply rate <span className="text-white/60 font-mono">{careerHealth.applyComponent}</span></span>
                  <span>Interview rate <span className="text-white/60 font-mono">{careerHealth.interviewComponent}</span></span>
                </div>
              </>
            ) : (
              <p className="text-white/30 text-sm">Not enough data yet — find and apply to a few jobs first.</p>
            )}
          </div>

          {/* ── AI Career Coach ── */}
          <div className="anim-card bg-tint-lavender-95 dark:bg-tint-lavender-20/10 border border-tint-lavender-80/40 dark:border-tint-lavender-30/20 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <Brain size={16} className="text-accent-purple" />
              <h2 className="font-semibold text-white/90">AI Career Coach</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent-green mb-2">Strengths</p>
                {strengths.length > 0 ? (
                  <ul className="space-y-1.5">
                    {strengths.map((s) => (
                      <li key={s.label} className="text-sm text-white/70 flex items-center justify-between">
                        {s.label} <span className="font-mono text-xs text-accent-green">{s.avg}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-white/30">Not enough data yet.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent-pink mb-2">Weaker Areas</p>
                <ul className="space-y-1.5">
                  {data.funnel.apply_rate < 10 && (
                    <li className="text-sm text-white/70">Application Rate <span className="font-mono text-xs text-accent-pink ml-1">{data.funnel.apply_rate}%</span></li>
                  )}
                  {data.funnel.applied > 0 && data.funnel.interviewing === 0 && (
                    <li className="text-sm text-white/70">Interview Rate <span className="font-mono text-xs text-accent-pink ml-1">0%</span></li>
                  )}
                  {weaknesses.map((s) => (
                    <li key={s.label} className="text-sm text-white/70 flex items-center justify-between">
                      {s.label} <span className="font-mono text-xs text-accent-pink">{s.avg}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent-cyan mb-2">Suggested Strategy</p>
                {strengths.length > 0 ? (
                  <p className="text-sm text-white/70 leading-relaxed">
                    Prioritize <span className="text-accent-cyan font-medium">{strengths.map((s) => s.label).join(' + ')}</span> roles — your profile matches these exceptionally well.
                  </p>
                ) : (
                  <p className="text-xs text-white/30">Not enough data yet.</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Tips row ── */}
          {data.tips.length > 0 && (
            <div className="anim-card flex flex-col gap-2">
              {data.tips.map((tip, i) => (
                <div key={i} className={clsx(
                  'flex items-start gap-3 px-4 py-3 rounded-xl border text-sm',
                  tip.type === 'warning' && 'bg-accent-yellow/5 border-accent-yellow/20 text-accent-yellow/80',
                  tip.type === 'success' && 'bg-accent-green/5 border-accent-green/20 text-accent-green/80',
                  tip.type === 'info' && 'bg-accent-cyan/5 border-accent-cyan/20 text-accent-cyan/80',
                )}>
                  {tipIcon(tip.type)}
                  <span>{tip.msg}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Career Journey (real 5-stage funnel) ── */}
          <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
            <h2 className="font-semibold text-white/90 mb-1">Career Journey</h2>
            <p className="text-xs text-white/30 mb-6">Your profile has discovered {data.total_jobs} opportunities so far — here&apos;s how far they&apos;ve traveled.</p>
            <div className="flex flex-col items-center max-w-xs mx-auto">
              <JourneyNode label="Opportunities" value={data.total_jobs} color="purple" delay={0} />
              <ArrowDown size={16} className="text-white/15 my-1" />
              <JourneyNode label="High Matches" value={allFound.filter((j) => j.score >= 60).length} color="cyan" delay={0.12} />
              <ArrowDown size={16} className="text-white/15 my-1" />
              <JourneyNode label="Applied" value={data.funnel.applied} color="yellow" delay={0.24} />
              <ArrowDown size={16} className="text-white/15 my-1" />
              <JourneyNode label="Interviews" value={data.funnel.interviewing} color="green" delay={0.36} />
              <ArrowDown size={16} className="text-white/15 my-1" />
              <JourneyNode label="Offers" value={data.funnel.offer} color="green" delay={0.48} />
            </div>
            <div className="mt-6 pt-4 border-t border-border grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-lg font-mono font-bold text-accent-cyan">{data.funnel.apply_rate}%</div>
                <div className="text-[10px] text-white/30">Application Momentum</div>
              </div>
              <div>
                <div className="text-lg font-mono font-bold text-accent-yellow">{data.funnel.interview_rate}%</div>
                <div className="text-[10px] text-white/30">Interview rate</div>
              </div>
              <div>
                <div className="text-lg font-mono font-bold text-accent-green">{data.funnel.offer_rate}%</div>
                <div className="text-[10px] text-white/30">Offer rate</div>
              </div>
            </div>
          </div>

          {/* ── Match Quality ── */}
          <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
            <h2 className="font-semibold text-white/90 mb-1">Match Quality</h2>
            <p className="text-xs text-white/30 mb-5">
              Your profile matches exceptionally well with {strengths[0]?.label || 'your top'} positions.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {groupedMatchTiers.map((tier) => (
                <MatchQualityCard key={tier.label} label={tier.label} count={tier.count} color={tier.color} />
              ))}
            </div>
          </div>

          {/* ── Interview Simulator (real what-if projection) ── */}
          <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-1">
              <Lightning size={16} className="text-accent-yellow" />
              <h2 className="font-semibold text-white/90">Interview Simulator</h2>
            </div>
            <p className="text-xs text-white/30 mb-5">
              A projection at your current {data.funnel.interview_rate}% interview rate — not a guarantee, just your own math.
            </p>
            <div className="grid md:grid-cols-2 gap-6 items-center">
              <PremiumSlider
                label="If you apply to N more jobs"
                value={extraApplications}
                min={0}
                max={50}
                color="yellow"
                onChange={setExtraApplications}
              />
              {projection && (
                <div className="flex items-center justify-center gap-6 text-center">
                  <div>
                    <p className="font-mono font-bold text-2xl text-white/70">{projection.projectedApplied}</p>
                    <p className="text-[10px] text-white/30 mt-1">Total applied</p>
                  </div>
                  <ArrowDown size={16} className="text-white/15 -rotate-90" />
                  <div>
                    <p className="font-mono font-bold text-2xl text-accent-green">≈{projection.projectedInterviews}</p>
                    <p className="text-[10px] text-white/30 mt-1">Projected interviews</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Success heatmap (real weekday activity) ── */}
          <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-1">
              <Fire size={16} className="text-accent-pink" />
              <h2 className="font-semibold text-white/90">Activity Heatmap</h2>
            </div>
            <p className="text-xs text-white/30 mb-5">
              {bestWeekday && bestWeekday.found + bestWeekday.applied > 0
                ? `You're most active on ${bestWeekday.label}s — worth batching your search and applications around that day.`
                : 'Not enough history yet to spot a pattern.'}
            </p>
            <div className="grid grid-cols-7 gap-2">
              {weekdayActivity.map((w) => {
                const total = w.found + w.applied;
                const intensity = total / maxWeekdayActivity;
                return (
                  <div key={w.label} className="flex flex-col items-center gap-2">
                    <div
                      className="w-full aspect-square rounded-xl border border-border flex items-center justify-center font-mono text-xs font-bold text-white/70"
                      style={{ backgroundColor: `rgb(var(--accent-cyan) / ${0.06 + intensity * 0.28})` }}
                    >
                      {total}
                    </div>
                    <span className="text-[10px] text-white/30">{w.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Top companies + Source performance ── */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-1">
                <Buildings size={16} className="text-accent-purple" />
                <h2 className="font-semibold text-white/90">Top Companies</h2>
              </div>
              <p className="text-xs text-white/30 mb-5">Companies with the best matching jobs for you</p>
              {data.top_companies.length === 0 ? (
                <p className="text-sm text-white/30 text-center py-8">No company data yet</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {data.top_companies.slice(0, 6).map((co) => (
                    <motion.div key={co.company} whileHover={{ y: -2 }} className="bg-bg-3 border border-border rounded-xl p-4 text-center">
                      <p className="text-xs text-white/60 truncate mb-2">{co.company}</p>
                      <AnimatedCounter value={co.avg_score} suffix="%" className="block font-mono font-bold text-xl text-accent-green" />
                      <p className="text-[10px] text-white/30 mt-1">{co.count} opportunit{co.count === 1 ? 'y' : 'ies'}</p>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-1">
                <Target size={16} className="text-accent-cyan" />
                <h2 className="font-semibold text-white/90">Source Performance</h2>
              </div>
              <p className="text-xs text-white/30 mb-5">Which platform is finding your best matches</p>
              {data.source_breakdown.length === 0 ? (
                <p className="text-sm text-white/30 text-center py-8">No source data yet</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {[...data.source_breakdown].sort((a, b) => b.avg_score - a.avg_score).slice(0, 6).map((row) => (
                    <motion.div key={row.source} whileHover={{ y: -2 }} className="bg-bg-3 border border-border rounded-xl p-4 text-center">
                      <p className="text-xs text-white/60 truncate mb-2">{row.source}</p>
                      <AnimatedCounter value={row.avg_score} className="block font-mono font-bold text-xl text-accent-cyan" />
                      <p className="text-[10px] text-white/30 mt-1">{row.count} jobs · {row.high_match} high match</p>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Salary Potential ── */}
          <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-1">
              <CurrencyDollar size={16} className="text-accent-green" />
              <h2 className="font-semibold text-white/90">Salary Potential</h2>
            </div>
            <p className="text-xs text-white/30 mb-5">
              {salaryData && salaryData.jobs_with_salary > 0
                ? `Based on ${salaryData.jobs_with_salary} jobs that mention salary`
                : 'Based on salary strings in job listings'}
            </p>

            {salaryData && salaryData.jobs_with_salary > 0 ? (
              <div className="flex items-center justify-center gap-8 mb-6">
                <div className="text-center">
                  <p className="font-mono font-bold text-3xl text-white/60">{salaryData.avg_mentioned}</p>
                  <p className="text-xs text-white/30 mt-1">LPA · all matches</p>
                </div>
                <ArrowDown size={20} className="text-white/15 -rotate-90" />
                <div className="text-center">
                  <p className="font-mono font-bold text-3xl text-accent-green">{highMatchAvgSalary ?? '—'}</p>
                  <p className="text-xs text-white/30 mt-1">LPA · your high matches (70+)</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-white/30 text-center py-6">Not enough salary data yet</p>
            )}

            <div className="space-y-2.5">
              {(salaryData?.ranges ?? ['No salary listed', '< 5 LPA', '5–8 LPA', '8–12 LPA', '12+ LPA'].map((label) => ({ label, count: 0 }))).map((r, i) => {
                const pct = maxSalaryCount > 0 ? (r.count / maxSalaryCount) * 100 : 0;
                const isTarget = r.label === '8–12 LPA' || r.label === '12+ LPA';
                return (
                  <div key={r.label} className="flex items-center gap-3">
                    <span className={clsx('text-xs w-28 flex-shrink-0', isTarget ? 'text-accent-green font-medium' : 'text-white/50')}>
                      {r.label}
                    </span>
                    <div className="flex-1 h-5 bg-bg-3 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: 0.1 + i * 0.06, ease: 'easeOut' }}
                        className={clsx('h-full rounded-full', isTarget ? 'bg-accent-green/60' : 'bg-white/15')}
                      />
                    </div>
                    <span className="text-xs font-mono text-white/50 w-6 text-right">{r.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
