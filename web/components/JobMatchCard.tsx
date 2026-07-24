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
}

// job_finder.py's scoring step only ever emits these three tags, comma-joined
// (agents/job_finder.py ~line 999-1001) — parsing is exhaustive, not a guess.
const REASON_LABELS: Record<string, string> = {
  'strong skill match': 'Matches your core skills',
  'fresher-friendly': 'Open to freshers',
  remote: 'Fully remote',
};

export default function JobMatchCard({ job, onStatusChange }: JobMatchCardProps) {
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState<Job['status']>(job.status);
  const { toast } = useToast();

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
          <p className="text-white/40 text-sm mt-0.5 truncate">{job.company}</p>

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
