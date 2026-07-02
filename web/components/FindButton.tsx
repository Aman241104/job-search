'use client';

import { useRef, useState } from 'react';
import gsap from 'gsap';
import { Radar, X, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from './Toast';
import clsx from 'clsx';

interface FindButtonProps {
  onComplete?: () => void;
}

interface SSEEvent {
  type: 'status' | 'progress' | 'found' | 'done' | 'error';
  message?: string;
  count?: number;
  total?: number;
  percent?: number;
}

export default function FindButton({ onComplete }: FindButtonProps) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [foundCount, setFoundCount] = useState(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const { toast } = useToast();

  const animateProgress = (to: number) => {
    if (!progressRef.current) return;
    gsap.to(progressRef.current, {
      width: `${to}%`,
      duration: 0.5,
      ease: 'power2.out',
    });
  };

  const handleFind = () => {
    if (running) {
      // Cancel
      esRef.current?.close();
      setRunning(false);
      setStatus('Search cancelled');
      setProgress(0);
      animateProgress(0);
      return;
    }

    setRunning(true);
    setDone(false);
    setFoundCount(0);
    setProgress(0);
    setStatus('Initializing search...');

    const es = api.findStream();
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const data: SSEEvent = JSON.parse(e.data);
        if (data.type === 'status' && data.message) {
          setStatus(data.message);
        } else if (data.type === 'progress') {
          const pct = data.percent || 0;
          setProgress(pct);
          animateProgress(pct);
          if (data.message) setStatus(data.message);
        } else if (data.type === 'found') {
          setFoundCount((n) => n + (data.count || 1));
          if (data.message) setStatus(data.message);
        } else if (data.type === 'done') {
          setProgress(100);
          animateProgress(100);
          setStatus(data.message || 'Search complete!');
          setDone(true);
          setRunning(false);
          es.close();
          toast(`Found ${data.count || foundCount} new jobs!`, 'success');
          onComplete?.();
        } else if (data.type === 'error') {
          setStatus(data.message || 'An error occurred');
          setRunning(false);
          es.close();
          toast(data.message || 'Search failed', 'error');
        }
      } catch {
        // Non-JSON message, ignore
      }
    };

    es.onerror = () => {
      // If done status was already set, this is just the stream closing
      if (!done) {
        setStatus('Search complete!');
        setDone(true);
      }
      setRunning(false);
      es.close();
      onComplete?.();
    };
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handleFind}
        className={clsx(
          'relative flex items-center gap-3 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200 overflow-hidden',
          running
            ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/15'
            : done
            ? 'bg-accent-green/10 border border-accent-green/30 text-accent-green'
            : 'bg-accent-green/10 border border-accent-green/30 text-accent-green hover:bg-accent-green/15 hover:border-accent-green/50'
        )}
      >
        {running ? (
          <>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-400" />
            </span>
            Stop Search
            <X size={15} className="ml-auto" />
          </>
        ) : done ? (
          <>
            <CheckCircle2 size={16} className="drop-shadow-[0_0_8px_rgba(99,255,178,0.6)]" />
            Search Complete
          </>
        ) : (
          <>
            <Radar size={16} className="drop-shadow-[0_0_8px_rgba(99,255,178,0.4)]" />
            Find New Jobs
          </>
        )}
      </button>

      {(running || done || progress > 0) && (
        <div className="space-y-2">
          {/* Progress bar */}
          <div className="h-1.5 bg-bg-3 rounded-full overflow-hidden">
            <div
              ref={progressRef}
              className={clsx(
                'h-full rounded-full',
                done
                  ? 'bg-accent-green shadow-[0_0_8px_rgba(99,255,178,0.4)]'
                  : 'bg-gradient-to-r from-accent-green to-accent-cyan shadow-[0_0_8px_rgba(99,255,178,0.3)]'
              )}
              style={{ width: '0%' }}
            />
          </div>

          {/* Status text */}
          <div className="flex items-center justify-between">
            <p
              className={clsx(
                'text-xs',
                running ? 'text-white/40 progress-pulse' : 'text-white/40'
              )}
            >
              {status}
            </p>
            {foundCount > 0 && (
              <span className="text-xs font-mono text-accent-green">
                +{foundCount} found
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
