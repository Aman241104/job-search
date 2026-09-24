'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { motion, AnimatePresence } from 'framer-motion';
import { Broadcast, X, CheckCircle, CircleNotch, Check, Sparkle, Funnel, Globe, FloppyDisk, Timer } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useToast } from './Toast';
import clsx from 'clsx';

interface FindButtonProps {
  onComplete?: () => void;
}

interface ScoredJob {
  title: string;
  company: string;
  source?: string;
  location?: string;
  score: number;
  reason?: string;
}

// Events streamed by /api/find/stream (see JobFinderAgent.find_jobs progress)
type SSEEvent =
  | { type: 'start' | 'status' | 'progress'; message?: string; percent?: number }
  | { type: 'source_start'; label: string }
  | { type: 'source_done'; label: string; count: number; total: number }
  | { type: 'filtered'; raw: number; unique: number }
  | { type: 'keyword_scored'; total: number; uncertain: number; jobs: ScoredJob[] }
  | { type: 'ai_start'; index: number; total: number; job: { title: string; company: string } }
  | { type: 'ai_scored'; index: number; total: number; job: ScoredJob }
  | { type: 'done'; message?: string; stats?: unknown; top_jobs?: unknown[] }
  | { type: 'error'; message?: string };

type Stage = 'idle' | 'sources' | 'filter' | 'evaluate' | 'save' | 'done' | 'error';
const STAGES: { key: Stage; label: string; icon: typeof Globe }[] = [
  { key: 'sources', label: 'Scrape', icon: Globe },
  { key: 'filter', label: 'Filter', icon: Funnel },
  { key: 'evaluate', label: 'Evaluate', icon: Sparkle },
  { key: 'save', label: 'Save', icon: FloppyDisk },
];
const STAGE_ORDER: Stage[] = ['sources', 'filter', 'evaluate', 'save', 'done'];

// "Internshala: react-js-jobs" -> "Internshala"
const sourceName = (label: string) => label.split(':')[0].trim();

function scoreTone(score: number) {
  if (score >= 80) return 'text-accent-green border-accent-green/40 bg-accent-green/10';
  if (score >= 60) return 'text-accent-cyan border-accent-cyan/40 bg-accent-cyan/10';
  return 'text-white/40 border-white/15 bg-white/5';
}

function fmtSecs(s: number) {
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export default function FindButton({ onComplete }: FindButtonProps) {
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [sources, setSources] = useState<{ name: string; count: number; active: boolean }[]>([]);
  const [rawCount, setRawCount] = useState(0);
  const [uniqueCount, setUniqueCount] = useState<number | null>(null);
  const [feed, setFeed] = useState<ScoredJob[]>([]);
  const [evaluating, setEvaluating] = useState<{ index: number; total: number; title: string; company: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [aiRate, setAiRate] = useState<number | null>(null); // seconds per AI evaluation
  const progressRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const finishedRef = useRef(false); // stream closing after 'done' is expected, not an error
  const startRef = useRef(0);
  const aiStartRef = useRef<number | null>(null);
  const { toast } = useToast();

  const animateProgress = (to: number) => {
    setProgress(to);
    if (!progressRef.current) return;
    gsap.to(progressRef.current, { width: `${to}%`, duration: 0.5, ease: 'power2.out' });
  };

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => () => esRef.current?.close(), []);

  const reset = () => {
    setSources([]);
    setRawCount(0);
    setUniqueCount(null);
    setFeed([]);
    setEvaluating(null);
    setElapsed(0);
    setAiRate(null);
    aiStartRef.current = null;
    finishedRef.current = false;
  };

  const handleEvent = (data: SSEEvent) => {
    switch (data.type) {
      case 'start':
      case 'status':
      case 'progress':
        if (data.message) setStatus(data.message);
        break;

      case 'source_start': {
        setStage('sources');
        const name = sourceName(data.label);
        setStatus(`Scraping ${data.label}`);
        setSources((prev) => {
          const rest = prev.map((s) => ({ ...s, active: false }));
          const hit = rest.find((s) => s.name === name);
          if (hit) { hit.active = true; return [...rest]; }
          return [...rest, { name, count: 0, active: true }];
        });
        break;
      }

      case 'source_done': {
        const name = sourceName(data.label);
        setRawCount(data.total);
        setSources((prev) => {
          const next = prev.map((s) => (s.name === name ? { ...s, count: s.count + data.count } : s));
          // Scrape stage fills 5% -> ~55%; the source count isn't known up
          // front, so ease toward the cap instead of a fake linear bar.
          animateProgress(5 + 50 * (1 - Math.exp(-next.length / 8)));
          return next;
        });
        break;
      }

      case 'filtered':
        setStage('filter');
        setSources((prev) => prev.map((s) => ({ ...s, active: false })));
        setUniqueCount(data.unique);
        setStatus(`${data.raw} scraped → ${data.unique} new after removing duplicates, seniors and already-seen jobs`);
        animateProgress(58);
        break;

      case 'keyword_scored':
        setStage('evaluate');
        setFeed([...data.jobs].sort((a, b) => b.score - a.score).slice(0, 6));
        setStatus(
          data.uncertain > 0
            ? `Quick-scored ${data.total} jobs — AI is now evaluating the ${data.uncertain} borderline ones`
            : `Scored all ${data.total} jobs`
        );
        animateProgress(62);
        break;

      case 'ai_start':
        setStage('evaluate');
        if (aiStartRef.current === null) aiStartRef.current = Date.now();
        setEvaluating({ index: data.index, total: data.total, title: data.job.title, company: data.job.company });
        break;

      case 'ai_scored': {
        if (aiStartRef.current !== null) setAiRate((Date.now() - aiStartRef.current) / 1000 / data.index);
        setFeed((prev) => [data.job, ...prev.filter((j) => !(j.title === data.job.title && j.company === data.job.company))].slice(0, 30));
        animateProgress(62 + 33 * (data.index / data.total));
        if (data.index === data.total) {
          setEvaluating(null);
          setStage('save');
          setStatus('Saving matches to your tracker…');
        }
        break;
      }

      case 'done':
        finishedRef.current = true;
        setStage('done');
        setEvaluating(null);
        animateProgress(100);
        setStatus(data.message || 'Search complete!');
        setRunning(false);
        esRef.current?.close();
        toast(data.message || 'Search complete', 'success');
        onComplete?.();
        break;

      case 'error':
        finishedRef.current = true;
        setStage('error');
        setStatus(data.message || 'An error occurred');
        setRunning(false);
        esRef.current?.close();
        toast(data.message || 'Search failed', 'error');
        break;
    }
  };

  const handleFind = () => {
    if (running) {
      finishedRef.current = true;
      esRef.current?.close();
      setRunning(false);
      setStage('idle');
      setStatus('Search stopped');
      setEvaluating(null);
      return;
    }

    reset();
    setRunning(true);
    setStage('sources');
    setStatus('Starting search…');
    animateProgress(3);
    startRef.current = Date.now();

    const es = api.findStream();
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        handleEvent(JSON.parse(e.data));
      } catch {
        // keep-alive comments / non-JSON lines
      }
    };
    es.onerror = () => {
      es.close();
      if (finishedRef.current) return;
      finishedRef.current = true;
      setRunning(false);
      setStage('error');
      setStatus('Connection to the job finder dropped — any jobs found so far were still saved.');
      onComplete?.();
    };
  };

  const highMatches = useMemo(() => feed.filter((j) => j.score >= 80).length, [feed]);
  const eta =
    evaluating && aiRate ? (evaluating.total - evaluating.index + 1) * aiRate : null;
  const stageIdx = STAGE_ORDER.indexOf(stage);
  const showPanel = stage !== 'idle' || progress > 0;

  return (
    <div className="flex flex-col gap-3">
      <motion.button
        onClick={handleFind}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        className={clsx(
          'relative flex items-center gap-3 px-6 py-3 rounded-xl font-semibold text-sm transition-colors duration-200 overflow-hidden',
          running
            ? 'bg-accent-pink/10 border border-accent-pink/30 text-accent-pink hover:bg-accent-pink/15'
            : 'bg-accent-green/10 border border-accent-green/30 text-accent-green hover:bg-accent-green/15 hover:border-accent-green/50'
        )}
      >
        {running ? (
          <>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-pink opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-accent-pink" />
            </span>
            Stop search
            <span className="ml-auto flex items-center gap-1 font-mono text-xs opacity-70">
              <Timer size={13} />{fmtSecs(elapsed)}
            </span>
            <X size={15} />
          </>
        ) : stage === 'done' ? (
          <>
            <CheckCircle size={16} />
            Search complete — run again
          </>
        ) : (
          <>
            <Broadcast size={16} />
            Find New Jobs
          </>
        )}
      </motion.button>

      {showPanel && (
        <div className="space-y-4">
          {/* Stage stepper */}
          <div className="flex items-center gap-1.5">
            {STAGES.map((s, i) => {
              const thisIdx = STAGE_ORDER.indexOf(s.key);
              const complete = stageIdx > thisIdx;
              const active = stage === s.key;
              const Icon = s.icon;
              return (
                <div key={s.key} className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div
                    className={clsx(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors',
                      complete && 'border-accent-green/30 text-accent-green bg-accent-green/10',
                      active && 'border-accent-cyan/40 text-accent-cyan bg-accent-cyan/10',
                      !complete && !active && 'border-border text-white/30'
                    )}
                  >
                    {complete ? <Check size={11} /> : active && running ? <CircleNotch size={11} className="animate-spin" /> : <Icon size={11} />}
                    <span className="truncate">{s.label}</span>
                  </div>
                  {i < STAGES.length - 1 && <div className={clsx('h-px flex-1', complete ? 'bg-accent-green/40' : 'bg-white/10')} />}
                </div>
              );
            })}
          </div>

          {/* Progress bar + status */}
          <div className="space-y-1.5">
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                ref={progressRef}
                className={clsx(
                  'h-full rounded-full',
                  stage === 'error' ? 'bg-accent-pink' : stage === 'done' ? 'bg-accent-green' : 'bg-gradient-to-r from-accent-green to-accent-cyan'
                )}
                style={{ width: '0%' }}
              />
            </div>
            <div className="flex items-start justify-between gap-3">
              <p className={clsx('text-xs', stage === 'error' ? 'text-accent-pink' : 'text-white/50')}>{status}</p>
              <span className="text-[11px] font-mono text-white/35 flex-shrink-0">{Math.round(progress)}%</span>
            </div>
          </div>

          {/* Counters */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Scraped', value: rawCount },
              { label: 'New', value: uniqueCount ?? '—' },
              { label: 'Strong matches', value: highMatches },
            ].map((c) => (
              <div key={c.label} className="rounded-xl bg-white/[0.04] border border-white/5 px-3 py-2">
                <p className="font-mono text-lg font-bold text-white/85 leading-none">{c.value}</p>
                <p className="text-[10px] text-white/35 mt-1">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Sources */}
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sources.map((s) => (
                <span
                  key={s.name}
                  className={clsx(
                    'inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors',
                    s.active ? 'border-accent-cyan/40 text-accent-cyan bg-accent-cyan/10' : 'border-border text-white/45'
                  )}
                >
                  {s.active ? <CircleNotch size={9} className="animate-spin" /> : <Check size={9} className="text-accent-green" />}
                  {s.name}
                  <span className="font-mono opacity-70">{s.count}</span>
                </span>
              ))}
            </div>
          )}

          {/* Now evaluating */}
          <AnimatePresence mode="wait">
            {evaluating && (
              <motion.div
                key={`${evaluating.index}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="rounded-xl border border-accent-cyan/25 bg-accent-cyan/5 px-3 py-2.5"
              >
                <div className="flex items-center justify-between text-[11px] text-accent-cyan mb-1">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Sparkle size={12} className="animate-pulse" /> AI evaluating {evaluating.index} of {evaluating.total}
                  </span>
                  {eta !== null && <span className="font-mono opacity-80">~{fmtSecs(eta)} left</span>}
                </div>
                <p className="text-sm text-white/85 truncate">{evaluating.title}</p>
                <p className="text-xs text-white/40 truncate">{evaluating.company}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scored feed */}
          {feed.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-white/40 mb-2">
                {stage === 'done' ? 'Top results' : 'Latest evaluations'}
              </p>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {feed.map((j) => (
                    <motion.div
                      key={`${j.title}|${j.company}`}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2"
                    >
                      <span className={clsx('w-10 flex-shrink-0 text-center font-mono text-sm font-bold rounded-lg border py-1', scoreTone(j.score))}>
                        {j.score}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-white/85 truncate">{j.title}</p>
                        <p className="text-[11px] text-white/40 truncate">
                          {j.company}{j.location ? ` · ${j.location}` : ''}{j.source ? ` · ${j.source}` : ''}
                        </p>
                        {j.reason && <p className="text-[10px] text-white/30 italic truncate">{j.reason}</p>}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
