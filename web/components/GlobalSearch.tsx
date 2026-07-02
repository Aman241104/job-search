'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  KeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import gsap from 'gsap';
import clsx from 'clsx';
import ScoreRing from '@/components/ScoreRing';
import { api, Job } from '@/lib/api';

/* ─────────────────────────── context ─────────────────────────── */

interface GlobalSearchContextValue {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const GlobalSearchContext = createContext<GlobalSearchContextValue>({
  open: () => {},
  close: () => {},
  isOpen: false,
});

export function useGlobalSearch() {
  return useContext(GlobalSearchContext);
}

/* ──────────────────────── status pill ────────────────────────── */

const STATUS_COLORS: Record<string, string> = {
  found: 'bg-white/10 text-white/50',
  applied: 'bg-accent-cyan/10 text-accent-cyan',
  interviewing: 'bg-accent-purple/10 text-accent-purple',
  offer: 'bg-accent-green/10 text-accent-green',
  rejected: 'bg-accent-pink/10 text-accent-pink',
  ghosted: 'bg-white/5 text-white/30',
};

/* ──────────────────────── source badge ───────────────────────── */

function SourceBadge({ source }: { source: string }) {
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/6 flex-shrink-0">
      {source}
    </span>
  );
}

/* ──────────────────────── modal component ────────────────────── */

function GlobalSearchModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Entrance animation
  useEffect(() => {
    if (!overlayRef.current || !boxRef.current) return;
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: 'power2.out' });
    gsap.fromTo(
      boxRef.current,
      { y: -24, opacity: 0, scale: 0.97 },
      { y: 0, opacity: 1, scale: 1, duration: 0.22, ease: 'power3.out' }
    );
    inputRef.current?.focus();
  }, []);

  // Escape key
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.jobs({ search: query, per_page: 8 });
        setResults(res.jobs || []);
        setActiveIdx(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const selectJob = useCallback(
    (job: Job) => {
      onClose();
      router.push(`/jobs?open=${job.id}`);
    },
    [onClose, router]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIdx]) {
      selectJob(results[activeIdx]);
    }
  };

  const showEmpty = !loading && query.trim() && results.length === 0;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] px-4"
      style={{ background: 'rgba(5,5,8,0.85)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        className="w-full max-w-xl rounded-2xl border border-white/10 bg-bg-1 shadow-[0_32px_80px_rgba(0,0,0,0.8)] overflow-hidden"
      >
        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
          <Search size={18} className="text-white/30 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search jobs and companies…"
            className="flex-1 bg-transparent text-white/90 placeholder-white/25 text-base outline-none font-sans"
          />
          {loading ? (
            <span className="w-4 h-4 rounded-full border-2 border-accent-green/40 border-t-accent-green animate-spin flex-shrink-0" />
          ) : query ? (
            <button
              onClick={() => setQuery('')}
              className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          ) : (
            <span className="text-[11px] font-mono text-white/20 bg-white/5 px-1.5 py-0.5 rounded border border-white/6 flex-shrink-0">
              ESC
            </span>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <ul className="max-h-[420px] overflow-y-auto py-2">
            {results.map((job, idx) => (
              <li key={job.id}>
                <button
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100',
                    idx === activeIdx
                      ? 'bg-accent-green/8 text-white/90'
                      : 'text-white/70 hover:bg-white/4 hover:text-white/90'
                  )}
                  onClick={() => selectJob(job)}
                  onMouseEnter={() => setActiveIdx(idx)}
                >
                  {/* Score ring */}
                  <ScoreRing score={job.score} size={28} />

                  {/* Title + company */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{job.title}</p>
                    <p className="text-xs text-white/40 truncate">{job.company}</p>
                  </div>

                  {/* Source + status */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <SourceBadge source={job.source} />
                    <span
                      className={clsx(
                        'text-[10px] font-mono px-1.5 py-0.5 rounded capitalize',
                        STATUS_COLORS[job.status] || 'bg-white/5 text-white/30'
                      )}
                    >
                      {job.status}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Empty state */}
        {showEmpty && (
          <div className="px-4 py-10 text-center">
            <p className="text-white/30 text-sm font-sans">
              No jobs found for{' '}
              <span className="text-white/60 font-mono">&apos;{query}&apos;</span>
            </p>
          </div>
        )}

        {/* Hint footer when no query */}
        {!query && !loading && (
          <div className="px-4 py-3 flex items-center gap-4 text-white/20 text-xs font-mono border-t border-border/50">
            <span><kbd className="font-sans">↑↓</kbd> navigate</span>
            <span><kbd className="font-sans">↵</kbd> open</span>
            <span><kbd className="font-sans">Esc</kbd> close</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────── provider ───────────────────────────── */

export function GlobalSearchProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <GlobalSearchContext.Provider value={{ open, close, isOpen }}>
      {children}
      {isOpen && <GlobalSearchModal onClose={close} />}
    </GlobalSearchContext.Provider>
  );
}
