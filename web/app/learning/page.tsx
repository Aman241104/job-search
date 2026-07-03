'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { BookOpen, GraduationCap, Check, CircleDot, Circle } from 'lucide-react';
import LearningChat from '@/components/LearningChat';
import { ToastProvider, useToast } from '@/components/Toast';
import { api, LearningItem } from '@/lib/api';
import clsx from 'clsx';

const STATUS_CYCLE: LearningItem['status'][] = ['not_started', 'in_progress', 'done'];

function StatusIcon({ status }: { status: LearningItem['status'] }) {
  if (status === 'done') return <Check size={14} className="text-accent-green" />;
  if (status === 'in_progress') return <CircleDot size={14} className="text-accent-yellow" />;
  return <Circle size={14} className="text-white/20" />;
}

function LearningPageInner() {
  const [items, setItems] = useState<LearningItem[]>([]);
  const [selected, setSelected] = useState<LearningItem | null>(null);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const load = async () => {
    try {
      const data = await api.learningTopics();
      setItems(data);
      if (!selected && data.length > 0) setSelected(data[0]);
    } catch {
      toast('Failed to load learning track', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!listRef.current || loading) return;
    gsap.fromTo(
      listRef.current.querySelectorAll('.learning-item-card'),
      { y: 16, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.05, duration: 0.4, ease: 'power3.out' }
    );
  }, [loading]);

  const cycleStatus = async (item: LearningItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(item.status) + 1) % STATUS_CYCLE.length];
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: next } : i)));
    try {
      await api.setLearningStatus(item.id, next);
    } catch {
      toast('Failed to update status', 'error');
      load();
    }
  };

  const phase2 = items.filter((i) => i.phase === 2);
  const phase3 = items.filter((i) => i.phase === 3);
  const doneCount = items.filter((i) => i.status === 'done').length;

  const renderGroup = (title: string, group: LearningItem[]) => (
    <div className="mb-5">
      <p className="text-xs font-medium text-white/35 uppercase tracking-wider mb-3 px-2">{title}</p>
      <div className="space-y-1.5">
        {group.map((item) => {
          const isActive = selected?.id === item.id;
          const Icon = item.item_type === 'course' ? GraduationCap : BookOpen;
          return (
            <button
              key={item.id}
              onClick={() => setSelected(item)}
              className={clsx(
                'learning-item-card w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-xl border transition-all duration-150',
                isActive
                  ? 'bg-accent-green/10 border-accent-green/25 text-white/90'
                  : 'bg-bg-2 border-border text-white/60 hover:border-white/10 hover:text-white/80'
              )}
            >
              <Icon size={18} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium leading-tight">{item.title}</span>
              </div>
              <button
                onClick={(e) => cycleStatus(item, e)}
                className="flex-shrink-0 mt-0.5 p-1 -m-1 rounded hover:bg-white/10"
                title="Click to cycle status: not started -> in progress -> done"
              >
                <StatusIcon status={item.status} />
              </button>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pb-24 md:pb-8 flex flex-col">
      <div className="px-6 md:px-8 py-6 border-b border-border">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white/90 mb-1">Learning</h1>
            <p className="text-white/35 text-sm">
              The curated Phase 2/3 track from ROADMAP.md — track progress, ask the tutor anything.
            </p>
          </div>
          {!loading && (
            <div className="text-center">
              <div className="font-mono text-xl font-bold text-accent-green">
                {doneCount}/{items.length}
              </div>
              <div className="text-xs text-white/35">completed</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        <div ref={listRef} className="md:w-80 xl:w-96 border-r border-border flex-shrink-0 overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="skeleton h-16 rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              {renderGroup('Phase 2 — Current', phase2)}
              {renderGroup('Phase 3 — Later', phase3)}
            </>
          )}
        </div>

        <div className="flex-1 flex flex-col min-h-0 min-h-[500px]">
          <LearningChat item={selected} />
        </div>
      </div>
    </div>
  );
}

export default function LearningPage() {
  return (
    <ToastProvider>
      <LearningPageInner />
    </ToastProvider>
  );
}
