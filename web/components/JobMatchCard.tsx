'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { MapPin, CurrencyDollar, GraduationCap, Globe, ArrowUpRight, CircleNotch } from '@phosphor-icons/react';
import ScoreRing from './ScoreRing';
import { api, Job } from '@/lib/api';
import { useToast } from './Toast';

interface JobMatchCardProps {
  job: Job;
  onStatusChange?: (id: string, status: Job['status']) => void;
  // Full fetched job set (e.g. Discover mode's kanbanData) — when present,
  // hovering the company name shows a real stats popover computed from it.
  // Omitted on the Dashboard, which only has a top-5 slice, not enough to
  // aggregate honestly.
  allJobs?: Job[];
}

const STOPWORDS = new Set(['and', 'the', 'for', 'with', 'developer', 'engineer', 'remote']);

function companyStats(company: string, allJobs: Job[]) {
  const postings = allJobs.filter((j) => j.company === company);
  const avgScore = Math.round(postings.reduce((s, j) => s + j.score, 0) / postings.length);
  const wordCounts = new Map<string, number>();
  postings.forEach((j) => {
    j.title
      .toLowerCase()
      .split(/[^a-z0-9+.]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .forEach((w) => wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1));
  });
  const topKeywords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);
  return { openings: postings.length, avgScore, topKeywords };
}

// job_finder.py's scoring step only ever emits these three tags, comma-joined
// (agents/job_finder.py ~line 999-1001) — parsing is exhaustive, not a guess.
const REASON_LABELS: Record<string, string> = {
  'strong skill match': 'Matches your core skills',
  'fresher-friendly': 'Open to freshers',
  remote: 'Fully remote',
};

export default function JobMatchCard({ job, onStatusChange, allJobs }: JobMatchCardProps) {
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState<Job['status']>(job.status);
  const [showCompanyPreview, setShowCompanyPreview] = useState(false);
  const { toast } = useToast();

  const stats = allJobs && job.company ? companyStats(job.company, allJobs) : null;

  const reasons = (job.score_reason || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  const isRemote = reasons.includes('remote');
  const isFresher = reasons.includes('fresher-friendly');

  const handleApply = async () => {
    setApplying(true);
    try {
      await api.apply(job.id);
      setStatus('applied');
      onStatusChange?.(job.id, 'applied');
      toast(`Applied to ${job.title}! CV generated.`, 'success');
      if (job.url) window.open(job.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast('Failed to generate CV. Opening URL anyway.', 'error');
      if (job.url) window.open(job.url, '_blank', 'noopener,noreferrer');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="group bg-bg-2 border border-border rounded-2xl p-5 hover:border-white/15 transition-colors">
      <div className="flex items-start gap-4">
        <ScoreRing score={job.score} size={52} />
        <div className="flex-1 min-w-0">
          <h3 className="font-sans font-semibold text-white/90 leading-tight truncate">{job.title}</h3>
          <div className="relative inline-block max-w-full">
            <p
              className={clsx('text-white/40 text-sm mt-0.5 truncate', stats && stats.openings > 1 && 'cursor-help hover:text-white/60')}
              onMouseEnter={() => stats && stats.openings > 1 && setShowCompanyPreview(true)}
              onMouseLeave={() => setShowCompanyPreview(false)}
            >
              {job.company}
            </p>
            {showCompanyPreview && stats && (
              <div className="absolute z-20 top-full left-0 mt-1 w-56 bg-bg-3 border border-border rounded-xl p-3 shadow-xl text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-white/40">Openings</span>
                  <span className="text-white/80 font-mono">{stats.openings}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/40">Avg match</span>
                  <span className="text-accent-green font-mono">{stats.avgScore}</span>
                </div>
                {stats.topKeywords.length > 0 && (
                  <div>
                    <span className="text-white/40">Common roles</span>
                    <p className="text-white/70 mt-0.5 capitalize">{stats.topKeywords.join(', ')}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
            {isRemote && (
              <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-tone-blue-90 text-tone-blue-30 dark:bg-tone-blue-30/20 dark:text-tone-blue-80">
                <Globe size={9} />
                Remote
              </span>
            )}
            {isFresher && (
              <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-tone-purple-90 text-tone-purple-30 dark:bg-tone-purple-30/20 dark:text-tone-purple-80">
                <GraduationCap size={9} />
                Fresher-friendly
              </span>
            )}
            {job.location && !isRemote && (
              <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/5 text-white/40">
                <MapPin size={9} />
                {job.location}
              </span>
            )}
            {job.salary && (
              <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-tone-green-90 text-tone-green-30 dark:bg-tone-green-30/20 dark:text-tone-green-80">
                <CurrencyDollar size={9} />
                {job.salary}
              </span>
            )}
          </div>
        </div>
      </div>

      {reasons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {reasons.map((r) => (
            <li key={r} className="flex items-start gap-1.5 text-[11px] text-white/35">
              <span className="text-accent-green mt-0.5">•</span>
              {REASON_LABELS[r] || r}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
        <span className="text-[10px] text-white/25 font-mono">{job.source}</span>
        {status === 'found' ? (
          <button
            onClick={handleApply}
            disabled={applying}
            className={clsx(
              'flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all duration-150',
              applying
                ? 'border-white/10 text-white/30 cursor-not-allowed'
                : 'border-accent-green/40 text-accent-green hover:bg-accent-green/10'
            )}
          >
            {applying ? <CircleNotch size={10} className="animate-spin" /> : <ArrowUpRight size={10} />}
            {applying ? 'Generating...' : 'Apply Now'}
          </button>
        ) : (
          <span className="text-[11px] font-medium text-white/40 capitalize">{status}</span>
        )}
      </div>
    </div>
  );
}
