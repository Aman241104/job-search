'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import clsx from 'clsx';
import {
  X, MapPin, DollarSign, ExternalLink, Star, Copy, Check,
  Loader2, ChevronDown, Calendar, Ban, Download, ChevronRight,
  Plus, FileText, Mail,
} from 'lucide-react';
import ScoreRing from './ScoreRing';
import { api, Job, InterviewRound } from '@/lib/api';
import { useToast } from './Toast';

interface JobDrawerProps {
  jobId: string | null;
  onClose: () => void;
  onStatusChange?: (id: string, status: Job['status']) => void;
  onStarChange?: (id: string, starred: boolean) => void;
}

type DrawerTab = 'overview' | 'track' | 'cv';

const statusConfig: Record<Job['status'], { label: string; color: string }> = {
  found: { label: 'Found', color: 'text-white/50' },
  applied: { label: 'Applied', color: 'text-blue-400' },
  interviewing: { label: 'Interviewing', color: 'text-accent-yellow' },
  offer: { label: 'Offer 🎉', color: 'text-accent-green' },
  rejected: { label: 'Rejected', color: 'text-red-400' },
  ghosted: { label: 'Ghosted', color: 'text-white/30' },
};

const sourceColors: Record<string, string> = {
  Internshala: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  LinkedIn: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
  Jobicy: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  WeWorkRemotely: 'text-green-400 bg-green-400/10 border-green-400/20',
  Arbeitnow: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
  Remotive: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
  RemoteOK: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
  TheMuse: 'text-pink-400 bg-pink-400/10 border-pink-400/20',
  'Remote.co': 'text-teal-400 bg-teal-400/10 border-teal-400/20',
};

const allStatuses: Job['status'][] = ['found', 'applied', 'interviewing', 'offer', 'rejected', 'ghosted'];

const ROUND_TYPES = ['phone', 'technical', 'hr', 'assignment', 'final'] as const;
const RESULT_TYPES = ['pending', 'passed', 'failed', 'cancelled'] as const;

const resultBadgeClass: Record<string, string> = {
  pending: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  passed: 'text-green-400 bg-green-400/10 border-green-400/20',
  failed: 'text-red-400 bg-red-400/10 border-red-400/20',
  cancelled: 'text-white/30 bg-white/5 border-white/10',
};

const timelineDotColor: Record<string, string> = {
  discovered: 'bg-white/40',
  applied: 'bg-blue-400',
  interviewing: 'bg-yellow-400',
  offer: 'bg-green-400',
  rejected: 'bg-red-400',
  ghosted: 'bg-white/20',
};

// ── Simple markdown renderer ──────────────────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let ulBuffer: string[] = [];

  const flushUl = (key: string) => {
    if (ulBuffer.length > 0) {
      nodes.push(
        <ul key={`ul-${key}`} className="list-disc list-inside space-y-0.5 my-1">
          {ulBuffer.map((item, i) => (
            <li key={i} className="text-xs text-white/50 ml-3">{parseBold(item)}</li>
          ))}
        </ul>
      );
      ulBuffer = [];
    }
  };

  lines.forEach((line, idx) => {
    const h1 = line.match(/^# (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    const bullet = line.match(/^[-*] (.+)/);

    if (h1) {
      flushUl(String(idx));
      nodes.push(<h3 key={idx} className="text-sm font-bold text-white/80 mt-3 mb-1">{parseBold(h1[1])}</h3>);
    } else if (h2) {
      flushUl(String(idx));
      nodes.push(<h4 key={idx} className="text-xs font-semibold text-white/60 mt-2">{parseBold(h2[1])}</h4>);
    } else if (h3) {
      flushUl(String(idx));
      nodes.push(<h4 key={idx} className="text-xs font-semibold text-white/50 mt-2">{parseBold(h3[1])}</h4>);
    } else if (bullet) {
      ulBuffer.push(bullet[1]);
    } else if (line.trim() === '') {
      flushUl(String(idx));
    } else {
      flushUl(String(idx));
      nodes.push(<p key={idx} className="text-xs text-white/50 leading-relaxed">{parseBold(line)}</p>);
    }
  });
  flushUl('end');
  return nodes;
}

function parseBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((p, i) => i % 2 === 1 ? <strong key={i} className="text-white/80 font-semibold">{p}</strong> : p);
}

// ── Format date helper ────────────────────────────────────────────────────────
function fmtDate(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso.slice(0, 10); }
}

// ── Timeline ─────────────────────────────────────────────────────────────────
interface TimelineStep {
  key: string;
  label: string;
  date?: string;
  active: boolean;
  dotColor: string;
}

function ApplicationTimeline({ job, status }: { job: Job; status: Job['status'] }) {
  const statusOrder: Job['status'][] = ['found', 'applied', 'interviewing', 'offer', 'rejected', 'ghosted'];
  const currentIdx = statusOrder.indexOf(status);

  const steps: TimelineStep[] = [];

  if (job.date_found) {
    steps.push({ key: 'discovered', label: 'Discovered', date: fmtDate(job.date_found), active: true, dotColor: timelineDotColor.discovered });
  }
  if (job.date_applied || currentIdx >= 1) {
    steps.push({
      key: 'applied', label: 'Applied',
      date: job.date_applied ? fmtDate(job.date_applied) : undefined,
      active: currentIdx >= 1,
      dotColor: currentIdx >= 1 ? timelineDotColor.applied : 'bg-white/10',
    });
  }
  if (status === 'interviewing' || currentIdx >= 2) {
    steps.push({
      key: 'interviewing', label: 'Interviewing',
      active: currentIdx >= 2,
      dotColor: currentIdx >= 2 ? timelineDotColor.interviewing : 'bg-white/10',
    });
  }
  if (status === 'offer') {
    steps.push({ key: 'offer', label: 'Offer Received', active: true, dotColor: timelineDotColor.offer });
  }
  if (status === 'rejected') {
    steps.push({ key: 'rejected', label: 'Rejected', active: true, dotColor: timelineDotColor.rejected });
  }
  if (status === 'ghosted') {
    steps.push({ key: 'ghosted', label: 'Ghosted', active: true, dotColor: timelineDotColor.ghosted });
  }

  if (steps.length === 0) return null;

  return (
    <div>
      <p className="text-xs text-white/30 uppercase tracking-wider mb-3">Application Timeline</p>
      <div className="flex flex-col gap-0">
        {steps.map((step, idx) => (
          <div key={step.key} className="flex items-start gap-3">
            {/* Dot + line column */}
            <div className="flex flex-col items-center w-4 flex-shrink-0">
              <div className={clsx('w-2.5 h-2.5 rounded-full mt-0.5 flex-shrink-0', step.dotColor)} />
              {idx < steps.length - 1 && (
                <div className={clsx('w-px flex-1 my-1', step.active ? 'bg-white/15' : 'bg-white/5')} style={{ minHeight: '20px' }} />
              )}
            </div>
            {/* Label + date */}
            <div className={clsx('pb-4 flex items-baseline gap-2', idx === steps.length - 1 && 'pb-0')}>
              <span className={clsx('text-sm font-medium', step.active ? 'text-white/70' : 'text-white/20')}>
                {step.label}
              </span>
              {step.date && (
                <span className="text-xs text-white/30">{step.date}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Interview Rounds ──────────────────────────────────────────────────────────
function InterviewsSection({ jobId }: { jobId: string }) {
  const [rounds, setRounds] = useState<InterviewRound[]>([]);
  const [loadingRounds, setLoadingRounds] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addData, setAddData] = useState({ round_type: 'phone', scheduled_at: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editResult, setEditResult] = useState<string>('pending');
  const [editSaving, setEditSaving] = useState(false);
  const { toast } = useToast();

  const load = useCallback(() => {
    setLoadingRounds(true);
    api.getInterviews(jobId)
      .then((res) => setRounds(res.rounds || []))
      .catch(() => {/* silently hide if endpoint missing */})
      .finally(() => setLoadingRounds(false));
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    setSaving(true);
    try {
      await api.addInterview(jobId, {
        round_type: addData.round_type,
        scheduled_at: addData.scheduled_at || undefined,
        notes: addData.notes || undefined,
      });
      setShowAddForm(false);
      setAddData({ round_type: 'phone', scheduled_at: '', notes: '' });
      load();
      toast('Interview round added', 'success');
    } catch { toast('Failed to add round', 'error'); }
    finally { setSaving(false); }
  };

  const handleEditSave = async (round: InterviewRound) => {
    setEditSaving(true);
    try {
      await api.updateInterview(round.id, { result: editResult });
      load();
      setEditingId(null);
      toast('Round updated', 'success');
    } catch { toast('Failed to update round', 'error'); }
    finally { setEditSaving(false); }
  };

  return (
    <div>
      <p className="text-xs text-white/30 uppercase tracking-wider mb-3">Interviews</p>

      {loadingRounds ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 size={13} className="animate-spin text-white/30" />
          <span className="text-xs text-white/30">Loading rounds...</span>
        </div>
      ) : (
        <div className="space-y-2">
          {rounds.length === 0 && !showAddForm && (
            <p className="text-xs text-white/20 py-1">No interview rounds tracked yet.</p>
          )}

          {rounds.map((round) => (
            <div key={round.id} className="bg-bg-2 border border-border rounded-xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50 bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                    {round.round_type}
                  </span>
                  {round.scheduled_at && (
                    <span className="text-xs text-white/30 flex items-center gap-1">
                      <Calendar size={10} /> {fmtDate(round.scheduled_at)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (editingId === round.id) { setEditingId(null); return; }
                    setEditingId(round.id);
                    setEditResult(round.result);
                  }}
                  className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
                >
                  {editingId === round.id ? 'Cancel' : 'Edit'}
                </button>
              </div>

              {/* Result badge or edit */}
              {editingId === round.id ? (
                <div className="flex items-center gap-2">
                  <select
                    value={editResult}
                    onChange={(e) => setEditResult(e.target.value)}
                    className="flex-1 bg-bg-3 border border-border rounded-lg px-3 py-1.5 text-xs text-white/70 outline-none"
                  >
                    {RESULT_TYPES.map((r) => (
                      <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleEditSave(round)}
                    disabled={editSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green text-xs font-medium transition-all hover:bg-accent-green/20"
                  >
                    {editSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    Save
                  </button>
                </div>
              ) : (
                <span className={clsx('inline-block text-[10px] font-medium px-2 py-0.5 rounded-md border', resultBadgeClass[round.result] || resultBadgeClass.pending)}>
                  {round.result}
                </span>
              )}

              {round.notes && (
                <p className="text-xs text-white/40 leading-relaxed">{round.notes}</p>
              )}
            </div>
          ))}

          {/* Add form */}
          {showAddForm && (
            <div className="bg-bg-2 border border-border rounded-xl px-4 py-3 space-y-3">
              <p className="text-xs text-white/50 font-medium">New Round</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Type</label>
                  <select
                    value={addData.round_type}
                    onChange={(e) => setAddData((p) => ({ ...p, round_type: e.target.value }))}
                    className="w-full bg-bg-3 border border-border rounded-lg px-3 py-1.5 text-xs text-white/70 outline-none"
                  >
                    {ROUND_TYPES.map((r) => (
                      <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Date</label>
                  <input
                    type="date"
                    value={addData.scheduled_at}
                    onChange={(e) => setAddData((p) => ({ ...p, scheduled_at: e.target.value }))}
                    className="w-full bg-bg-3 border border-border rounded-lg px-3 py-1.5 text-xs text-white/70 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={addData.notes}
                  onChange={(e) => setAddData((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Optional notes..."
                  className="w-full bg-bg-3 border border-border rounded-lg px-3 py-2 text-xs text-white/70 placeholder-white/20 outline-none resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAdd}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green text-xs font-medium hover:bg-accent-green/20 transition-all"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  Save
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setAddData({ round_type: 'phone', scheduled_at: '', notes: '' }); }}
                  className="px-4 py-1.5 rounded-lg border border-border text-white/30 text-xs hover:text-white/60 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-white/10 text-white/30 text-xs hover:text-white/60 hover:border-white/20 transition-all w-full"
            >
              <Plus size={12} /> Add Round
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── CV Preview ────────────────────────────────────────────────────────────────
function CVSection({ jobId }: { jobId: string }) {
  const [cvContent, setCvContent] = useState<string | null>(null);
  const [loadingCv, setLoadingCv] = useState(true);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setLoadingCv(true);
    api.cvContent(jobId)
      .then((res) => setCvContent(res.content))
      .catch(() => {/* silently hide */})
      .finally(() => setLoadingCv(false));
  }, [jobId]);

  if (loadingCv) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 size={13} className="animate-spin text-white/30" />
        <span className="text-xs text-white/30">Loading CV...</span>
      </div>
    );
  }

  if (!cvContent) {
    return (
      <div className="bg-bg-2 border border-border rounded-xl px-4 py-6 text-center">
        <FileText size={20} className="text-white/15 mx-auto mb-2" />
        <p className="text-xs text-white/25">No CV generated yet. Click &ldquo;Apply&rdquo; to generate one.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-white/30 uppercase tracking-wider">Generated CV</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => api.downloadCV(jobId)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-white/10 text-white/40 text-xs hover:text-white/70 hover:border-white/20 transition-all"
            title="Download CV"
          >
            <Download size={12} /> Download
          </button>
          <button
            onClick={() => setExpanded((p) => !p)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-white/10 text-white/40 text-xs hover:text-white/70 hover:border-white/20 transition-all"
          >
            <ChevronRight size={12} className={clsx('transition-transform', expanded && 'rotate-90')} />
            {expanded ? 'Collapse' : 'Preview'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="bg-bg-2 border border-border rounded-xl px-4 py-3 max-h-64 overflow-y-auto space-y-0.5">
          {renderMarkdown(cvContent)}
        </div>
      )}
    </div>
  );
}

// ── Copy dropdown ─────────────────────────────────────────────────────────────
function CopyButton({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<'url' | 'md' | null>(null);

  const copy = (type: 'url' | 'md') => {
    const text = type === 'url'
      ? job.url
      : `[${job.title} at ${job.company}](${job.url})`;
    navigator.clipboard.writeText(text);
    setCopied(type);
    setOpen(false);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className={clsx(
          'flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-bg-2 text-sm font-medium transition-all',
          copied ? 'text-accent-green' : 'text-white/40 hover:text-white/70'
        )}
        title="Copy"
      >
        {copied ? <Check size={14} className="text-accent-green" /> : <Copy size={14} />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 mb-1 bg-bg-3 border border-border rounded-xl overflow-hidden shadow-xl z-20 min-w-[160px]">
            <button
              onClick={() => copy('url')}
              className="w-full text-left px-4 py-2.5 text-xs text-white/60 hover:bg-white/5 transition-all flex items-center gap-2"
            >
              <Copy size={11} /> Copy URL
            </button>
            <button
              onClick={() => copy('md')}
              className="w-full text-left px-4 py-2.5 text-xs text-white/60 hover:bg-white/5 transition-all flex items-center gap-2"
            >
              <FileText size={11} /> Copy as Markdown
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function JobDrawer({ jobId, onClose, onStatusChange, onStarChange }: JobDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [starred, setStarred] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<Job['status']>('found');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [applying, setApplying] = useState(false);
  const [emailApplying, setEmailApplying] = useState(false);
  const [isBlacklisted, setIsBlacklisted] = useState(false);
  const [blacklisting, setBlacklisting] = useState(false);
  const [tab, setTab] = useState<DrawerTab>('overview');
  const { toast } = useToast();

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    setJob(null);
    setIsBlacklisted(false);
    setTab('overview');
    api.job(jobId).then((j) => {
      setJob(j);
      setStarred(Boolean(j.starred));
      setCurrentStatus(j.status);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
      toast('Failed to load job details', 'error');
    });
  }, [jobId]);

  useEffect(() => {
    if (!drawerRef.current || !overlayRef.current) return;
    if (jobId) {
      gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.fromTo(drawerRef.current, { x: '100%' }, { x: '0%', duration: 0.3, ease: 'power3.out' });
    }
  }, [jobId]);

  const handleClose = () => {
    if (!drawerRef.current || !overlayRef.current) { onClose(); return; }
    gsap.to(drawerRef.current, { x: '100%', duration: 0.25, ease: 'power3.in' });
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.25, onComplete: onClose });
  };

  const handleStar = async () => {
    if (!job) return;
    try {
      const res = await api.starJob(job.id);
      setStarred(res.starred);
      onStarChange?.(job.id, res.starred);
    } catch { toast('Failed to star job', 'error'); }
  };

  const handleStatusChange = async (status: Job['status']) => {
    if (!job) return;
    setShowStatusMenu(false);
    try {
      await api.update(job.id, status);
      setCurrentStatus(status);
      onStatusChange?.(job.id, status);
      toast(`Status → "${statusConfig[status].label}"`, 'success');
    } catch { toast('Failed to update status', 'error'); }
  };

  const handleApply = async () => {
    if (!job) return;
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

  const handleEmailApply = async () => {
    if (!job || emailApplying) return;
    setEmailApplying(true);
    try {
      const res = await api.emailApply(job.id);
      if ('error' in res) {
        if (res.error.includes('No email address found')) {
          const manual = window.prompt('No email found in this listing — enter one to send to:');
          if (manual) {
            const retry = await api.emailApply(job.id, manual);
            if ('error' in retry) throw new Error(retry.error);
            setCurrentStatus('applied');
            onStatusChange?.(job.id, 'applied');
            toast(`Emailed application to ${retry.sent_to}`, 'success');
          }
          return;
        }
        throw new Error(res.error);
      }
      setCurrentStatus('applied');
      onStatusChange?.(job.id, 'applied');
      toast(`Emailed application to ${res.sent_to}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to send email application', 'error');
    } finally {
      setEmailApplying(false);
    }
  };

  const handleBlacklist = async () => {
    if (!job || blacklisting) return;
    setBlacklisting(true);
    try {
      const res = await api.blacklistCompany(job.id);
      setIsBlacklisted(res.blacklisted);
      toast(res.blacklisted ? `${res.company} blocked` : `${res.company} unblocked`, 'success');
    } catch { toast('Failed to update blacklist', 'error'); }
    finally { setBlacklisting(false); }
  };

  if (!jobId) return null;

  const s = job ? statusConfig[currentStatus] : null;
  const sourceCls = job ? (sourceColors[job.source] || 'text-white/40 bg-white/5 border-white/10') : '';

  const tabs: { key: DrawerTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'track', label: 'Track' },
    { key: 'cv', label: 'CV' },
  ];

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        onClick={handleClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className="fixed top-0 right-0 h-full w-full max-w-[500px] z-50 bg-bg-1 border-l border-border flex flex-col shadow-2xl"
        style={{ transform: 'translateX(100%)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            {job && (
              <span className={clsx('text-[10px] font-medium px-2 py-0.5 rounded-md border', sourceCls)}>
                {job.source}
              </span>
            )}
            {s && (
              <span className={clsx('text-[11px] font-medium', s.color)}>
                {s.label}
              </span>
            )}
            {/* Blacklist button */}
            {job && (
              <button
                onClick={handleBlacklist}
                disabled={blacklisting}
                title={isBlacklisted ? 'Company blocked — won\'t appear in future scrapes' : 'Block company'}
                className={clsx(
                  'flex items-center p-1.5 rounded-lg border transition-all',
                  isBlacklisted
                    ? 'text-red-400 bg-red-400/10 border-red-400/30 hover:bg-red-400/20'
                    : 'text-white/30 bg-transparent border-white/10 hover:text-white/60 hover:border-white/20'
                )}
              >
                {blacklisting ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
              </button>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab bar */}
        {job && (
          <div className="flex items-center gap-1 px-6 py-2 border-b border-border flex-shrink-0">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={clsx(
                  'px-4 py-1.5 rounded-full text-xs font-medium transition-all',
                  tab === t.key
                    ? 'bg-accent-green/15 text-accent-green border border-accent-green/30'
                    : 'text-white/40 hover:text-white/60 border border-transparent hover:border-white/10'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-accent-green" />
            </div>
          )}

          {!loading && job && (
            <>
              {/* Job title + score — always visible regardless of tab */}
              <div className="flex items-start gap-4">
                <ScoreRing score={job.score} size={56} />
                <div className="flex-1 min-w-0">
                  <h2 className="font-sans font-bold text-white/95 text-lg leading-tight">
                    {job.title}
                  </h2>
                  <p className="text-white/50 text-sm mt-1">{job.company}</p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {job.location && (
                      <span className="flex items-center gap-1 text-xs text-white/35">
                        <MapPin size={11} /> {job.location}
                      </span>
                    )}
                    {job.salary && (
                      <span className="flex items-center gap-1 text-xs text-white/35">
                        <DollarSign size={11} /> {job.salary}
                      </span>
                    )}
                    {job.date_found && (
                      <span className="flex items-center gap-1 text-xs text-white/25">
                        <Calendar size={11} /> {job.date_found.slice(0, 10)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── OVERVIEW tab ── */}
              {tab === 'overview' && (
                <>
                  {job.score_reason && (
                    <div className="bg-bg-2 border border-border rounded-xl px-4 py-3">
                      <p className="text-xs text-white/30 uppercase tracking-wider mb-1">AI Match Reason</p>
                      <p className="text-sm text-white/60 italic leading-relaxed">{job.score_reason}</p>
                    </div>
                  )}

                  {job.description && (
                    <div>
                      <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Job Description</p>
                      <div className="bg-bg-2 border border-border rounded-xl px-4 py-3 max-h-64 overflow-y-auto">
                        <p className="text-sm text-white/60 leading-relaxed whitespace-pre-line">
                          {job.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
                        </p>
                      </div>
                    </div>
                  )}

                  {job.notes && (
                    <div className="bg-accent-cyan/5 border border-accent-cyan/15 rounded-xl px-4 py-3">
                      <p className="text-xs text-accent-cyan/60 uppercase tracking-wider mb-1">Your Notes</p>
                      <p className="text-sm text-white/60 leading-relaxed">{job.notes}</p>
                    </div>
                  )}
                </>
              )}

              {/* ── TRACK tab ── */}
              {tab === 'track' && (
                <>
                  {(job.date_found || job.date_applied) && (
                    <ApplicationTimeline job={job} status={currentStatus} />
                  )}
                  <div className={clsx((job.date_found || job.date_applied) && 'pt-2')}>
                    <InterviewsSection jobId={job.id} />
                  </div>
                </>
              )}

              {/* ── CV tab ── */}
              {tab === 'cv' && (
                <CVSection jobId={job.id} />
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {job && (
          <div className="px-6 py-4 border-t border-border flex-shrink-0 space-y-3">
            {/* Status dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className={clsx(
                  'w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm font-medium transition-all',
                  'bg-bg-2 border-border text-white/60 hover:border-white/20'
                )}
              >
                <span className={s?.color}>{s?.label}</span>
                <ChevronDown size={14} />
              </button>
              {showStatusMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-bg-3 border border-border rounded-xl overflow-hidden shadow-xl z-10">
                  {allStatuses.map((st) => {
                    const sc = statusConfig[st];
                    return (
                      <button
                        key={st}
                        onClick={() => handleStatusChange(st)}
                        className={clsx(
                          'w-full text-left px-4 py-2.5 text-sm font-medium transition-all hover:bg-white/5',
                          sc.color,
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

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {/* Star */}
              <button
                onClick={handleStar}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all flex-1',
                  starred
                    ? 'bg-accent-yellow/10 border-accent-yellow/30 text-accent-yellow'
                    : 'bg-bg-2 border-border text-white/40 hover:text-accent-yellow hover:border-accent-yellow/20'
                )}
              >
                <Star size={14} fill={starred ? 'currentColor' : 'none'} />
                {starred ? 'Starred' : 'Star'}
              </button>

              {/* Copy URL (with dropdown for markdown) */}
              <CopyButton job={job} />

              {/* Open link */}
              {job.url && (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-bg-2 text-sm font-medium text-white/40 hover:text-white/70 transition-all"
                  title="Open job posting"
                >
                  <ExternalLink size={14} />
                </a>
              )}

              {/* Apply */}
              {currentStatus === 'found' && (
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all flex-1',
                    applying
                      ? 'border-white/10 text-white/30 cursor-not-allowed'
                      : 'border-accent-green/40 text-accent-green hover:bg-accent-green/10'
                  )}
                >
                  {applying ? <Loader2 size={13} className="animate-spin" /> : null}
                  {applying ? 'Generating...' : 'Apply →'}
                </button>
              )}

              {/* Email apply — sends the tailored CV/cover letter as PDF attachments directly */}
              {currentStatus === 'found' && (
                <button
                  onClick={handleEmailApply}
                  disabled={emailApplying}
                  title="Email the tailored CV + cover letter directly (auto-detects an email in the listing, or prompts for one)"
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all',
                    emailApplying
                      ? 'border-white/10 text-white/30 cursor-not-allowed'
                      : 'border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/10'
                  )}
                >
                  {emailApplying ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                </button>
              )}
            </div>
          </div>
        )}

        {showStatusMenu && (
          <div className="fixed inset-0 z-0" onClick={() => setShowStatusMenu(false)} />
        )}
      </div>
    </>
  );
}
