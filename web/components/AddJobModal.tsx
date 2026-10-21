'use client';

import { useEffect, useState } from 'react';
import { CircleNotch, Link as LinkIcon, TextAlignLeft, X, BookmarkSimple } from '@phosphor-icons/react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';

interface Props {
  open: boolean;
  initialUrl?: string;
  onClose: () => void;
  onAdded: (jobId: string) => void;
}

export default function AddJobModal({ open, initialUrl = '', onClose, onAdded }: Props) {
  const [mode, setMode] = useState<'url' | 'text'>('url');
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [bookmarklet, setBookmarklet] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    setBookmarklet(`javascript:location.href='${window.location.origin}/jobs?add='+encodeURIComponent(location.href)`);
  }, []);

  useEffect(() => {
    if (initialUrl) { setMode('url'); setUrl(initialUrl); }
  }, [initialUrl]);

  if (!open) return null;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const job = await api.importJob(mode === 'url' ? { url: url.trim() } : { text });
      toast(`Saved: ${job.title}`, 'success');
      setUrl(''); setText('');
      onAdded(job.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save that job', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-lg rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/85">Add a job</h3>
          <button onClick={onClose} aria-label="Close" className="text-white/30 hover:text-white/60"><X size={16} /></button>
        </div>

        <div className="flex gap-2">
          {([['url', 'Link', LinkIcon], ['text', 'Paste text', TextAlignLeft]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={clsx(
                'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all',
                mode === key ? 'bg-accent-green/10 border-accent-green/30 text-accent-green' : 'border-border text-white/40 hover:text-white/60'
              )}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        {mode === 'url' ? (
          <input
            autoFocus
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="https://www.naukri.com/job-listings-..."
            className="w-full bg-bg-3 border border-border rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25"
          />
        ) : (
          <textarea
            autoFocus
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a WhatsApp/Telegram job post, a referral message, or the job description"
            className="w-full bg-bg-3 border border-border rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25"
          />
        )}

        <button
          onClick={save}
          disabled={saving || (mode === 'url' ? !url.trim() : !text.trim())}
          className="w-full flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-accent-green/10 border border-accent-green/30 text-accent-green hover:bg-accent-green/15 transition-all disabled:opacity-50"
        >
          {saving && <CircleNotch size={14} className="animate-spin" />}
          {saving ? 'Reading the job…' : 'Save job'}
        </button>

        {bookmarklet && (
          <div className="flex items-start gap-2 text-[11px] text-white/35 border-t border-border pt-3">
            <BookmarkSimple size={14} className="flex-shrink-0 mt-0.5" />
            <p>
              Save from any site: drag{' '}
              <a
                href={bookmarklet}
                onClick={(e) => e.preventDefault()}
                className="text-accent-cyan underline cursor-grab"
              >
                + Save to Job Search
              </a>{' '}
              to your bookmarks bar, then click it on any job page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
