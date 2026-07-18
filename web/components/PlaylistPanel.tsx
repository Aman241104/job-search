'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { YoutubeLogo, Plus, CircleNotch, CheckCircle, XCircle, PaperPlaneTilt } from '@phosphor-icons/react';
import { api, StudyPlaylist, StudyVideo } from '@/lib/api';
import { useToast } from './Toast';

function StatusBadge({ status }: { status: StudyVideo['status'] }) {
  if (status === 'done') return <CheckCircle size={14} className="text-accent-green" />;
  if (status === 'failed') return <XCircle size={14} className="text-red-400" />;
  return <CircleNotch size={14} className="animate-spin text-white/40" />;
}

export default function PlaylistPanel() {
  const [playlists, setPlaylists] = useState<StudyPlaylist[]>([]);
  const [selected, setSelected] = useState<StudyPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{ answer: string; sources: string[] } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const load = async () => {
    try {
      const data = await api.listPlaylists();
      setPlaylists(data);
      setSelected((prev) => prev ?? (data.length > 0 ? data[0] : null));
    } catch {
      toast('Failed to load playlists', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!selected) return;

    const refresh = async () => {
      try {
        const detail = await api.getPlaylist(selected.id);
        setSelected(detail);
        setPlaylists((prev) => prev.map((p) => (p.id === detail.id ? detail : p)));
        const stillWorking = detail.videos?.some(
          (v) => v.status === 'pending' || v.status === 'transcribing' || v.status === 'embedding'
        );
        if (!stillWorking && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // transient poll failure — try again next tick
      }
    };

    refresh();
    pollRef.current = setInterval(refresh, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const handleIngest = async () => {
    if (!urlInput.trim() || ingesting) return;
    setIngesting(true);
    try {
      const res = await api.ingestPlaylist(urlInput.trim());
      setUrlInput('');
      toast('Playlist queued — transcribing in the background', 'success');
      await load();
      const detail = await api.getPlaylist(res.playlist_id);
      setSelected(detail);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ingest failed', 'error');
    } finally {
      setIngesting(false);
    }
  };

  const handleAsk = async () => {
    if (!question.trim() || asking) return;
    setAsking(true);
    setAnswer(null);
    try {
      const res = await api.askPlaylists(question.trim(), selected?.id);
      setAnswer(res);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ask failed', 'error');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-0">
      <div className="md:w-80 xl:w-96 border-r border-border flex-shrink-0 overflow-y-auto p-4">
        <div className="mb-5 flex items-center gap-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleIngest()}
            placeholder="Paste a YouTube playlist link..."
            disabled={ingesting}
            className="flex-1 bg-bg-2 border border-border rounded-lg px-3 py-2 text-xs text-white/80 placeholder:text-white/25"
          />
          <button
            onClick={handleIngest}
            disabled={ingesting || !urlInput.trim()}
            className="p-2 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green disabled:opacity-40"
          >
            {ingesting ? <CircleNotch size={14} className="animate-spin" /> : <Plus size={14} />}
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : playlists.length === 0 ? (
          <p className="text-xs text-white/25 text-center px-4 py-6">No playlists yet — paste a link to get started.</p>
        ) : (
          <div className="space-y-1.5">
            {playlists.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className={clsx(
                  'w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-xl border transition-all duration-150',
                  selected?.id === p.id
                    ? 'bg-accent-green/10 border-accent-green/25 text-white/90'
                    : 'bg-bg-2 border-border text-white/60 hover:border-white/10 hover:text-white/80'
                )}
              >
                <YoutubeLogo size={18} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium leading-tight line-clamp-2">{p.title}</span>
                  <p className="text-xs text-white/30 mt-0.5 capitalize">{p.status}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <a
          href="https://github.com/Lucifer0406/EduRAG"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 block text-center text-[10px] text-white/25 hover:text-accent-green transition-colors"
        >
          RAG pipeline design informed by Lucifer0406/EduRAG ↗
        </a>
      </div>

      <div className="flex-1 flex flex-col min-h-0 min-h-[500px]">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <p className="text-white/40 text-sm">Select a playlist or paste a link to start</p>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-border flex-shrink-0">
              <h3 className="font-semibold text-white/90 text-sm">{selected.title}</h3>
              <p className="text-xs text-white/35">{selected.videos?.length ?? 0} videos</p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="space-y-2">
                {(selected.videos ?? []).map((v) => (
                  <div key={v.id} className="bg-bg-3 border border-border rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-white/80 leading-tight">{v.title}</span>
                      <StatusBadge status={v.status} />
                    </div>
                    {v.status === 'failed' && v.error && (
                      <p className="text-xs text-red-400/80 mt-1">{v.error}</p>
                    )}
                    {v.notes_md && (
                      <details className="mt-2">
                        <summary className="text-xs text-accent-green cursor-pointer">Notes</summary>
                        <div className="text-xs text-white/60 mt-2 whitespace-pre-wrap">{v.notes_md}</div>
                      </details>
                    )}
                  </div>
                ))}
              </div>

              {answer && (
                <div className="bg-accent-purple/10 border border-accent-purple/25 rounded-xl px-4 py-3">
                  <p className="text-sm text-white/80 whitespace-pre-wrap">{answer.answer}</p>
                  {answer.sources.length > 0 && (
                    <p className="text-[10px] text-white/35 mt-2">Sources: {answer.sources.join(', ')}</p>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-border flex-shrink-0">
              <div className="flex items-center gap-3 bg-bg-3 border border-border rounded-xl px-4 py-2.5">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                  disabled={asking}
                  placeholder="Ask a question about this playlist..."
                  className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/25 disabled:opacity-50"
                />
                <button
                  onClick={handleAsk}
                  disabled={asking || !question.trim()}
                  className="text-accent-green disabled:text-white/20 transition-colors hover:text-accent-green/80 p-1"
                >
                  {asking ? <CircleNotch size={16} className="animate-spin" /> : <PaperPlaneTilt size={16} />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
