'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import {
  TrendingUp, Target, Zap, Building2, AlertCircle, CheckCircle, Info,
  Calendar, Award, Star,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api';

// ─── Interfaces ──────────────────────────────────────────────────────────────

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

// ─── Color maps ──────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  green: 'bg-accent-green',
  cyan: 'bg-accent-cyan',
  yellow: 'bg-accent-yellow',
  orange: 'bg-orange-400',
  red: 'bg-red-400',
};

const TEXT_COLOR_MAP: Record<string, string> = {
  green: 'text-accent-green',
  cyan: 'text-accent-cyan',
  yellow: 'text-accent-yellow',
  orange: 'text-orange-400',
  red: 'text-red-400',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function FunnelBar({
  label, value, max, color, rate,
}: {
  label: string; value: number; max: number; color: string; rate?: number;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const pct = max > 0 ? (value / max) * 100 : 0;

  useEffect(() => {
    if (!barRef.current) return;
    gsap.fromTo(barRef.current, { width: '0%' }, { width: `${pct}%`, duration: 1.2, ease: 'power3.out', delay: 0.2 });
  }, [pct]);

  return (
    <div className="flex items-center gap-4">
      <span className="text-xs text-white/40 w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 h-7 bg-bg-3 rounded-lg overflow-hidden relative">
        <div ref={barRef} className={clsx('h-full rounded-lg', color)} style={{ width: '0%' }} />
        <span className="absolute inset-0 flex items-center px-3 text-xs font-mono font-bold text-white/80">
          {value}
        </span>
      </div>
      {rate !== undefined && (
        <span className="text-xs font-mono text-white/40 w-12 text-right">{rate}%</span>
      )}
    </div>
  );
}

function ScoreBar({ bucket, maxCount }: { bucket: ScoreBucket; maxCount: number }) {
  const barRef = useRef<HTMLDivElement>(null);
  const pct = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
  const colorClass = COLOR_MAP[bucket.color] || 'bg-white/20';
  const textClass = TEXT_COLOR_MAP[bucket.color] || 'text-white/40';

  useEffect(() => {
    if (!barRef.current) return;
    gsap.fromTo(barRef.current, { height: '0%' }, { height: `${pct}%`, duration: 1, ease: 'power3.out', delay: 0.3 });
  }, [pct]);

  return (
    <div className="flex flex-col items-center gap-2 flex-1">
      <span className={clsx('text-xs font-mono font-bold', textClass)}>{bucket.count}</span>
      <div className="w-full flex-1 bg-bg-3 rounded-t-lg overflow-hidden flex items-end" style={{ height: '80px' }}>
        <div ref={barRef} className={clsx('w-full rounded-t-lg', colorClass)} style={{ height: '0%' }} />
      </div>
      <span className="text-[10px] text-white/30 text-center leading-tight">{bucket.range}</span>
    </div>
  );
}

// Animated horizontal bar (width-based) used in multiple places
function HBar({
  pct, colorClass, delay = 0,
}: {
  pct: number; colorClass: string; delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(ref.current, { width: '0%' }, { width: `${pct}%`, duration: 1, ease: 'power3.out', delay });
  }, [pct, delay]);
  return <div ref={ref} className={clsx('h-full rounded-full', colorClass)} style={{ width: '0%' }} />;
}

// ─── Feature 3: Improved Funnel with conversion health ───────────────────────

function ConversionHealth({ rate }: { rate: number }) {
  const healthy = rate > 20;
  const ok = rate >= 5;
  const dot = healthy ? '🟢' : ok ? '🟡' : '🔴';
  const label = healthy ? 'Healthy' : ok ? 'Needs work' : 'Critical';
  const cls = healthy
    ? 'bg-accent-green/10 border-accent-green/20 text-accent-green'
    : ok
    ? 'bg-accent-yellow/10 border-accent-yellow/20 text-accent-yellow'
    : 'bg-red-500/10 border-red-500/20 text-red-400';

  return (
    <div className={clsx('inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium', cls)}>
      <span>{dot}</span>
      <span>Conversion health: {label}</span>
    </div>
  );
}

// ─── Feature 1: Source ROI Table ──────────────────────────────────────────────

function qualityColor(pct: number) {
  if (pct >= 50) return 'text-accent-green bg-accent-green/10';
  if (pct >= 30) return 'text-accent-yellow bg-accent-yellow/10';
  return 'text-red-400 bg-red-400/10';
}

function SourceROITable({ rows }: { rows: SourceRow[] }) {
  const sorted = [...rows].sort((a, b) => {
    const qa = a.count > 0 ? (a.high_match / a.count) * 100 : 0;
    const qb = b.count > 0 ? (b.high_match / b.count) * 100 : 0;
    return qb - qa;
  });

  if (sorted.length === 0) {
    return <p className="text-sm text-white/30 text-center py-6">No source data yet</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] text-white/30 uppercase tracking-wider border-b border-border">
            <th className="text-left pb-2 pr-4">Source</th>
            <th className="text-right pb-2 px-3">Jobs</th>
            <th className="text-right pb-2 px-3">Avg Score</th>
            <th className="text-right pb-2 px-3">High Match</th>
            <th className="text-right pb-2 pl-3">Quality Score</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const qPct = row.count > 0 ? Math.round((row.high_match / row.count) * 100) : 0;
            const isEven = i % 2 === 0;
            return (
              <tr
                key={row.source}
                className={clsx('border-b border-border/40', isEven ? 'bg-bg-2' : 'bg-bg-3/50')}
              >
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-white/75 truncate max-w-[120px]">{row.source}</span>
                    {i === 0 && (
                      <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-green/15 text-accent-green border border-accent-green/20">
                        Best
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-white/60">{row.count}</td>
                <td className="py-2.5 px-3 text-right font-mono text-accent-cyan">{row.avg_score}</td>
                <td className="py-2.5 px-3 text-right font-mono text-white/60">{row.high_match}</td>
                <td className="py-2.5 pl-3 text-right">
                  <span className={clsx('font-mono font-bold text-xs px-2 py-0.5 rounded-lg', qualityColor(qPct))}>
                    {qPct}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [salaryData, setSalaryData] = useState<SalaryStats | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const weekStripRef = useRef<HTMLDivElement>(null);

  // Fetch all data in parallel
  useEffect(() => {
    Promise.all([
      fetch('http://localhost:8000/api/analytics').then((r) => r.json()) as Promise<Analytics>,
      api.salaryStats().catch(() => null),
      api.statsTimeline().catch(() => ({ timeline: [] })),
    ])
      .then(([analytics, salary, tl]) => {
        setData(analytics);
        setSalaryData(salary);
        setTimeline(tl.timeline || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load analytics. Is the backend running?');
        setLoading(false);
      });
  }, []);

  // Page entrance animation
  useEffect(() => {
    if (!pageRef.current || loading) return;
    gsap.fromTo(
      pageRef.current.querySelectorAll('.anim-card'),
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.08, duration: 0.55, ease: 'power3.out' }
    );
  }, [loading]);

  // Week strip animation
  useEffect(() => {
    if (!weekStripRef.current || loading) return;
    gsap.fromTo(
      weekStripRef.current,
      { y: -16, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }
    );
  }, [loading]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const maxSource = data ? Math.max(...data.source_breakdown.map((s) => s.count), 1) : 1;
  const maxScore = data ? Math.max(...data.score_distribution.map((s) => s.count), 1) : 1;

  // Feature 4: This-week stats from timeline (last 7 entries)
  const last7 = timeline.slice(-7);
  const weekFound = last7.reduce((s, e) => s + (e.found || 0), 0);
  const weekApplied = last7.reduce((s, e) => s + (e.applied || 0), 0);

  // Feature 5: Score trend insight
  const scoreAbove60 = data
    ? data.score_distribution
        .filter((b) => {
          const lo = parseInt(b.range.split('-')[0] || b.range, 10);
          return lo >= 60;
        })
        .reduce((s, b) => s + b.count, 0)
    : 0;
  const totalScored = data ? data.score_distribution.reduce((s, b) => s + b.count, 0) : 0;
  const pct60Plus = totalScored > 0 ? Math.round((scoreAbove60 / totalScored) * 100) : 0;

  function scoreTrendMsg(pct: number) {
    if (pct >= 40) return 'Excellent job quality! You\'re being selective.';
    if (pct >= 20) return 'Good quality. Consider widening search slightly.';
    return 'Many low-score results. Refine your search keywords.';
  }

  // Feature 2: Salary insights — top 3 sources by avg_score
  const topByScore = data
    ? [...data.source_breakdown].sort((a, b) => b.avg_score - a.avg_score).slice(0, 3)
    : [];
  const maxAvgScore = topByScore.length > 0 ? Math.max(...topByScore.map((s) => s.avg_score), 1) : 1;

  // Salary buckets max for bar widths
  const maxSalaryCount = salaryData
    ? Math.max(...salaryData.ranges.map((r) => r.count), 1)
    : 1;

  const tipIcon = (type: Tip['type']) => {
    if (type === 'warning') return <AlertCircle size={14} className="text-accent-yellow flex-shrink-0" />;
    if (type === 'success') return <CheckCircle size={14} className="text-accent-green flex-shrink-0" />;
    return <Info size={14} className="text-accent-cyan flex-shrink-0" />;
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen p-6 md:p-8 pb-24 md:pb-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white/90 mb-1">Analytics</h1>
        <p className="text-white/35 text-sm">Track your job search performance and spot what&apos;s working.</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4 text-sm text-red-400 mb-6">
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

          {/* ── Feature 4: Weekly Activity Strip ── */}
          <div ref={weekStripRef} className="anim-card grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                label: 'Found this week',
                value: timeline.length > 0 ? weekFound : '—',
                icon: Calendar,
                color: 'text-accent-purple',
                bg: 'bg-accent-purple/10 border-accent-purple/20',
              },
              {
                label: 'Applied this week',
                value: timeline.length > 0 ? weekApplied : '—',
                icon: Zap,
                color: 'text-accent-cyan',
                bg: 'bg-accent-cyan/10 border-accent-cyan/20',
              },
              {
                label: 'Best score',
                value: data.avg_score > 0 ? `${data.avg_score}/100` : '—',
                icon: Star,
                color: 'text-accent-yellow',
                bg: 'bg-accent-yellow/10 border-accent-yellow/20',
              },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className={clsx('border rounded-2xl px-4 py-3 flex items-center gap-3', bg)}>
                <Icon size={18} className={color} />
                <div>
                  <div className={clsx('text-lg font-mono font-bold leading-tight', color)}>{value}</div>
                  <div className="text-[10px] text-white/35 leading-tight mt-0.5">{label}</div>
                </div>
              </div>
            ))}
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

          {/* ── KPI row ── */}
          <div className="anim-card grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Jobs', value: data.total_jobs, icon: TrendingUp, color: 'text-accent-green' },
              { label: 'Avg Score', value: `${data.avg_score}/100`, icon: Target, color: 'text-accent-cyan' },
              { label: 'Apply Rate', value: `${data.funnel.apply_rate}%`, icon: Zap, color: 'text-accent-yellow' },
              { label: 'Top Companies', value: data.top_companies.length, icon: Building2, color: 'text-accent-purple' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-bg-2 border border-border rounded-2xl px-5 py-4 flex items-center gap-4">
                <Icon size={20} className={color} />
                <div>
                  <div className={clsx('text-xl font-mono font-bold', color)}>{value}</div>
                  <div className="text-xs text-white/35">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Main grid ── */}
          <div className="grid md:grid-cols-2 gap-6">

            {/* ── Feature 3: Improved Funnel ── */}
            <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
              <div className="flex items-start justify-between mb-1">
                <h2 className="font-semibold text-white/90">Application Funnel</h2>
                <ConversionHealth rate={data.funnel.apply_rate} />
              </div>
              <p className="text-xs text-white/30 mb-5">How jobs move through your pipeline</p>

              <div className="space-y-3">
                <FunnelBar label="Discovered" value={data.funnel.found} max={data.funnel.found} color="bg-white/15" />

                {/* Arrow + conversion rate */}
                <div className="flex items-center gap-4 pl-24">
                  <div className="flex-1 flex items-center gap-2 text-[10px] text-white/30">
                    <span className="text-white/20">↓</span>
                    <span>
                      {data.funnel.found > 0
                        ? `${data.funnel.apply_rate}% Discovered → Applied`
                        : 'No conversions yet'}
                    </span>
                  </div>
                </div>

                <FunnelBar label="Applied" value={data.funnel.applied} max={data.funnel.found} color="bg-blue-500/60" rate={data.funnel.apply_rate} />

                <div className="flex items-center gap-4 pl-24">
                  <div className="flex-1 flex items-center gap-2 text-[10px] text-white/30">
                    <span className="text-white/20">↓</span>
                    <span>
                      {data.funnel.applied > 0
                        ? `${data.funnel.interview_rate}% Applied → Interview`
                        : 'No interviews yet'}
                    </span>
                  </div>
                </div>

                <FunnelBar label="Interviewing" value={data.funnel.interviewing} max={data.funnel.found} color="bg-accent-yellow/60" rate={data.funnel.interview_rate} />

                <div className="flex items-center gap-4 pl-24">
                  <div className="flex-1 flex items-center gap-2 text-[10px] text-white/30">
                    <span className="text-white/20">↓</span>
                    <span>
                      {data.funnel.interviewing > 0
                        ? `${data.funnel.offer_rate}% Interview → Offer`
                        : 'No offers yet'}
                    </span>
                  </div>
                </div>

                <FunnelBar label="Offer" value={data.funnel.offer} max={data.funnel.found} color="bg-accent-green/70" rate={data.funnel.offer_rate} />
              </div>

              <div className="mt-5 pt-4 border-t border-border grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-lg font-mono font-bold text-blue-400">{data.funnel.apply_rate}%</div>
                  <div className="text-[10px] text-white/30">Apply rate</div>
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

            {/* ── Score Distribution + Feature 5 insight ── */}
            <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
              <h2 className="font-semibold text-white/90 mb-1">Score Distribution</h2>
              <p className="text-xs text-white/30 mb-5">How well jobs match your profile</p>
              <div className="flex items-end gap-2 h-32">
                {data.score_distribution.map((bucket) => (
                  <ScoreBar key={bucket.range} bucket={bucket} maxCount={maxScore} />
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-white/30">
                <span>Lower scores = poor match</span>
                <span>Higher = strong match</span>
              </div>

              {/* Feature 5: Score trend insight */}
              <div className={clsx(
                'mt-4 px-3 py-2.5 rounded-xl border text-xs leading-snug',
                pct60Plus >= 40
                  ? 'bg-accent-green/5 border-accent-green/20 text-accent-green/80'
                  : pct60Plus >= 20
                  ? 'bg-accent-yellow/5 border-accent-yellow/20 text-accent-yellow/80'
                  : 'bg-red-500/5 border-red-500/20 text-red-400/80'
              )}>
                <span className="font-semibold">{pct60Plus}% of your jobs score above 60</span>
                {' — '}
                {scoreTrendMsg(pct60Plus)}
              </div>
            </div>

            {/* ── Source breakdown bars ── */}
            <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
              <h2 className="font-semibold text-white/90 mb-1">By Source</h2>
              <p className="text-xs text-white/30 mb-5">Which platform is most productive for you</p>
              <div className="space-y-3">
                {data.source_breakdown.map((row) => (
                  <div key={row.source} className="flex items-center gap-3">
                    <span className="text-xs text-white/50 w-24 flex-shrink-0 truncate">{row.source}</span>
                    <div className="flex-1 h-6 bg-bg-3 rounded-lg overflow-hidden relative">
                      <div
                        className="h-full bg-accent-purple/40 rounded-lg transition-all duration-700"
                        style={{ width: `${(row.count / maxSource) * 100}%` }}
                      />
                      <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white/60">
                        {row.count} jobs
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono flex-shrink-0">
                      <span className="text-accent-green">{row.avg_score}</span>
                      <span className="text-white/20">avg</span>
                      <span className="text-accent-cyan">{row.high_match}</span>
                      <span className="text-white/20">60+</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Top companies ── */}
            <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
              <h2 className="font-semibold text-white/90 mb-1">Top Companies</h2>
              <p className="text-xs text-white/30 mb-5">Companies with the best matching jobs for you</p>
              <div className="space-y-2">
                {data.top_companies.slice(0, 8).map((co, i) => (
                  <div key={co.company} className="flex items-center gap-3 py-1.5">
                    <span className="text-xs font-mono text-white/20 w-5">{i + 1}</span>
                    <span className="flex-1 text-sm text-white/75 truncate">{co.company}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-white/30">{co.count} jobs</span>
                      <span className={clsx(
                        'text-xs font-mono font-bold px-2 py-0.5 rounded-lg',
                        co.avg_score >= 70 ? 'text-accent-green bg-accent-green/10' :
                        co.avg_score >= 50 ? 'text-accent-yellow bg-accent-yellow/10' :
                        'text-white/40 bg-white/5'
                      )}>
                        {co.avg_score}
                      </span>
                    </div>
                  </div>
                ))}
                {data.top_companies.length === 0 && (
                  <p className="text-sm text-white/30 text-center py-8">No company data yet</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Feature 1: Source ROI Table ── */}
          {data.source_breakdown.length > 0 && (
            <div className="anim-card bg-bg-2 border border-border rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-1">
                <Award size={16} className="text-accent-yellow" />
                <h2 className="font-semibold text-white/90">Source Performance</h2>
              </div>
              <p className="text-xs text-white/30 mb-5">
                Quality Score = % of jobs scoring 60+ from that source. Higher is better.
              </p>
              <SourceROITable rows={data.source_breakdown} />
            </div>
          )}

          {/* ── Feature 2: Salary Insights Panel ── */}
          <div className="anim-card grid md:grid-cols-2 gap-6">

            {/* Avg score by source (salary alignment proxy) */}
            <div className="bg-bg-2 border border-border rounded-2xl p-6">
              <h2 className="font-semibold text-white/90 mb-1">Salary Alignment by Source</h2>
              <p className="text-xs text-white/30 mb-2">
                Avg match score as proxy for salary fit
              </p>

              {topByScore.length > 0 && (
                <p className="text-xs text-accent-cyan mb-4">
                  Your profile scores highest on{' '}
                  <span className="font-semibold">{topByScore[0].source}</span>{' '}
                  with avg score{' '}
                  <span className="font-mono font-bold">{topByScore[0].avg_score}/100</span>
                </p>
              )}

              <div className="space-y-3">
                {topByScore.map((row, i) => {
                  const pct = maxAvgScore > 0 ? (row.avg_score / maxAvgScore) * 100 : 0;
                  const colors = ['bg-accent-green/60', 'bg-accent-cyan/50', 'bg-accent-yellow/50'];
                  return (
                    <div key={row.source} className="flex items-center gap-3">
                      <span className="text-xs text-white/50 w-24 flex-shrink-0 truncate">{row.source}</span>
                      <div className="flex-1 h-5 bg-bg-3 rounded-full overflow-hidden">
                        <HBar pct={pct} colorClass={colors[i] || 'bg-white/20'} delay={0.2 + i * 0.1} />
                      </div>
                      <span className="text-xs font-mono text-white/60 w-8 text-right">{row.avg_score}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Salary bucket distribution */}
            <div className="bg-bg-2 border border-border rounded-2xl p-6">
              <h2 className="font-semibold text-white/90 mb-1">Salary Range Distribution</h2>
              <p className="text-xs text-white/30 mb-4">
                {salaryData && salaryData.jobs_with_salary > 0
                  ? `${salaryData.jobs_with_salary} jobs mention salary · Avg ${salaryData.avg_mentioned} LPA`
                  : 'Based on salary strings in job listings'}
              </p>

              {salaryData ? (
                <div className="space-y-2.5">
                  {salaryData.ranges.map((r, i) => {
                    const pct = maxSalaryCount > 0 ? (r.count / maxSalaryCount) * 100 : 0;
                    const isTarget = r.label === '8–12 LPA' || r.label === '12+ LPA';
                    return (
                      <div key={r.label} className="flex items-center gap-3">
                        <span className={clsx(
                          'text-xs w-28 flex-shrink-0',
                          isTarget ? 'text-accent-green font-medium' : 'text-white/50'
                        )}>
                          {r.label}
                        </span>
                        <div className="flex-1 h-5 bg-bg-3 rounded-full overflow-hidden">
                          <HBar
                            pct={pct}
                            colorClass={isTarget ? 'bg-accent-green/60' : 'bg-white/15'}
                            delay={0.15 + i * 0.08}
                          />
                        </div>
                        <span className="text-xs font-mono text-white/50 w-6 text-right">{r.count}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {['No salary listed', '< 5 LPA', '5–8 LPA', '8–12 LPA', '12+ LPA'].map((label) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-xs w-28 flex-shrink-0 text-white/30">{label}</span>
                      <div className="flex-1 h-5 bg-bg-3 rounded-full skeleton" />
                      <span className="text-xs font-mono text-white/20 w-6 text-right">—</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
