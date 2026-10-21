'use client';

import { useEffect, useState } from 'react';
import { ArrowsClockwise, CircleNotch, Cards, Fire, Snowflake } from '@phosphor-icons/react';
import { ToastProvider, useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import { api, ReviewCard, Streak } from '@/lib/api';

// Full class strings: Tailwind can't see classes built at runtime.
const GRADES = [
  { key: 'again', label: 'Again', hint: '10 min', cls: 'bg-accent-pink/10 border-accent-pink/25 text-accent-pink hover:bg-accent-pink/15' },
  { key: 'hard', label: 'Hard', hint: 'sooner', cls: 'bg-accent-yellow/10 border-accent-yellow/25 text-accent-yellow hover:bg-accent-yellow/15' },
  { key: 'good', label: 'Good', hint: 'on time', cls: 'bg-accent-green/10 border-accent-green/25 text-accent-green hover:bg-accent-green/15' },
  { key: 'easy', label: 'Easy', hint: 'later', cls: 'bg-accent-cyan/10 border-accent-cyan/25 text-accent-cyan hover:bg-accent-cyan/15' },
] as const;

function ReviewPageInner() {
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [counts, setCounts] = useState({ due: 0, total: 0 });
  const [streak, setStreak] = useState<Streak | null>(null);
  const [shown, setShown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    try {
      const [due, s] = await Promise.all([api.reviewDue(), api.streak()]);
      setCards(due.cards);
      setCounts({ due: due.due, total: due.total });
      setStreak(s);
    } catch {
      toast('Failed to load reviews', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.reviewSync();
      toast(`${r.total} cards from your stories and prep packs`, 'success');
      await load();
    } catch {
      toast('Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const grade = async (g: (typeof GRADES)[number]['key']) => {
    const card = cards[0];
    if (!card) return;
    setShown(false);
    setCards((prev) => prev.slice(1));
    try {
      await api.reviewGrade(card.id, g);
      setStreak(await api.streak());
      if (cards.length === 1) await load();
    } catch {
      toast('Failed to save review', 'error');
    }
  };

  // Keyboard: space flips, 1-4 grade (Anki's keys)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === ' ') { e.preventDefault(); setShown(true); }
      const i = Number(e.key) - 1;
      if (shown && GRADES[i]) grade(GRADES[i].key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const card = cards[0];
  const pct = streak ? Math.min(100, Math.round((streak.today_points / streak.goal) * 100)) : 0;

  return (
    <div className="min-h-screen pb-24 md:pb-8 px-6 md:px-8 py-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white/90 mb-1">Review</h1>
          <p className="text-white/35 text-sm">Spaced repetition over your STAR stories and interview prep questions.</p>
        </div>
        <button
          onClick={sync}
          disabled={syncing}
          className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl bg-accent-purple/10 border border-accent-purple/30 text-accent-purple hover:bg-accent-purple/15 transition-all disabled:opacity-50 flex-shrink-0"
        >
          {syncing ? <CircleNotch size={14} className="animate-spin" /> : <ArrowsClockwise size={14} />}
          Sync cards
        </button>
      </div>

      {streak && (
        <div className="glass-panel rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <Fire size={22} weight="fill" className={streak.streak ? 'text-accent-yellow' : 'text-white/20'} />
            <span className="text-xl font-bold text-white/90 font-mono">{streak.streak}</span>
            <span className="text-xs text-white/40">day streak</span>
            {streak.frozen_days.length > 0 && (
              <span title={`Freeze used: ${streak.frozen_days.join(', ')}`} className="flex items-center gap-1 text-[11px] text-accent-cyan">
                <Snowflake size={12} /> {streak.frozen_days.length}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-[160px]">
            <div className="flex justify-between text-[11px] text-white/40 mb-1">
              <span>Today {streak.today_points}/{streak.goal} pts</span>
              <span>apply 5 · review/train 1</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div className={`h-full rounded-full ${streak.met_today ? 'bg-accent-green' : 'bg-accent-yellow'}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-white/40">
            Goal
            <input
              type="number"
              min={1}
              max={100}
              defaultValue={streak.goal}
              onBlur={async (e) => {
                const g = Number(e.target.value);
                if (g >= 1 && g <= 100 && g !== streak.goal) setStreak(await api.setDailyGoal(g));
              }}
              className="w-14 bg-bg-3 border border-border rounded-lg px-2 py-1 text-xs text-white/80"
            />
          </label>
        </div>
      )}

      {loading ? (
        <div className="skeleton h-64 rounded-2xl" />
      ) : !card ? (
        <EmptyState
          icon={Cards}
          title={counts.total ? 'All caught up' : 'No cards yet'}
          description={
            counts.total
              ? `${counts.total} cards scheduled. Come back when the next ones are due.`
              : 'Sync builds cards from your Story Bank and every job prep pack you have generated.'
          }
          action={{ label: 'Sync cards', onClick: sync }}
        />
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-white/30">{counts.due} due · {card.deck}</p>
          <button
            onClick={() => setShown(true)}
            className="w-full text-left bg-bg-2 border border-border rounded-2xl p-6 min-h-[220px] hover:border-white/15 transition-all"
          >
            <p className="text-lg text-white/85 leading-relaxed">{card.front}</p>
            {shown ? (
              <p className="mt-5 pt-5 border-t border-border text-sm text-white/60 leading-relaxed whitespace-pre-line">{card.back}</p>
            ) : (
              <p className="mt-6 text-xs text-white/25">Answer out loud first, then tap or press space to check.</p>
            )}
          </button>
          {shown && (
            <div className="grid grid-cols-4 gap-2">
              {GRADES.map((g, i) => (
                <button
                  key={g.key}
                  onClick={() => grade(g.key)}
                  className={`flex flex-col items-center py-2.5 rounded-xl border transition-all ${g.cls}`}
                >
                  <span className="text-xs font-semibold">{g.label}</span>
                  <span className="text-[10px] opacity-60">{i + 1} · {g.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReviewPage() {
  return (
    <ToastProvider>
      <ReviewPageInner />
    </ToastProvider>
  );
}
