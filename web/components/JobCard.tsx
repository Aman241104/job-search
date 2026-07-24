'use client';

import { useRef, useState } from 'react';
import gsap from 'gsap';
import clsx from 'clsx';
import { MapPin, CurrencyDollar, ArrowSquareOut, CaretDown, CircleNotch, Star, FileText, Envelope, NotePencil, Check, X } from '@phosphor-icons/react';
import ScoreRing from './ScoreRing';
import { api, Job } from '@/lib/api';
import { useToast } from './Toast';

interface JobCardProps {
  job: Job;
  onStatusChange?: (id: string, status: Job['status']) => void;
  onStarChange?: (id: string, starred: boolean) => void;
  onView?: (id: string) => void;
}

const statusConfig: Record<
  Job['status'],
  { label: string; bg: string; text: string; border: string }
> = {
  found: { label: 'Found', bg: 'bg-white/5', text: 'text-white/50', border: 'border-white/10' },
  applied: { label: 'Applied', bg: 'bg-accent-cyan/10', text: 'text-accent-cyan', border: 'border-accent-cyan/20' },
  interviewing: { label: 'Interviewing', bg: 'bg-accent-yellow/10', text: 'text-accent-yellow', border: 'border-accent-yellow/20' },
  offer: { label: 'Offer', bg: 'bg-accent-green/10', text: 'text-accent-green', border: 'border-accent-green/20' },
  rejected: { label: 'Rejected', bg: 'bg-accent-pink/10', text: 'text-accent-pink', border: 'border-accent-pink/20' },
  ghosted: { label: 'Ghosted', bg: 'bg-white/5', text: 'text-white/30', border: 'border-white/10' },
};

const sourceColors: Record<string, string> = {
  Internshala: 'text-orange-700 bg-orange-700/10 border-orange-700/20',
  LinkedIn: 'text-sky-700 bg-sky-700/10 border-sky-700/20',
  Jobicy: 'text-purple-700 bg-purple-700/10 border-purple-700/20',
  WeWorkRemotely: 'text-emerald-700 bg-emerald-700/10 border-emerald-700/20',
  Arbeitnow: 'text-cyan-700 bg-cyan-700/10 border-cyan-700/20',
  Remotive: 'text-violet-700 bg-violet-700/10 border-violet-700/20',
  RemoteOK: 'text-rose-700 bg-rose-700/10 border-rose-700/20',
  TheMuse: 'text-pink-700 bg-pink-700/10 border-pink-700/20',
  'Remote.co': 'text-teal-700 bg-teal-700/10 border-teal-700/20',
};

const allStatuses: Job['status'][] = ['found', 'applied', 'interviewing', 'offer', 'rejected', 'ghosted'];

export default function JobCard({ job, onStatusChange, onStarChange, onView }: JobCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [applying, setApplying] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<Job['status']>(job.status);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [starred, setStarred] = useState<boolean>(Boolean(job.starred));
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState(job.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);
  const { toast } = useToast();

  // A fixed tilt angle (not continuous mouse-tracking) — GSAP's rotationX/Y
  // give the CSS 3D transform "tilt" feel the redesign asked for, cheap
  // enough to run across a whole page of cards since it's just one tween
  // per hover, not a per-pixel mousemove listener on every card.
  const handleMouseEnter = () => {
    if (!cardRef.current) return;
    gsap.to(cardRef.current, {
      scale: 1.01, y: -2, rotationX: -2, rotationY: 2, transformPerspective: 600,
      duration: 0.25, ease: 'power2.out',
    });
  };

  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    gsap.to(cardRef.current, {
      scale: 1, y: 0, rotationX: 0, rotationY: 0,
      duration: 0.25, ease: 'power2.out',
    });
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      await api.apply(job.id);
      setCurrentStatus('applied');
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

  const handleStatusChange = async (status: Job['status']) => {
    setShowStatusMenu(false);
    try {
      await api.update(job.id, status);
      setCurrentStatus(status);
      onStatusChange?.(job.id, status);
      toast(`Status → "${statusConfig[status].label}"`, 'success');
    } catch {
      toast('Failed to update status', 'error');
    }
  };

  const handleStar = async () => {
    try {
      const res = await api.starJob(job.id);
      setStarred(res.starred);
      onStarChange?.(job.id, res.starred);
    } catch {
      toast('Failed to star job', 'error');
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await api.saveNotes(job.id, notes);
      setNotesDirty(false);
      toast('Notes saved', 'success');
    } catch {
      toast('Failed to save notes', 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  const s = statusConfig[currentStatus];
  const sourceCls = sourceColors[job.source] || 'text-white/40 bg-white/5 border-white/10';
  const hasFiles = currentStatus !== 'found' && (job.cv_path || job.cover_letter_path);

  return (
    <div
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="card-hover bg-bg-2 border border-border rounded-2xl p-4 relative cursor-default"
    >
      {/* Main row */}
      <div
        className="flex items-start gap-3 cursor-pointer"
        onClick={() => onView?.(job.id)}
        title="View full details"
      >
        <ScoreRing score={job.score} size={48} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <h3 className="font-sans font-semibold text-white/90 text-sm leading-tight truncate">
                {job.title}
              </h3>
              <p className="text-white/40 text-xs mt-0.5 truncate">{job.company}</p>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Star button */}
              <button
                onClick={handleStar}
                className={clsx(
                  'p-1 rounded-lg transition-all duration-150',
                  starred
                    ? 'text-accent-yellow'
                    : 'text-white/20 hover:text-white/50'
                )}
                title={starred ? 'Unstar' : 'Star this job'}
              >
                <Star size={13} fill={starred ? 'currentColor' : 'none'} />
              </button>

              <span className={clsx('text-[10px] font-medium px-2 py-0.5 rounded-md border', sourceCls)}>
                {job.source}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            {job.location && (
              <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-tone-blue-90 text-tone-blue-30 dark:bg-tone-blue-30/20 dark:text-tone-blue-80">
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

      {/* Score reason */}
      {job.score_reason && (
        <p className="text-[11px] text-white/25 italic mt-2.5 leading-relaxed line-clamp-2">
          {job.score_reason}
        </p>
      )}

      {/* Notes section */}
      {showNotes && (
        <div className="mt-3 space-y-2">
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
            placeholder="Add notes about this job (interview prep, contacts, deadlines...)"
            rows={3}
            className="w-full bg-bg-3 border border-border rounded-xl px-3 py-2 text-xs text-white/70 placeholder:text-white/20 resize-none focus:outline-none focus:border-accent-green/30"
          />
          {notesDirty && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg bg-accent-green/10 border border-accent-green/20 text-accent-green hover:bg-accent-green/15 transition-all disabled:opacity-50"
              >
                {savingNotes ? <CircleNotch size={9} className="animate-spin" /> : <Check size={9} />}
                Save
              </button>
              <button
                onClick={() => { setNotes(job.notes || ''); setNotesDirty(false); }}
                className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg text-white/30 hover:text-white/50 transition-all"
              >
                <X size={9} />
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        {/* Status pill with dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className={clsx(
              'flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-all duration-150 hover:opacity-80',
              s.bg, s.text, s.border
            )}
          >
            {s.label}
            <CaretDown size={10} />
          </button>

          {showStatusMenu && (
            <div className="absolute bottom-full left-0 mb-1 bg-bg-3 border border-border rounded-xl overflow-hidden shadow-xl z-10 min-w-[140px]">
              {allStatuses.map((st) => {
                const sc = statusConfig[st];
                return (
                  <button
                    key={st}
                    onClick={() => handleStatusChange(st)}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-[11px] font-medium transition-all duration-100 hover:bg-white/5',
                      sc.text,
                      currentStatus === st && 'bg-white/5'
                    )}
                  >
                    {sc.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {/* Notes toggle */}
          <button
            onClick={() => setShowNotes(!showNotes)}
            className={clsx(
              'p-1.5 rounded-lg transition-all duration-150',
              showNotes || notes
                ? 'text-accent-cyan bg-accent-cyan/10'
                : 'text-white/25 hover:text-white/50 hover:bg-white/5'
            )}
            title="Add notes"
          >
            <NotePencil size={12} />
          </button>

          {/* CV download */}
          {hasFiles && job.cv_path && (
            <button
              onClick={() => api.downloadCV(job.id)}
              className="p-1.5 rounded-lg text-white/25 hover:text-accent-purple hover:bg-accent-purple/10 transition-all duration-150"
              title="Download CV"
            >
              <FileText size={12} />
            </button>
          )}

          {/* Cover letter download */}
          {hasFiles && job.cover_letter_path && (
            <button
              onClick={() => api.downloadCover(job.id)}
              className="p-1.5 rounded-lg text-white/25 hover:text-accent-yellow hover:bg-accent-yellow/10 transition-all duration-150"
              title="Download Cover Letter"
            >
              <Envelope size={12} />
            </button>
          )}

          {/* External link */}
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-white/25 hover:text-white/60 hover:bg-white/5 transition-all duration-150"
            >
              <ArrowSquareOut size={12} />
            </a>
          )}

          {currentStatus === 'found' && (
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
              {applying ? (
                <>
                  <CircleNotch size={10} className="animate-spin" />
                  Generating...
                </>
              ) : (
                'Apply'
              )}
            </button>
          )}
        </div>
      </div>

      {showStatusMenu && (
        <div className="fixed inset-0 z-0" onClick={() => setShowStatusMenu(false)} />
      )}
    </div>
  );
}
