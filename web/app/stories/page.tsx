'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Sparkle, CircleNotch, FloppyDisk, Trash, PencilSimple, Plus, X, BookmarkSimple } from '@phosphor-icons/react';
import { ToastProvider, useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import { api, Story } from '@/lib/api';

const EMPTY_FORM = { situation: '', task: '', action: '', result: '', reflection: '', tags: [] as string[] };

function StoriesPageInner() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const load = async () => {
    try {
      setStories(await api.stories());
    } catch {
      toast('Failed to load story bank', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!listRef.current || loading) return;
    gsap.fromTo(
      listRef.current.querySelectorAll('.story-card'),
      { y: 16, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.05, duration: 0.4, ease: 'power3.out' }
    );
  }, [loading, stories.length]);

  const handleDraft = async () => {
    if (!notes.trim() || drafting) return;
    setDrafting(true);
    try {
      const draft = await api.draftStory(notes.trim());
      setForm(draft);
      setEditingId(null);
      setShowForm(true);
    } catch {
      toast('Failed to draft story', 'error');
    } finally {
      setDrafting(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (editingId) {
        await api.updateStory(editingId, form);
        toast('Story updated', 'success');
      } else {
        await api.addStory(form);
        toast('Story added to bank', 'success');
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      setNotes('');
      await load();
    } catch {
      toast('Failed to save story', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (story: Story) => {
    setForm({
      situation: story.situation, task: story.task, action: story.action,
      result: story.result, reflection: story.reflection, tags: story.tags,
    });
    setEditingId(story.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteStory(id);
      setStories((prev) => prev.filter((s) => s.id !== id));
      toast('Story deleted', 'success');
    } catch {
      toast('Failed to delete story', 'error');
    }
  };

  return (
    <div className="min-h-screen pb-24 md:pb-8 px-6 md:px-8 py-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white/90 mb-1">Interview Story Bank</h1>
          <p className="text-white/35 text-sm">
            5-10 persistent STAR+Reflection stories you can adapt to any behavioral question — not ephemeral practice, a reusable asset.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); }}
            className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl bg-accent-green/10 border border-accent-green/30 text-accent-green hover:bg-accent-green/15 transition-all"
          >
            <Plus size={14} /> Add Story
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-bg-2 border border-border rounded-2xl p-5 mb-8 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white/80">{editingId ? 'Edit Story' : 'New Story'}</h3>
            <button onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setNotes(''); }} className="text-white/30 hover:text-white/60">
              <X size={16} />
            </button>
          </div>

          {!editingId && (
            <div className="bg-bg-3 border border-border rounded-xl p-4 space-y-2">
              <p className="text-xs text-white/40">Paste a rough description of a past experience — AI structures it into STAR+Reflection.</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="e.g. At my last internship the API was timing out under load..."
                className="w-full bg-bg-2 border border-border rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25"
              />
              <button
                onClick={handleDraft}
                disabled={drafting || !notes.trim()}
                className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg bg-accent-purple/10 border border-accent-purple/30 text-accent-purple hover:bg-accent-purple/15 transition-all disabled:opacity-50"
              >
                {drafting ? <CircleNotch size={12} className="animate-spin" /> : <Sparkle size={12} />}
                Draft with AI
              </button>
            </div>
          )}

          {(['situation', 'task', 'action', 'result', 'reflection'] as const).map((field) => (
            <div key={field}>
              <label className="text-xs font-medium text-white/40 uppercase tracking-wider mb-1 block">{field}</label>
              <textarea
                value={form[field]}
                onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                rows={field === 'action' ? 3 : 2}
                className="w-full bg-bg-3 border border-border rounded-lg px-3 py-2 text-sm text-white/80"
              />
            </div>
          ))}

          <div>
            <label className="text-xs font-medium text-white/40 uppercase tracking-wider mb-1 block">Tags (comma-separated)</label>
            <input
              type="text"
              value={form.tags.join(', ')}
              onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) }))}
              className="w-full bg-bg-3 border border-border rounded-lg px-3 py-2 text-sm text-white/80"
              placeholder="leadership, conflict resolution, technical challenge"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !form.situation.trim()}
            className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-accent-green/10 border border-accent-green/30 text-accent-green hover:bg-accent-green/15 transition-all disabled:opacity-50"
          >
            {saving ? <CircleNotch size={14} className="animate-spin" /> : <FloppyDisk size={14} />}
            {editingId ? 'Update Story' : 'Save Story'}
          </button>
        </div>
      )}

      <div ref={listRef} className="space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)
        ) : stories.length === 0 ? (
          <EmptyState
            icon={BookmarkSimple}
            title="No stories yet"
            description="Add your first STAR+Reflection story — a reusable asset you can adapt to any behavioral question."
            action={{
              label: 'Add Story',
              onClick: () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); },
            }}
          />
        ) : (
          stories.map((story) => (
            <div key={story.id} className="story-card bg-bg-2 border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/80 leading-relaxed">{story.situation}</p>
                  <p className="text-xs text-white/40 mt-2 italic">&ldquo;{story.reflection}&rdquo;</p>
                  {story.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {story.tags.map((tag, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-white/40">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleEdit(story)} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5">
                    <PencilSimple size={13} />
                  </button>
                  <button onClick={() => handleDelete(story.id)} className="p-1.5 rounded-lg text-white/30 hover:text-accent-pink hover:bg-accent-pink/10">
                    <Trash size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function StoriesPage() {
  return (
    <ToastProvider>
      <StoriesPageInner />
    </ToastProvider>
  );
}
