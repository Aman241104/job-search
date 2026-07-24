'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CircleNotch, Envelope, PaperPlaneTilt, DeviceMobile, Check, X, ArrowClockwise,
  Sparkle, ArrowDown, Robot, ShieldCheck,
} from '@phosphor-icons/react';
import { ToastProvider, useToast } from '@/components/Toast';
import { api, Job, Batch, BatchInsights } from '@/lib/api';
import HeroBackground from '@/components/HeroBackground';
import AnimatedCounter from '@/components/AnimatedCounter';
import PremiumSlider from '@/components/PremiumSlider';
import clsx from 'clsx';

type Channel = 'email' | 'telegram' | 'browser';

const STATUS_LABEL: Record<string, string> = {
  staged: 'Staged',
  sent: 'Sent',
  send_failed: 'Send failed',
  no_email: 'No email found',
  generation_failed: 'CV generation failed',
  below_score_gate: 'Below score gate',
  telegram_not_configured: 'Telegram not configured',
  prefilled: 'Pre-filled (review in browser)',
  prefill_failed: 'Pre-fill failed',
};

// Real category browse — same regex technique as the Jobs page's Explore
// mode, reused here so "highest/lowest success" recommendations are a real
// average of the user's own found jobs, not an invented per-category score.
const CATEGORIES: { label: string; match: (j: Job) => boolean }[] = [
  { label: 'Frontend', match: (j) => /front[\s-]?end|react|next\.?js|vue|angular/i.test(j.title) },
  { label: 'Full Stack', match: (j) => /full[\s-]?stack/i.test(j.title) },
  { label: 'Backend', match: (j) => /back[\s-]?end|node|django|api engineer/i.test(j.title) },
  { label: 'Remote', match: (j) => /remote|work from home|wfh/i.test(j.location || '') },
  { label: 'Fresher-friendly', match: (j) => /fresher|entry.level|intern/i.test(j.title + ' ' + (j.score_reason || '')) },
  { label: 'AI / ML', match: (j) => /\bai\b|machine learning|\bml\b|llm/i.test(j.title) },
];

const CHANNEL_META: Record<Channel, { label: string; icon: typeof Envelope; blurb: string }> = {
  email: { label: 'Email', icon: Envelope, blurb: 'Sends directly to a real address found in the posting.' },
  telegram: { label: 'Telegram', icon: PaperPlaneTilt, blurb: 'Pushes a job alert + generated package to your connected chat.' },
  browser: { label: 'Browser', icon: DeviceMobile, blurb: 'Pre-fills the application form — you review and submit by hand.' },
};

const WORKING_STEPS = [
  'Selecting your best matches…',
  'Generating tailored resumes…',
  'Writing cover letters…',
  'Preparing applications…',
  'Sending…',
];

function BatchPageInner() {
  const [mode, setMode] = useState<'automatic' | 'review'>('review');
  const [modeLoading, setModeLoading] = useState(true);
  const [channel, setChannel] = useState<Channel>('email');
  const [minScore, setMinScore] = useState(40);
  const [limit, setLimit] = useState(10);
  const [candidates, setCandidates] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [running, setRunning] = useState(false);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [sending, setSending] = useState(false);
  const [workingStep, setWorkingStep] = useState(0);
  const { toast } = useToast();

  // Real, broad pool of the user's own found jobs — powers the hero
  // counters and the AI Recommendations card. Fetched once, independent of
  // whatever min score / top N the candidate list below is currently using.
  const [allFound, setAllFound] = useState<Job[]>([]);
  const [insights, setInsights] = useState<BatchInsights | null>(null);

  useEffect(() => {
    api.getAutoApplyMode().then((r) => setMode(r.mode)).finally(() => setModeLoading(false));
    api.jobs({ status: 'found', sort: 'score', per_page: 500 }).then((r) => setAllFound(r.jobs)).catch(() => {});
    api.batchInsights().then(setInsights).catch(() => {});
    api.userProfile().then((p) => {
      const t = p.min_score_threshold as number | undefined;
      if (typeof t === 'number') setMinScore(t);
    }).catch(() => {});
  }, []);

  // Cycle the JARVIS working-step label for the real duration of the batch
  // request — never claims a step is "done" before the actual response
  // returns; this narrates real in-flight backend work, no fake numbers.
  useEffect(() => {
    if (!running) {
      setWorkingStep(0);
      return;
    }
    const id = setInterval(() => {
      setWorkingStep((s) => Math.min(s + 1, WORKING_STEPS.length - 1));
    }, 1100);
    return () => clearInterval(id);
  }, [running]);

  const toggleMode = async (next: 'automatic' | 'review') => {
    setMode(next);
    try {
      await api.setAutoApplyMode(next);
    } catch {
      toast('Failed to save mode', 'error');
    }
  };

  const loadCandidates = async () => {
    setLoadingCandidates(true);
    setBatch(null);
    try {
      const res = await api.jobs({ min_score: minScore, status: 'found', sort: 'score', per_page: limit });
      setCandidates(res.jobs);
      setSelected(new Set(res.jobs.map((j) => j.id)));
    } catch {
      toast('Failed to load candidate jobs', 'error');
    } finally {
      setLoadingCandidates(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleRun = async () => {
    if (selected.size === 0) return;
    setRunning(true);
    try {
      const result = await api.runBatch(channel, Array.from(selected), mode);
      setBatch(result);
      toast(`Batch ${result.status === 'sent' ? 'sent' : 'staged'} — ${result.items.length} job(s)`, 'success');
      api.batchInsights().then(setInsights).catch(() => {});
    } catch {
      toast('Failed to run batch', 'error');
    } finally {
      setRunning(false);
    }
  };

  const toggleApproval = async (itemId: string, approved: boolean) => {
    if (!batch) return;
    setBatch({ ...batch, items: batch.items.map((i) => (i.id === itemId ? { ...i, approved: approved ? 1 : 0 } : i)) });
    try {
      await api.setBatchItemApproval(batch.id, itemId, approved);
    } catch {
      toast('Failed to update approval', 'error');
    }
  };

  const handleSendApproved = async () => {
    if (!batch) return;
    setSending(true);
    try {
      const result = await api.sendBatch(batch.id);
      setBatch(result);
      toast('Approved items sent', 'success');
      api.batchInsights().then(setInsights).catch(() => {});
    } catch {
      toast('Failed to send batch', 'error');
    } finally {
      setSending(false);
    }
  };

  // ── Real AI Recommendations — derived entirely from allFound + minScore ──
  const recommendations = useMemo(() => {
    if (allFound.length === 0) return null;
    const applyCount = allFound.filter((j) => j.score >= minScore).length;
    const avoidCount = allFound.length - applyCount;
    const overallAvg = allFound.reduce((s, j) => s + j.score, 0) / allFound.length;
    const cats = CATEGORIES
      .map((c) => {
        const matches = allFound.filter(c.match);
        const avg = matches.length > 0 ? matches.reduce((s, j) => s + j.score, 0) / matches.length : 0;
        return { label: c.label, count: matches.length, avg: Math.round(avg) };
      })
      .filter((c) => c.count >= 2);
    if (cats.length === 0) return { applyCount, avoidCount, best: null, worst: null, strategy: [] as string[] };
    const sorted = [...cats].sort((a, b) => b.avg - a.avg);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const strategy = cats.filter((c) => c.avg > overallAvg).sort((a, b) => b.avg - a.avg).slice(0, 2).map((c) => c.label);
    return { applyCount, avoidCount, best, worst, strategy };
  }, [allFound, minScore]);

  const highMatchCount = allFound.filter((j) => j.score >= 70).length;

  // ── Real pipeline stages ──
  const pipelineStages = [
    { label: 'Found', value: candidates.length },
    { label: 'Selected', value: selected.size },
    { label: batch?.mode === 'review' ? 'Staged / Sent' : 'Sent', value: batch ? batch.items.filter((i) => ['sent', 'prefilled', 'staged'].includes(i.status)).length : 0 },
    { label: 'Responses', value: batch ? batch.items.filter((i) => i.job_status === 'interviewing' || i.job_status === 'offer').length : 0 },
  ];

  const bestChannel = useMemo(() => {
    if (!insights) return null;
    const ranked = Object.entries(insights.channels)
      .filter(([, s]) => s.sent_count > 0)
      .map(([channelName, s]) => ({ channel: channelName, rate: Math.round((s.responded / s.sent_count) * 100) }))
      .sort((a, b) => b.rate - a.rate);
    return ranked[0] ?? null;
  }, [insights]);

  const channelIcon = { email: Envelope, telegram: PaperPlaneTilt, browser: DeviceMobile }[channel];
  const ChannelIcon = channelIcon;

  return (
    <div className="min-h-screen pb-24 md:pb-8 px-6 md:px-8 py-6 max-w-4xl mx-auto">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-2xl border border-border mb-6">
        <HeroBackground className="absolute inset-0" />
        <div className="relative z-10 px-6 py-10 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/50 mb-4">
            <Sparkle size={11} weight="fill" className="text-accent-green" />
            AI Batch Apply
          </div>
          <h1 className="font-display text-display-md font-medium text-white/90 mb-2">
            Your career copilot is ready.
          </h1>
          <p className="text-white/40 text-sm max-w-md mx-auto mb-8">
            Pick a strategy, and it generates tailored resumes, writes cover letters, and applies —
            automatically or with your review.
          </p>

          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
            <div>
              <AnimatedCounter value={allFound.length} className="block font-mono font-bold text-3xl text-accent-green" />
              <p className="text-xs text-white/35 mt-1">Jobs Found</p>
            </div>
            <div>
              <AnimatedCounter value={highMatchCount} className="block font-mono font-bold text-3xl text-accent-cyan" />
              <p className="text-xs text-white/35 mt-1">High Matches</p>
            </div>
            <div>
              {insights?.overall_response_rate !== null && insights?.overall_response_rate !== undefined ? (
                <AnimatedCounter value={insights.overall_response_rate} suffix="%" className="block font-mono font-bold text-3xl text-accent-yellow" />
              ) : (
                <span className="block font-mono font-bold text-3xl text-white/20">—</span>
              )}
              <p className="text-xs text-white/35 mt-1">Response Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── AI Recommendations ── */}
      {recommendations && (
        <div className="bg-tint-mint-95 dark:bg-tint-mint-20/10 border border-tint-mint-80/40 dark:border-tint-mint-30/20 rounded-2xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Robot size={16} className="text-accent-green" />
            <h2 className="font-semibold text-white/90">AI Recommendations</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="font-mono font-bold text-2xl text-accent-green">{recommendations.applyCount}</p>
              <p className="text-xs text-white/35 mt-1">Worth applying to</p>
            </div>
            <div>
              <p className="font-mono font-bold text-2xl text-white/30">{recommendations.avoidCount}</p>
              <p className="text-xs text-white/35 mt-1">Below your threshold</p>
            </div>
            {recommendations.best && (
              <div>
                <p className="font-mono font-bold text-2xl text-accent-cyan">{recommendations.best.avg}</p>
                <p className="text-xs text-white/35 mt-1">Best avg: {recommendations.best.label}</p>
              </div>
            )}
            {recommendations.worst && recommendations.worst.label !== recommendations.best?.label && (
              <div>
                <p className="font-mono font-bold text-2xl text-accent-pink/70">{recommendations.worst.avg}</p>
                <p className="text-xs text-white/35 mt-1">Weakest avg: {recommendations.worst.label}</p>
              </div>
            )}
          </div>
          {recommendations.strategy.length > 0 && (
            <p className="text-xs text-white/40 mt-4 pt-4 border-t border-white/10">
              Your strongest matches skew toward <span className="text-accent-green font-medium">{recommendations.strategy.join(' + ')}</span> — worth prioritizing those first.
            </p>
          )}
        </div>
      )}

      {/* ── Mode ── */}
      <div className="grid md:grid-cols-2 gap-4 mb-5">
        <motion.button
          onClick={() => toggleMode('review')}
          disabled={modeLoading}
          whileHover={{ y: -2 }}
          className={clsx(
            'relative text-left p-5 rounded-2xl border overflow-hidden transition-colors',
            mode === 'review' ? 'border-accent-green/40 bg-tint-mint-95 dark:bg-tint-mint-20/10' : 'border-border bg-bg-2'
          )}
        >
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={18} weight="fill" className="text-accent-green" />
            <h3 className="font-semibold text-white/90">Review Everything</h3>
          </div>
          <ul className="space-y-1.5 mb-4">
            {['Generate tailored resume', 'Write cover letter', 'Stage for your review', 'One click to send approved'].map((t) => (
              <li key={t} className="flex items-center gap-1.5 text-xs text-white/45">
                <Check size={11} className="text-accent-green flex-shrink-0" />
                {t}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-white/30 font-mono">~{Math.max(5, Math.round(limit * 1.5))}s to prepare {limit} jobs</p>
        </motion.button>

        <motion.button
          onClick={() => toggleMode('automatic')}
          disabled={modeLoading}
          whileHover={{ y: -2 }}
          className={clsx(
            'relative text-left p-5 rounded-2xl border overflow-hidden transition-colors',
            mode === 'automatic' ? 'border-accent-yellow/40 bg-tint-cream-95 dark:bg-tint-cream-20/10' : 'border-border bg-bg-2'
          )}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkle size={18} weight="fill" className="text-accent-yellow" />
            <h3 className="font-semibold text-white/90">Fully Automatic</h3>
          </div>
          <ul className="space-y-1.5 mb-4">
            {['Select jobs above your threshold', 'Generate + apply immediately', 'No review step', 'Track results here after'].map((t) => (
              <li key={t} className="flex items-center gap-1.5 text-xs text-white/45">
                <Check size={11} className="text-accent-yellow flex-shrink-0" />
                {t}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-white/30 font-mono">Fires immediately, gated at score ≥ {minScore}</p>
        </motion.button>
      </div>
      {channel === 'browser' && (
        <p className="text-xs text-accent-cyan/70 -mt-3 mb-5 px-1">
          Browser channel always pre-fills only, in both modes — it never submits on its own.
        </p>
      )}

      {/* ── Channels ── */}
      <div className="bg-bg-2 border border-border rounded-2xl p-5 mb-5">
        <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">Application Channel</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['email', 'telegram', 'browser'] as Channel[]).map((c) => {
            const meta = CHANNEL_META[c];
            const Icon = meta.icon;
            const stat = insights?.channels[c];
            const rate = stat && stat.sent_count > 0 ? Math.round((stat.responded / stat.sent_count) * 100) : null;
            const isBest = bestChannel && bestChannel.channel === c;
            return (
              <motion.button
                key={c}
                onClick={() => setChannel(c)}
                whileHover={{ y: -2 }}
                className={clsx(
                  'relative text-left p-4 rounded-xl border transition-colors',
                  channel === c ? 'border-accent-green/40 bg-accent-green/5' : 'border-border hover:border-white/15'
                )}
              >
                {isBest && (
                  <span className="absolute top-2 right-2 text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-accent-green/15 text-accent-green">
                    Best so far
                  </span>
                )}
                <Icon size={18} weight="fill" className={channel === c ? 'text-accent-green' : 'text-white/40'} />
                <p className="text-sm font-semibold text-white/85 mt-2">{meta.label}</p>
                <p className="text-[11px] text-white/30 mt-0.5 leading-snug">{meta.blurb}</p>
                <p className="text-[11px] font-mono mt-2 text-white/40">
                  {rate !== null ? (
                    <>
                      <span className="text-accent-green">{rate}%</span> response · {stat!.sent_count} sent
                    </>
                  ) : (
                    'No history yet'
                  )}
                </p>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── AI Application Settings (sliders) ── */}
      <div className="bg-bg-2 border border-border rounded-2xl p-5 mb-5">
        <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">AI Application Settings</p>
        <div className="grid sm:grid-cols-2 gap-6">
          <PremiumSlider
            label="Minimum Match Score"
            value={minScore}
            min={0}
            max={100}
            suffix="%"
            color="green"
            sub="Only jobs scoring at or above this are candidates."
            onChange={setMinScore}
          />
          <PremiumSlider
            label="Maximum Applications"
            value={limit}
            min={1}
            max={50}
            color="cyan"
            sub="How many top-scoring jobs to load per batch."
            onChange={setLimit}
          />
        </div>
        <button
          onClick={loadCandidates}
          disabled={loadingCandidates}
          className="mt-5 flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-bg-3 border border-border text-white/70 hover:text-white/90 transition-all disabled:opacity-50"
        >
          {loadingCandidates ? <CircleNotch size={12} className="animate-spin" /> : <ArrowClockwise size={12} />}
          Load candidates
        </button>
      </div>

      {/* ── Pipeline ── */}
      {candidates.length > 0 && (
        <div className="bg-bg-2 border border-border rounded-2xl p-5 mb-5">
          <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-5">Application Pipeline</p>
          <div className="flex flex-col items-center">
            {pipelineStages.map((stage, i) => (
              <div key={stage.label} className="flex flex-col items-center w-full">
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className={clsx(
                    'flex flex-col items-center justify-center w-24 h-24 rounded-full border-2',
                    stage.value > 0 ? 'border-accent-green/40 bg-accent-green/5' : 'border-white/10 bg-bg-3',
                    running && i === 2 && 'animate-pulse-slow'
                  )}
                >
                  <span className={clsx('font-mono font-bold text-2xl', stage.value > 0 ? 'text-accent-green' : 'text-white/25')}>
                    {stage.value}
                  </span>
                  <span className="text-[10px] text-white/35 uppercase tracking-wide mt-0.5">{stage.label}</span>
                </motion.div>
                {i < pipelineStages.length - 1 && (
                  <ArrowDown size={16} className="text-white/15 my-1" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Candidate selection ── */}
      {candidates.length > 0 && !batch && (
        <div className="bg-bg-2 border border-border rounded-2xl p-4 mb-5">
          <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">
            {selected.size} of {candidates.length} selected
          </p>
          <div className="space-y-1.5 max-h-80 overflow-y-auto mb-4">
            {candidates.map((job) => (
              <button
                key={job.id}
                onClick={() => toggleSelect(job.id)}
                className={clsx(
                  'w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg border transition-all',
                  selected.has(job.id) ? 'bg-accent-green/5 border-accent-green/20' : 'border-border hover:border-white/10'
                )}
              >
                <span
                  className={clsx(
                    'w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center',
                    selected.has(job.id) ? 'bg-accent-green border-accent-green' : 'border-white/20'
                  )}
                >
                  {selected.has(job.id) && <Check size={11} className="text-bg" weight="bold" />}
                </span>
                <span className="text-sm text-white/70 flex-1 truncate">
                  {job.title} <span className="text-white/30">@ {job.company}</span>
                </span>
                <span className="text-xs font-mono text-accent-green flex-shrink-0">{job.score}</span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {running ? (
              <motion.div
                key="working"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-accent-green/5 border border-accent-green/20"
              >
                <CircleNotch size={16} className="animate-spin text-accent-green flex-shrink-0" />
                <span className="text-sm text-white/70 font-medium">{WORKING_STEPS[workingStep]}</span>
              </motion.div>
            ) : (
              <motion.button
                key="idle"
                onClick={handleRun}
                disabled={selected.size === 0}
                className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl bg-accent-green/10 border border-accent-green/30 text-accent-green hover:bg-accent-green/15 transition-all disabled:opacity-50"
              >
                <ChannelIcon size={14} />
                Start Application ({selected.size})
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}

      {batch && (
        <div className="bg-bg-2 border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-white/40 uppercase tracking-wider">
              Batch — {batch.channel} — {batch.status}
            </p>
            {batch.mode === 'review' && batch.channel === 'email' && batch.status === 'staged' && (
              <button
                onClick={handleSendApproved}
                disabled={sending}
                className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green hover:bg-accent-green/15 disabled:opacity-50"
              >
                {sending ? <CircleNotch size={12} className="animate-spin" /> : <PaperPlaneTilt size={12} />}
                Send approved
              </button>
            )}
          </div>
          <div className="space-y-2">
            {batch.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border">
                {batch.mode === 'review' && item.status === 'staged' && (
                  <button
                    onClick={() => toggleApproval(item.id, !item.approved)}
                    className={clsx(
                      'w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border',
                      item.approved ? 'bg-accent-green border-accent-green' : 'border-white/20'
                    )}
                  >
                    {item.approved ? <Check size={12} className="text-bg" /> : <X size={12} className="text-white/20" />}
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/80 truncate">
                    {item.title} <span className="text-white/30">@ {item.company}</span>
                  </p>
                  {item.email && <p className="text-xs text-white/30">{item.email}</p>}
                  {item.error && <p className="text-xs text-accent-pink">{item.error}</p>}
                </div>
                <span
                  className={clsx(
                    'text-xs font-medium px-2 py-1 rounded-md flex-shrink-0',
                    item.status === 'sent' || item.status === 'prefilled'
                      ? 'bg-accent-green/10 text-accent-green'
                      : item.status.includes('failed')
                      ? 'bg-accent-pink/10 text-accent-pink'
                      : 'bg-white/5 text-white/40'
                  )}
                >
                  {STATUS_LABEL[item.status] || item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BatchPage() {
  return (
    <ToastProvider>
      <BatchPageInner />
    </ToastProvider>
  );
}
