'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CircleNotch, Envelope, PaperPlaneTilt, DeviceMobile, Check, X, ArrowClockwise } from '@phosphor-icons/react';
import { ToastProvider, useToast } from '@/components/Toast';
import { api, Job, Batch } from '@/lib/api';
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
  const { toast } = useToast();

  useEffect(() => {
    api.getAutoApplyMode().then((r) => setMode(r.mode)).finally(() => setModeLoading(false));
  }, []);

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
    } catch {
      toast('Failed to send batch', 'error');
    } finally {
      setSending(false);
    }
  };

  const channelIcon = { email: Envelope, telegram: PaperPlaneTilt, browser: DeviceMobile }[channel];
  const ChannelIcon = channelIcon;

  return (
    <div className="min-h-screen pb-24 md:pb-8 px-6 md:px-8 py-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white/90 mb-1">Batch Apply</h1>
        <p className="text-white/35 text-sm">
          Pick a batch of jobs, choose a channel, and run it all at once — automatic or review-then-send.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="bg-bg-2 border border-border rounded-2xl p-4 mb-5">
        <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">Mode</p>
        <div className="flex gap-2">
          <motion.button
            onClick={() => toggleMode('review')}
            disabled={modeLoading}
            whileTap={{ scale: 0.97 }}
            className={clsx(
              'relative flex-1 text-left px-4 py-3 rounded-xl border overflow-hidden',
              mode === 'review' ? 'border-accent-green/30 text-white/90' : 'border-border text-white/50 hover:text-white/70'
            )}
          >
            {mode === 'review' && (
              <motion.div
                layoutId="batch-mode-pill"
                className="absolute inset-0 bg-accent-green/10"
                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              />
            )}
            <span className="relative text-sm font-semibold block">Review</span>
            <span className="relative text-xs text-white/35">Generate everything, review, then one click to send approved items</span>
          </motion.button>
          <motion.button
            onClick={() => toggleMode('automatic')}
            disabled={modeLoading}
            whileTap={{ scale: 0.97 }}
            className={clsx(
              'relative flex-1 text-left px-4 py-3 rounded-xl border overflow-hidden',
              mode === 'automatic' ? 'border-accent-yellow/30 text-white/90' : 'border-border text-white/50 hover:text-white/70'
            )}
          >
            {mode === 'automatic' && (
              <motion.div
                layoutId="batch-mode-pill"
                className="absolute inset-0 bg-accent-yellow/10"
                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              />
            )}
            <span className="relative text-sm font-semibold block">Automatic</span>
            <span className="relative text-xs text-white/35">Fires immediately, gated by your score threshold — no review step</span>
          </motion.button>
        </div>
        {channel === 'browser' && (
          <p className="text-xs text-accent-cyan/70 mt-3">
            Browser channel always pre-fills only, in both modes — it never submits on its own. Works only on postings without a login wall.
          </p>
        )}
      </div>

      {/* Channel + candidate selection */}
      <div className="bg-bg-2 border border-border rounded-2xl p-4 mb-5">
        <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">Channel</p>
        <div className="flex gap-2 mb-4">
          {(['email', 'telegram', 'browser'] as Channel[]).map((c) => (
            <motion.button
              key={c}
              onClick={() => setChannel(c)}
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.03 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              className={clsx(
                'relative flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border overflow-hidden capitalize',
                channel === c ? 'border-accent-green/30 text-accent-green' : 'border-border text-white/40 hover:text-white/70'
              )}
            >
              {channel === c && (
                <motion.div
                  layoutId="batch-channel-pill"
                  className="absolute inset-0 bg-accent-green/10"
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                {c === 'email' && <Envelope size={12} weight="fill" />}
                {c === 'telegram' && <PaperPlaneTilt size={12} weight="fill" />}
                {c === 'browser' && <DeviceMobile size={12} weight="fill" />}
                {c}
              </span>
            </motion.button>
          ))}
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-xs text-white/40 block mb-1">Min score</label>
            <input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-24 bg-bg-3 border border-border rounded-lg px-2 py-1.5 text-sm text-white/80"
            />
          </div>
          <div>
            <label className="text-xs text-white/40 block mb-1">Top N</label>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-24 bg-bg-3 border border-border rounded-lg px-2 py-1.5 text-sm text-white/80"
            />
          </div>
          <button
            onClick={loadCandidates}
            disabled={loadingCandidates}
            className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-bg-3 border border-border text-white/70 hover:text-white/90 transition-all disabled:opacity-50"
          >
            {loadingCandidates ? <CircleNotch size={12} className="animate-spin" /> : <ArrowClockwise size={12} />}
            Load candidates
          </button>
        </div>
      </div>

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
          <button
            onClick={handleRun}
            disabled={running || selected.size === 0}
            className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl bg-accent-green/10 border border-accent-green/30 text-accent-green hover:bg-accent-green/15 transition-all disabled:opacity-50"
          >
            {running ? <CircleNotch size={14} className="animate-spin" /> : <ChannelIcon size={14} />}
            Run batch ({selected.size})
          </button>
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
