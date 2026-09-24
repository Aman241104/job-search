'use client';

import { useState } from 'react';
import { CircleNotch, ShieldCheck, Archive, TrendDown } from '@phosphor-icons/react';
import { api, ListingCheckResult } from '@/lib/api';
import { useToast } from './Toast';

/** Re-opens the top-scored listings now (the daily auto-find does this too):
 *  closed or month-old jobs get archived, ones asking for 2+ years lose score. */
export default function ListingCheckButton({ onComplete }: { onComplete?: () => void }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ListingCheckResult | null>(null);
  const { toast } = useToast();

  const run = async () => {
    setRunning(true);
    try {
      const res = await api.checkListings(15);
      setResult(res);
      toast(`Checked ${res.checked} listings — ${res.closed + res.archived_old} archived, ${res.downgraded} re-scored`, 'success');
      onComplete?.();
    } catch {
      toast('Listing check failed — try again', 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={run}
        disabled={running}
        className="w-full flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl border border-border text-white/55 hover:text-white/85 hover:border-white/20 disabled:opacity-50 transition-colors"
        title="Opens your top matches' live listings: archives closed or old ones, lowers scores that need 2+ years"
      >
        {running ? <CircleNotch size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
        {running ? 'Re-checking live listings… (~30s)' : 'Re-check top listings'}
      </button>
      {result && (
        <div className="text-[11px] text-white/45 space-y-1">
          <p>
            Checked {result.checked} · archived {result.archived_old} old + {result.closed} closed · re-scored {result.downgraded}
          </p>
          {result.changes.slice(0, 5).map((c) => (
            <p key={c.id} className="flex items-center gap-1.5 truncate">
              {c.closed ? <Archive size={11} className="text-accent-pink flex-shrink-0" /> : <TrendDown size={11} className="text-accent-yellow flex-shrink-0" />}
              <span className="truncate">
                {c.title} · {c.company} — {c.closed ? 'closed' : `${c.old_score} → ${c.new_score} (${c.note})`}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
