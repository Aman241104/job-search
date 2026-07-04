'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { MagnifyingGlass, Sliders, CaretLeft, CaretRight, X, ListBullets, Columns, CheckSquare, Star, Trash, CaretDown, ArrowUp, Keyboard } from '@phosphor-icons/react';
import JobCard from '@/components/JobCard';
import JobDrawer from '@/components/JobDrawer';
import EmptyState from '@/components/EmptyState';
import ScoreRing from '@/components/ScoreRing';
import { ToastProvider, useToast } from '@/components/Toast';
import { api, Job, JobsResponse } from '@/lib/api';
import clsx from 'clsx';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'found', label: 'Found' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'ghosted', label: 'Ghosted' },
];

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'Internshala', label: 'Internshala' },
  { value: 'Jobicy', label: 'Jobicy' },
  { value: 'WeWorkRemotely', label: 'WeWorkRemotely' },
  { value: 'Arbeitnow', label: 'Arbeitnow' },
  { value: 'LinkedIn', label: 'LinkedIn' },
  { value: 'Remotive', label: 'Remotive' },
  { value: 'RemoteOK', label: 'RemoteOK' },
  { value: 'Remote.co', label: 'Remote.co' },
];

const SORT_OPTIONS = [
  { value: 'score', label: 'Score' },
  { value: 'date', label: 'Date' },
  { value: 'company', label: 'Company' },
];

const KANBAN_COLUMNS: {
  status: Job['status'];
  label: string;
  headerColor: string;
  badgeColor: string;
}[] = [
  { status: 'found', label: 'Found', headerColor: 'text-white/50', badgeColor: 'bg-white/10' },
  { status: 'applied', label: 'Applied', headerColor: 'text-accent-cyan', badgeColor: 'bg-accent-cyan/15' },
  { status: 'interviewing', label: 'Interviewing', headerColor: 'text-accent-yellow', badgeColor: 'bg-accent-yellow/15' },
  { status: 'offer', label: 'Offer', headerColor: 'text-accent-green', badgeColor: 'bg-accent-green/15' },
  { status: 'rejected', label: 'Rejected', headerColor: 'text-accent-pink', badgeColor: 'bg-accent-pink/15' },
  { status: 'ghosted', label: 'Ghosted', headerColor: 'text-white/30', badgeColor: 'bg-white/5' },
];

const statusConfig: Record<Job['status'], { label: string; bg: string; text: string; border: string }> = {
  found: { label: 'Found', bg: 'bg-white/5', text: 'text-white/50', border: 'border-white/10' },
  applied: { label: 'Applied', bg: 'bg-accent-cyan/10', text: 'text-accent-cyan', border: 'border-accent-cyan/20' },
  interviewing: { label: 'Interviewing', bg: 'bg-accent-yellow/10', text: 'text-accent-yellow', border: 'border-accent-yellow/20' },
  offer: { label: 'Offer', bg: 'bg-accent-green/10', text: 'text-accent-green', border: 'border-accent-green/20' },
  rejected: { label: 'Rejected', bg: 'bg-accent-pink/10', text: 'text-accent-pink', border: 'border-accent-pink/20' },
  ghosted: { label: 'Ghosted', bg: 'bg-white/5', text: 'text-white/30', border: 'border-white/10' },
};

const allStatuses: Job['status'][] = ['found', 'applied', 'interviewing', 'offer', 'rejected', 'ghosted'];

// Muted -700 shades (not the default -400s, which are tuned to pop on a
// black background) so each source stays individually recognizable at a
// glance without reintroducing a wall of saturated color.
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

// ─── Keyboard Shortcuts Modal ─────────────────────────────────────────────────

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { key: 'j', desc: 'Move to next card' },
    { key: 'k', desc: 'Move to previous card' },
    { key: 'Enter', desc: 'Open drawer for focused card' },
    { key: 's', desc: 'Star / unstar focused card' },
    { key: 'Esc', desc: 'Close drawer / deselect' },
    { key: '?', desc: 'Show this help modal' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-bg-2 border border-border rounded-2xl p-6 w-80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-white/70 font-semibold text-sm">
            <Keyboard size={14} />
            Keyboard Shortcuts
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X size={14} />
          </button>
        </div>
        <div className="space-y-2">
          {shortcuts.map(({ key, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-white/40 text-xs">{desc}</span>
              <kbd className="bg-bg-3 border border-border rounded-md px-2 py-0.5 text-[11px] font-mono text-accent-green">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Kanban Card ─────────────────────────────────────────────────────────────

interface KanbanCardProps {
  job: Job;
  onStatusChange: (id: string, status: Job['status']) => void;
  onStarChange: (id: string, starred: boolean) => void;
  onView: (id: string) => void;
  isSelected: boolean;
  selectMode: boolean;
  onSelect: (id: string) => void;
}

function KanbanCard({ job, onStatusChange, onStarChange, onView, isSelected, selectMode, onSelect }: KanbanCardProps) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [starred, setStarred] = useState(Boolean(job.starred));
  const [currentStatus, setCurrentStatus] = useState<Job['status']>(job.status);
  const { toast } = useToast();

  const handleStar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await api.starJob(job.id);
      setStarred(res.starred);
      onStarChange(job.id, res.starred);
    } catch {
      toast('Failed to star job', 'error');
    }
  };

  const handleStatusChange = async (status: Job['status']) => {
    setShowStatusMenu(false);
    try {
      await api.update(job.id, status);
      setCurrentStatus(status);
      onStatusChange(job.id, status);
      toast(`Status → "${statusConfig[status].label}"`, 'success');
    } catch {
      toast('Failed to update status', 'error');
    }
  };

  const handleClick = () => {
    if (selectMode) {
      onSelect(job.id);
    } else {
      onView(job.id);
    }
  };

  const s = statusConfig[currentStatus];
  const sourceCls = sourceColors[job.source] || 'text-white/40 bg-white/5 border-white/10';

  return (
    <div
      className={clsx(
        'relative bg-bg-2 border rounded-xl p-3 cursor-pointer transition-all duration-150 hover:border-white/15',
        isSelected ? 'border-accent-green/50 bg-accent-green/5' : 'border-border'
      )}
      onClick={handleClick}
    >
      {/* Selection checkbox overlay */}
      {selectMode && (
        <div className={clsx(
          'absolute top-2 left-2 w-4 h-4 rounded border flex items-center justify-center transition-all z-10',
          isSelected
            ? 'bg-accent-green border-accent-green'
            : 'bg-bg-3 border-white/20'
        )}>
          {isSelected && <X size={9} className="text-bg" />}
        </div>
      )}

      <div className="flex items-start gap-2 mb-2">
        <ScoreRing score={job.score} size={36} />
        <div className="flex-1 min-w-0">
          <h4 className="text-white/85 text-xs font-semibold leading-tight line-clamp-2 mb-0.5">{job.title}</h4>
          <p className="text-white/35 text-[10px] truncate">{job.company}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className={clsx('text-[9px] font-medium px-1.5 py-0.5 rounded border', sourceCls)}>
          {job.source}
        </span>

        <div className="flex items-center gap-1">
          {/* Star */}
          <button
            onClick={handleStar}
            className={clsx(
              'p-0.5 rounded transition-all duration-150',
              starred ? 'text-accent-yellow' : 'text-white/20 hover:text-white/50'
            )}
          >
            <Star size={11} fill={starred ? 'currentColor' : 'none'} />
          </button>

          {/* Status dropdown */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowStatusMenu(!showStatusMenu); }}
              className={clsx(
                'flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded border transition-all hover:opacity-80',
                s.bg, s.text, s.border
              )}
            >
              {s.label}
              <CaretDown size={8} />
            </button>

            {showStatusMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => { e.stopPropagation(); setShowStatusMenu(false); }}
                />
                <div className="absolute bottom-full right-0 mb-1 bg-bg-3 border border-border rounded-xl overflow-hidden shadow-xl z-20 min-w-[130px]">
                  {allStatuses.map((st) => {
                    const sc = statusConfig[st];
                    return (
                      <button
                        key={st}
                        onClick={(e) => { e.stopPropagation(); handleStatusChange(st); }}
                        className={clsx(
                          'w-full text-left px-3 py-1.5 text-[10px] font-medium transition-all hover:bg-white/5',
                          sc.text,
                          currentStatus === st && 'bg-white/5'
                        )}
                      >
                        {sc.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────

interface BulkBarProps {
  selectedIds: Set<string>;
  onDeselect: () => void;
  onAction: (action: string, value?: string) => void;
}

function BulkBar({ selectedIds, onDeselect, onAction }: BulkBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [showStatusDrop, setShowStatusDrop] = useState(false);

  useEffect(() => {
    if (!barRef.current) return;
    gsap.fromTo(
      barRef.current,
      { y: 80, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.35, ease: 'power3.out' }
    );
  }, []);

  return (
    <div
      ref={barRef}
      className="fixed bottom-0 left-0 right-0 z-50 bg-bg-3/95 backdrop-blur border-t border-border px-6 py-3"
    >
      <div className="flex items-center gap-3 flex-wrap max-w-7xl mx-auto">
        <span className="text-sm font-semibold text-white/70 mr-1">
          {selectedIds.size} selected
        </span>

        {/* Star */}
        <button
          onClick={() => onAction('star', 'true')}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent-yellow/10 border border-accent-yellow/20 text-accent-yellow hover:bg-accent-yellow/20 transition-all"
        >
          <Star size={11} fill="currentColor" />
          Star
        </button>

        {/* Mark as dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowStatusDrop(!showStatusDrop)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-bg-2 border border-border text-white/60 hover:text-white/80 transition-all"
          >
            Mark as
            <CaretDown size={11} />
          </button>
          {showStatusDrop && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowStatusDrop(false)} />
              <div className="absolute bottom-full left-0 mb-1 bg-bg-3 border border-border rounded-xl overflow-hidden shadow-xl z-20 min-w-[140px]">
                {allStatuses.map((st) => {
                  const sc = statusConfig[st];
                  return (
                    <button
                      key={st}
                      onClick={() => { setShowStatusDrop(false); onAction('status', st); }}
                      className={clsx('w-full text-left px-3 py-2 text-xs font-medium transition-all hover:bg-white/5', sc.text)}
                    >
                      {sc.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Delete */}
        <button
          onClick={() => onAction('delete')}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent-pink/10 border border-accent-pink/20 text-accent-pink hover:bg-accent-pink/20 transition-all"
        >
          <Trash size={11} />
          Delete
        </button>

        <div className="flex-1" />

        {/* Deselect all */}
        <button
          onClick={onDeselect}
          className="text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          Deselect all
        </button>
      </div>
    </div>
  );
}

// ─── Main Page (inner, needs toast context) ───────────────────────────────────

function JobsPageInner() {
  const { toast } = useToast();

  // ── Filter state ──
  const [data, setData] = useState<JobsResponse | null>(null);
  const [kanbanData, setKanbanData] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort] = useState('score');
  const [minLpa, setMinLpa] = useState(0);
  const [daysAgo, setDaysAgo] = useState(0);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [drawerJobId, setDrawerJobId] = useState<string | null>(null);

  // ── View mode ──
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  // ── Bulk selection ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Starred filter ──
  const [starredOnly, setStarredOnly] = useState(false);

  // ── Keyboard navigation ──
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // ── Back to top ──
  const [showBackToTop, setShowBackToTop] = useState(false);
  const backToTopRef = useRef<HTMLButtonElement>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<NodeJS.Timeout>();

  const filtersRef = useRef({ search, status, source, minScore, sort, minLpa, daysAgo, starredOnly });
  filtersRef.current = { search, status, source, minScore, sort, minLpa, daysAgo, starredOnly };

  // ─── Fetch jobs ───────────────────────────────────────────────────────────

  const fetchJobs = useCallback(async (p: number, kanban = false) => {
    setLoading(true);
    setError(null);
    try {
      const f = filtersRef.current;
      const params: Record<string, string | number | boolean> = {
        per_page: kanban ? 500 : 24,
        page: kanban ? 1 : p,
        sort: f.sort || 'score',
      };
      if (f.search) params.search = f.search;
      if (f.status) params.status = f.status;
      if (f.source) params.source = f.source;
      if (f.minScore > 0) params.min_score = f.minScore;
      if (f.minLpa > 0) params.min_lpa = f.minLpa;
      if (f.daysAgo > 0) params.days_ago = f.daysAgo;
      if (f.starredOnly) params.starred = true;
      const res = await api.jobs(params);
      if (kanban) {
        setKanbanData(res.jobs);
      } else {
        setData(res);
      }
    } catch {
      setError('Failed to load jobs. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce filter changes — reset to page 1
  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      setFocusedIndex(-1);
      if (viewMode === 'kanban') {
        fetchJobs(1, true);
      } else {
        fetchJobs(1, false);
      }
    }, 300);
    return () => clearTimeout(searchTimeout.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, source, minScore, sort, minLpa, daysAgo, starredOnly, viewMode]);

  // Fetch on page change (list mode only)
  useEffect(() => {
    if (viewMode === 'list') {
      fetchJobs(page, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Auto-open drawer from ?open=<id> query param (set by GlobalSearch)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openId = params.get('open');
    if (openId) {
      setDrawerJobId(openId);
      const url = new URL(window.location.href);
      url.searchParams.delete('open');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // Animate grid on data change
  useEffect(() => {
    if (!gridRef.current || loading) return;
    const cards = gridRef.current.querySelectorAll('.job-card-item');
    gsap.fromTo(
      cards,
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.04, duration: 0.5, ease: 'power3.out' }
    );
  }, [data, loading]);

  // ─── Scroll → back to top ────────────────────────────────────────────────

  useEffect(() => {
    const handleScroll = () => {
      const shouldShow = window.scrollY > 400;
      if (shouldShow !== showBackToTop) {
        setShowBackToTop(shouldShow);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [showBackToTop]);

  useEffect(() => {
    if (!backToTopRef.current) return;
    if (showBackToTop) {
      gsap.fromTo(
        backToTopRef.current,
        { opacity: 0, scale: 0.8 },
        { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(1.5)' }
      );
    } else {
      gsap.fromTo(
        backToTopRef.current,
        { opacity: 1, scale: 1 },
        { opacity: 0, scale: 0.8, duration: 0.2, ease: 'power2.in' }
      );
    }
  }, [showBackToTop]);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────

  const currentJobs = viewMode === 'kanban' ? kanbanData : (data?.jobs ?? []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (showShortcuts && e.key === 'Escape') {
        setShowShortcuts(false);
        return;
      }
      if (drawerJobId && e.key === 'Escape') {
        setDrawerJobId(null);
        return;
      }
      if (e.key === 'Escape') {
        setFocusedIndex(-1);
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }
      if (e.key === 'j') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, currentJobs.length - 1));
        return;
      }
      if (e.key === 'k') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && focusedIndex >= 0) {
        e.preventDefault();
        const job = currentJobs[focusedIndex];
        if (job) setDrawerJobId(job.id);
        return;
      }
      if (e.key === 's' && focusedIndex >= 0) {
        e.preventDefault();
        const job = currentJobs[focusedIndex];
        if (!job) return;
        api.starJob(job.id).then((res) => {
          handleStarChange(job.id, res.starred);
        }).catch(() => toast('Failed to star job', 'error'));
        return;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIndex, drawerJobId, showShortcuts, currentJobs]);

  // Scroll focused card into view
  useEffect(() => {
    if (focusedIndex < 0 || !gridRef.current) return;
    const cards = gridRef.current.querySelectorAll('.job-card-item');
    const el = cards[focusedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedIndex]);

  // ─── Status / star change handlers ──────────────────────────────────────

  const handleStatusChange = (id: string, newStatus: Job['status']) => {
    // List view
    setData((prev) =>
      prev ? { ...prev, jobs: prev.jobs.map((j) => (j.id === id ? { ...j, status: newStatus } : j)) } : prev
    );
    // Kanban view (optimistic — card moves to new column automatically via filter)
    setKanbanData((prev) => prev.map((j) => (j.id === id ? { ...j, status: newStatus } : j)));
  };

  const handleStarChange = (id: string, starred: boolean) => {
    setData((prev) =>
      prev ? { ...prev, jobs: prev.jobs.map((j) => (j.id === id ? { ...j, starred } : j)) } : prev
    );
    setKanbanData((prev) => prev.map((j) => (j.id === id ? { ...j, starred } : j)));
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setSource('');
    setMinScore(0);
    setSort('score');
    setMinLpa(0);
    setDaysAgo(0);
    setStarredOnly(false);
    setPage(1);
  };

  // ─── Bulk actions ────────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCardClick = (id: string) => {
    if (selectMode) {
      toggleSelect(id);
    } else {
      setDrawerJobId(id);
    }
  };

  const handleBulkAction = async (action: string, value?: string) => {
    const ids = Array.from(selectedIds);
    if (action === 'delete') {
      if (!window.confirm(`Delete ${ids.length} job(s)? This cannot be undone.`)) return;
    }
    try {
      await api.bulkAction(action, ids, value);
      toast(
        action === 'delete'
          ? `Deleted ${ids.length} job(s)`
          : action === 'star'
          ? `Starred ${ids.length} job(s)`
          : `Marked ${ids.length} job(s) as ${value}`,
        'success'
      );
      setSelectedIds(new Set());
      // Refresh
      if (viewMode === 'kanban') {
        fetchJobs(1, true);
      } else {
        fetchJobs(page, false);
      }
    } catch {
      toast('Bulk action failed', 'error');
    }
  };

  const activeFilterCount = [
    search,
    status,
    source,
    minScore > 0 ? 1 : 0,
    minLpa > 0 ? 1 : 0,
    daysAgo > 0 ? 1 : 0,
    sort !== 'score' ? 1 : 0,
    starredOnly ? 1 : 0,
  ].filter(Boolean).length;

  const highMatchCount = (viewMode === 'kanban' ? kanbanData : (data?.jobs ?? [])).filter((j) => j.score >= 70).length;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      <JobDrawer
        jobId={drawerJobId}
        onClose={() => setDrawerJobId(null)}
        onStatusChange={handleStatusChange}
        onStarChange={handleStarChange}
      />

      <div className={clsx('min-h-screen', selectedIds.size > 0 ? 'pb-24' : 'pb-8')}>
        {/* Filter bar */}
        <div className="sticky top-0 z-30 bg-bg/90 backdrop-blur-lg border-b border-border px-6 md:px-8 py-4">
          <div className="flex items-center gap-3 mb-3">
            {/* Search */}
            <div className="flex-1 relative">
              <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search jobs, companies..."
                className="w-full bg-bg-2 border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-white/80 placeholder:text-white/25"
              />
            </div>

            {/* View toggle */}
            <div className="flex items-center bg-bg-2 border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                title="List view"
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2.5 text-sm transition-all duration-150',
                  viewMode === 'list'
                    ? 'bg-accent-green/10 text-accent-green'
                    : 'text-white/35 hover:text-white/60'
                )}
              >
                <ListBullets size={14} />
                <span className="hidden sm:inline text-xs">List</span>
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                title="Kanban view"
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2.5 text-sm transition-all duration-150',
                  viewMode === 'kanban'
                    ? 'bg-accent-green/10 text-accent-green'
                    : 'text-white/35 hover:text-white/60'
                )}
              >
                <Columns size={14} />
                <span className="hidden sm:inline text-xs">Kanban</span>
              </button>
            </div>

            {/* Select toggle */}
            <button
              onClick={() => {
                setSelectMode(!selectMode);
                if (selectMode) setSelectedIds(new Set());
              }}
              title="Toggle selection mode"
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm transition-all duration-150',
                selectMode
                  ? 'bg-accent-purple/10 border-accent-purple/30 text-accent-purple'
                  : 'bg-bg-2 border-border text-white/35 hover:text-white/60'
              )}
            >
              <CheckSquare size={14} />
              <span className="hidden sm:inline text-xs">Select</span>
            </button>

            {/* Filters button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={clsx(
                'relative flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm transition-all duration-150',
                showFilters || activeFilterCount > 0
                  ? 'bg-accent-green/10 border-accent-green/30 text-accent-green'
                  : 'bg-bg-2 border-border text-white/50 hover:text-white/70'
              )}
            >
              <Sliders size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-accent-green text-bg text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2.5 rounded-xl text-sm text-white/30 hover:text-white/60 transition-all"
                title="Clear all filters"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-3 pt-1">
              {/* Status */}
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm text-white/70"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-bg-2">{o.label}</option>
                ))}
              </select>

              {/* Source */}
              <select
                value={source}
                onChange={(e) => { setSource(e.target.value); setPage(1); }}
                className="bg-bg-2 border border-border rounded-xl px-3 py-2 text-sm text-white/70"
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-bg-2">{o.label}</option>
                ))}
              </select>

              {/* Min score */}
              <div className="flex items-center gap-2 bg-bg-2 border border-border rounded-xl px-3 py-2">
                <span className="text-xs text-white/40">Min score:</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={minScore}
                  onChange={(e) => { setMinScore(Number(e.target.value)); setPage(1); }}
                  className="w-20 accent-accent-green"
                />
                <span className="text-xs font-mono text-accent-green w-6">{minScore}</span>
              </div>

              {/* Sort */}
              <div className="flex items-center gap-1 bg-bg-2 border border-border rounded-xl px-3 py-2">
                <span className="text-xs text-white/40 mr-1">Sort:</span>
                {SORT_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setSort(o.value)}
                    className={clsx(
                      'text-xs px-2 py-1 rounded-lg transition-all',
                      sort === o.value
                        ? 'bg-accent-green/15 text-accent-green font-medium'
                        : 'text-white/40 hover:text-white/60'
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {/* Min LPA */}
              <div className="flex items-center gap-2 bg-bg-2 border border-border rounded-xl px-3 py-2">
                <span className="text-xs text-white/40">Min LPA:</span>
                <select
                  value={minLpa}
                  onChange={(e) => { setMinLpa(Number(e.target.value)); setPage(1); }}
                  className="bg-transparent text-xs text-white/70 outline-none"
                >
                  <option value={0} className="bg-bg-2">Any</option>
                  <option value={4} className="bg-bg-2">4+ LPA</option>
                  <option value={6} className="bg-bg-2">6+ LPA</option>
                  <option value={8} className="bg-bg-2">8+ LPA</option>
                  <option value={10} className="bg-bg-2">10+ LPA</option>
                  <option value={12} className="bg-bg-2">12+ LPA</option>
                </select>
              </div>

              {/* Days ago */}
              <div className="flex items-center gap-2 bg-bg-2 border border-border rounded-xl px-3 py-2">
                <span className="text-xs text-white/40">Posted:</span>
                <select
                  value={daysAgo}
                  onChange={(e) => { setDaysAgo(Number(e.target.value)); setPage(1); }}
                  className="bg-transparent text-xs text-white/70 outline-none"
                >
                  <option value={0} className="bg-bg-2">Any time</option>
                  <option value={3} className="bg-bg-2">Last 3 days</option>
                  <option value={7} className="bg-bg-2">Last 7 days</option>
                  <option value={14} className="bg-bg-2">Last 14 days</option>
                  <option value={30} className="bg-bg-2">Last 30 days</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className={clsx('py-6', viewMode === 'kanban' ? 'px-4' : 'px-6 md:px-8')}>
          {/* Count bar */}
          <div className="flex items-center justify-between mb-5 px-2">
            {loading ? (
              <div className="skeleton h-5 w-48 rounded" />
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm text-white/40">
                  <span className="text-white/70 font-medium">
                    {viewMode === 'kanban' ? kanbanData.length : (data?.total ?? 0)}
                  </span>{' '}
                  jobs
                </p>

                {highMatchCount > 0 && (
                  <>
                    <span className="text-white/20">·</span>
                    <button
                      onClick={() => { setMinScore(70); setPage(1); }}
                      className="text-sm text-accent-green font-medium hover:text-accent-green/80 transition-colors underline underline-offset-2 decoration-accent-green/30"
                      title="Filter to high matches (score ≥ 70)"
                    >
                      {highMatchCount} high matches
                    </button>
                  </>
                )}

                {/* Starred quick filter pill */}
                <button
                  onClick={() => setStarredOnly(!starredOnly)}
                  className={clsx(
                    'flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all duration-150',
                    starredOnly
                      ? 'bg-accent-yellow/15 border-accent-yellow/40 text-accent-yellow'
                      : 'bg-white/5 border-white/10 text-white/35 hover:text-white/60'
                  )}
                >
                  <Star size={10} fill={starredOnly ? 'currentColor' : 'none'} />
                  Starred
                </button>

                {error && <span className="text-accent-pink text-sm">· {error}</span>}
              </div>
            )}

            {viewMode === 'list' && data && data.total_pages > 1 && (
              <p className="text-xs text-white/30 font-mono">
                Page {data.page}/{data.total_pages}
              </p>
            )}
          </div>

          {/* Error state */}
          {error && !loading && (
            <div className="bg-accent-pink/10 border border-accent-pink/20 rounded-xl px-5 py-4 text-sm text-accent-pink mb-6">
              {error}
            </div>
          )}

          {/* ── LIST VIEW ── */}
          {viewMode === 'list' && (
            <>
              {/* Loading skeleton */}
              {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className="bg-bg-2 border border-border rounded-2xl p-4">
                      <div className="flex items-start gap-3">
                        <div className="skeleton w-12 h-12 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <div className="skeleton h-4 w-3/4 rounded" />
                          <div className="skeleton h-3 w-1/2 rounded" />
                          <div className="skeleton h-3 w-2/3 rounded" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!loading && data?.jobs.length === 0 && (
                <EmptyState
                  icon={MagnifyingGlass}
                  title="No jobs found"
                  description={
                    search || status || source || minScore > 0
                      ? 'Try adjusting your filters.'
                      : 'Find some jobs from the Dashboard to get started.'
                  }
                />
              )}

              {/* Jobs grid */}
              {!loading && data && data.jobs.length > 0 && (
                <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {data.jobs.map((job, idx) => (
                    <div
                      key={job.id}
                      className={clsx(
                        'job-card-item relative transition-all duration-150',
                        focusedIndex === idx && 'ring-1 ring-accent-green/50 rounded-2xl'
                      )}
                    >
                      {/* Selection checkbox */}
                      {selectMode && (
                        <button
                          onClick={() => toggleSelect(job.id)}
                          className={clsx(
                            'absolute top-3 left-3 z-10 w-5 h-5 rounded border flex items-center justify-center transition-all',
                            selectedIds.has(job.id)
                              ? 'bg-accent-green border-accent-green'
                              : 'bg-bg-3/80 border-white/25 hover:border-white/50'
                          )}
                        >
                          {selectedIds.has(job.id) && <X size={10} className="text-bg" />}
                        </button>
                      )}
                      <div onClick={() => selectMode && toggleSelect(job.id)}>
                        <JobCard
                          job={job}
                          onStatusChange={handleStatusChange}
                          onStarChange={handleStarChange}
                          onView={selectMode ? undefined : handleCardClick}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {data && data.total_pages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-bg-2 border border-border text-sm text-white/50 hover:text-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <CaretLeft size={15} />
                    Prev
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(7, data.total_pages) }, (_, i) => {
                      let pageNum: number;
                      const total = data.total_pages;
                      if (total <= 7) {
                        pageNum = i + 1;
                      } else if (page <= 4) {
                        pageNum = i + 1;
                      } else if (page >= total - 3) {
                        pageNum = total - 6 + i;
                      } else {
                        pageNum = page - 3 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={clsx(
                            'w-9 h-9 rounded-xl text-sm font-mono transition-all duration-150',
                            page === pageNum
                              ? 'bg-accent-green/15 border border-accent-green/30 text-accent-green font-bold'
                              : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                          )}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                    disabled={page === data.total_pages}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-bg-2 border border-border text-sm text-white/50 hover:text-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                    <CaretRight size={15} />
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── KANBAN VIEW ── */}
          {viewMode === 'kanban' && (
            <>
              {loading && (
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {KANBAN_COLUMNS.map((col) => (
                    <div key={col.status} className="flex-shrink-0 w-60">
                      <div className="skeleton h-8 w-32 rounded mb-3" />
                      <div className="space-y-3">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="skeleton h-24 rounded-xl" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loading && (
                <div className="flex gap-3 overflow-x-auto pb-6" ref={gridRef}>
                  {KANBAN_COLUMNS.map((col) => {
                    const colJobs = kanbanData.filter((j) => j.status === col.status);
                    return (
                      <div key={col.status} className="flex-shrink-0 w-60 flex flex-col h-[calc(100vh-220px)]">
                        {/* Sticky header */}
                        <div className="sticky top-0 z-10 bg-bg-1/95 backdrop-blur-sm rounded-t-xl px-3 py-2.5 mb-2 border border-border border-b-0">
                          <div className="flex items-center justify-between">
                            <span className={clsx('text-xs font-semibold uppercase tracking-wide', col.headerColor)}>
                              {col.label}
                            </span>
                            <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-md', col.badgeColor, col.headerColor)}>
                              {colJobs.length}
                            </span>
                          </div>
                        </div>

                        {/* Cards */}
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1 border border-t-0 border-border rounded-b-xl p-2">
                          {colJobs.length === 0 ? (
                            <div className="flex items-center justify-center h-20 text-white/15 text-xs">
                              Empty
                            </div>
                          ) : (
                            colJobs.map((job) => {
                              const globalIdx = kanbanData.indexOf(job);
                              return (
                                <div
                                  key={job.id}
                                  className={clsx(
                                    'job-card-item transition-all duration-150',
                                    focusedIndex === globalIdx && 'ring-1 ring-accent-green/50 rounded-xl'
                                  )}
                                >
                                  <KanbanCard
                                    job={job}
                                    onStatusChange={handleStatusChange}
                                    onStarChange={handleStarChange}
                                    onView={handleCardClick}
                                    isSelected={selectedIds.has(job.id)}
                                    selectMode={selectMode}
                                    onSelect={toggleSelect}
                                  />
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <BulkBar
          selectedIds={selectedIds}
          onDeselect={() => setSelectedIds(new Set())}
          onAction={handleBulkAction}
        />
      )}

      {/* Back to top button */}
      <button
        ref={backToTopRef}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className={clsx(
          'fixed bottom-6 right-6 z-40 flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-bg-3 border border-border text-white/50 hover:text-white/80 hover:border-white/20 shadow-xl text-sm transition-colors duration-150',
          !showBackToTop && 'pointer-events-none opacity-0'
        )}
        title="Back to top"
        aria-hidden={!showBackToTop}
      >
        <ArrowUp size={13} />
        Top
      </button>

      {/* Keyboard shortcut hint */}
      <button
        onClick={() => setShowShortcuts(true)}
        className="fixed bottom-6 left-6 z-40 flex items-center gap-1.5 px-3 py-2 rounded-full bg-bg-2 border border-border text-white/20 hover:text-white/50 hover:border-white/15 text-xs transition-all duration-150"
        title="Keyboard shortcuts (?)"
      >
        <Keyboard size={11} />
        <span className="hidden sm:inline">Shortcuts</span>
      </button>
    </>
  );
}

// ─── Page export (wraps with ToastProvider) ───────────────────────────────────

export default function JobsPage() {
  return (
    <ToastProvider>
      <JobsPageInner />
    </ToastProvider>
  );
}
