'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleNotch, Headphones, Pause, Play, Stop } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';

type Turn = { speaker: 'A' | 'B'; text: string };

// Speaks the script with the browser's own voices (Web Speech API): two
// distinct English voices where the device has them, else one voice at two pitches.
export default function AudioOverview({ playlistId }: { playlistId: string }) {
  const [turns, setTurns] = useState<Turn[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(-1);
  const [paused, setPaused] = useState(false);
  const stopped = useRef(false);
  const { toast } = useToast();
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => () => { stopped.current = true; window.speechSynthesis?.cancel(); }, [playlistId]);

  const voices = () => {
    const en = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
    return { A: en[0], B: en.find((v) => v !== en[0] && v.name !== en[0]?.name) ?? en[0] };
  };

  const speak = (script: Turn[], i: number) => {
    if (stopped.current || i >= script.length) { setIndex(-1); return; }
    setIndex(i);
    const u = new SpeechSynthesisUtterance(script[i].text);
    const v = voices();
    u.voice = v[script[i].speaker] ?? null;
    if (v.A === v.B) u.pitch = script[i].speaker === 'B' ? 1.25 : 0.9;
    u.rate = 1.05;
    u.onend = () => speak(script, i + 1);
    window.speechSynthesis.speak(u);
  };

  const play = async () => {
    let script = turns;
    if (!script) {
      setLoading(true);
      try {
        script = (await api.playlistAudioOverview(playlistId)).turns as Turn[];
        setTurns(script);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not write the overview', 'error');
        return;
      } finally {
        setLoading(false);
      }
    }
    stopped.current = false;
    setPaused(false);
    window.speechSynthesis.cancel();
    speak(script, 0);
  };

  const stop = () => { stopped.current = true; window.speechSynthesis.cancel(); setIndex(-1); setPaused(false); };
  const togglePause = () => {
    if (paused) window.speechSynthesis.resume(); else window.speechSynthesis.pause();
    setPaused(!paused);
  };

  if (!supported) return null;
  const playing = index >= 0;

  return (
    <div className="bg-bg-2 border border-border rounded-xl px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <Headphones size={14} className="text-accent-purple" />
        <span className="text-xs text-white/60 flex-1">Audio overview: two hosts talk through these notes</span>
        {!playing ? (
          <button onClick={play} disabled={loading} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent-purple/10 border border-accent-purple/30 text-accent-purple hover:bg-accent-purple/15 disabled:opacity-50">
            {loading ? <CircleNotch size={12} className="animate-spin" /> : <Play size={12} weight="fill" />}
            {loading ? 'Writing script…' : 'Listen'}
          </button>
        ) : (
          <>
            <button onClick={togglePause} aria-label={paused ? 'Resume' : 'Pause'} className="p-1.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5">
              {paused ? <Play size={14} weight="fill" /> : <Pause size={14} weight="fill" />}
            </button>
            <button onClick={stop} aria-label="Stop" className="p-1.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5">
              <Stop size={14} weight="fill" />
            </button>
          </>
        )}
      </div>
      {playing && turns && (
        <p className="text-xs text-white/50 leading-relaxed">
          <span className={turns[index].speaker === 'A' ? 'text-accent-cyan' : 'text-accent-yellow'}>
            {turns[index].speaker === 'A' ? 'Host' : 'Learner'}:
          </span>{' '}
          {turns[index].text}
        </p>
      )}
    </div>
  );
}
