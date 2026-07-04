'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { BookOpen, GraduationCap, Sparkle, Check, RadioButton, Circle, Plus, UploadSimple, FileText, CircleNotch } from '@phosphor-icons/react';
import LearningChat from '@/components/LearningChat';
import TopicChecklist from '@/components/TopicChecklist';
import BookReader from '@/components/BookReader';
import { ToastProvider, useToast } from '@/components/Toast';
import { api, LearningItem, LearningBook } from '@/lib/api';
import clsx from 'clsx';

const STATUS_CYCLE: LearningItem['status'][] = ['not_started', 'in_progress', 'done'];
type Tab = 'skills' | 'books';

function StatusIcon({ status }: { status: LearningItem['status'] }) {
  if (status === 'done') return <Check size={14} className="text-accent-green" />;
  if (status === 'in_progress') return <RadioButton size={14} className="text-accent-yellow" />;
  return <Circle size={14} className="text-white/20" />;
}

function ItemIcon({ type }: { type: LearningItem['item_type'] }) {
  if (type === 'course') return <GraduationCap size={18} className="flex-shrink-0 mt-0.5" />;
  if (type === 'skill') return <Sparkle size={18} className="flex-shrink-0 mt-0.5" />;
  return <BookOpen size={18} className="flex-shrink-0 mt-0.5" />;
}

function LearningPageInner() {
  const [tab, setTab] = useState<Tab>('skills');
  const [items, setItems] = useState<LearningItem[]>([]);
  const [selected, setSelected] = useState<LearningItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [newSkill, setNewSkill] = useState('');
  const [addingSkill, setAddingSkill] = useState(false);

  const [books, setBooks] = useState<LearningBook[]>([]);
  const [selectedBook, setSelectedBook] = useState<LearningBook | null>(null);
  const [booksLoading, setBooksLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const load = async () => {
    try {
      const data = await api.learningTopics();
      setItems(data);
      setSelected((prev) => prev ?? (data.length > 0 ? data[0] : null));
    } catch {
      toast('Failed to load learning track', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadBooks = async () => {
    try {
      const data = await api.listBooks();
      setBooks(data);
      setSelectedBook((prev) => prev ?? (data.length > 0 ? data[0] : null));
    } catch {
      toast('Failed to load books', 'error');
    } finally {
      setBooksLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!listRef.current || (tab === 'skills' && loading) || (tab === 'books' && booksLoading)) return;
    gsap.fromTo(
      listRef.current.querySelectorAll('.learning-item-card, .book-card'),
      { y: 16, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.05, duration: 0.4, ease: 'power3.out' }
    );
  }, [loading, booksLoading, tab]);

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

  const handleAddSkill = async () => {
    if (!newSkill.trim() || addingSkill) return;
    setAddingSkill(true);
    try {
      await api.addLearningSkill(newSkill.trim());
      setNewSkill('');
      toast(`Added "${newSkill.trim()}" with an AI-generated topic breakdown`, 'success');
      await load();
    } catch {
      toast('Failed to add skill', 'error');
    } finally {
      setAddingSkill(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await api.uploadBook(file);
      toast(`Uploaded — ${res.page_count} pages extracted`, 'success');
      await loadBooks();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const phase2 = items.filter((i) => i.phase === 2);
  const phase3 = items.filter((i) => i.phase === 3);
  const customSkills = items.filter((i) => i.item_type === 'skill');
  const doneCount = items.filter((i) => i.status === 'done').length;

  const renderGroup = (title: string, group: LearningItem[]) => {
    if (group.length === 0) return null;
    return (
      <div className="mb-5">
        <p className="text-xs font-medium text-white/35 uppercase tracking-wider mb-3 px-2">{title}</p>
        <div className="space-y-1.5">
          {group.map((item) => {
            const isActive = selected?.id === item.id;
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
                <ItemIcon type={item.item_type} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium leading-tight">{item.title}</span>
                  {item.coverage_score !== null && item.coverage_score !== undefined && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-green rounded-full"
                          style={{ width: `${item.coverage_score}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-white/30">{item.coverage_score}/100</span>
                    </div>
                  )}
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
  };

  return (
    <div className="min-h-screen pb-24 md:pb-8 flex flex-col">
      <div className="px-6 md:px-8 py-6 border-b border-border">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white/90 mb-1">Learning</h1>
            <p className="text-white/35 text-sm">
              Curated Phase 2/3 track + any skill you add, an AI tutor per topic, and your own PDF/book library.
            </p>
          </div>
          {!loading && tab === 'skills' && (
            <div className="text-center">
              <div className="font-mono text-xl font-bold text-accent-green">
                {doneCount}/{items.length}
              </div>
              <div className="text-xs text-white/35">completed</div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => setTab('skills')}
            className={clsx(
              'text-xs font-semibold px-4 py-2 rounded-lg border transition-all',
              tab === 'skills'
                ? 'bg-accent-green/10 border-accent-green/30 text-accent-green'
                : 'border-border text-white/40 hover:text-white/70'
            )}
          >
            Skills & Courses
          </button>
          <button
            onClick={() => setTab('books')}
            className={clsx(
              'text-xs font-semibold px-4 py-2 rounded-lg border transition-all',
              tab === 'books'
                ? 'bg-accent-green/10 border-accent-green/30 text-accent-green'
                : 'border-border text-white/40 hover:text-white/70'
            )}
          >
            Books & PDFs
          </button>
        </div>
      </div>

      {tab === 'skills' ? (
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          <div ref={listRef} className="md:w-80 xl:w-96 border-r border-border flex-shrink-0 overflow-y-auto p-4">
            <div className="mb-5 flex items-center gap-2">
              <input
                type="text"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSkill()}
                placeholder="Add any skill (e.g. Rust, GraphQL)..."
                disabled={addingSkill}
                className="flex-1 bg-bg-2 border border-border rounded-lg px-3 py-2 text-xs text-white/80 placeholder:text-white/25"
              />
              <button
                onClick={handleAddSkill}
                disabled={addingSkill || !newSkill.trim()}
                className="p-2 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green disabled:opacity-40"
              >
                {addingSkill ? <CircleNotch size={14} className="animate-spin" /> : <Plus size={14} />}
              </button>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="skeleton h-16 rounded-xl" />
                ))}
              </div>
            ) : (
              <>
                {renderGroup('Your Skills', customSkills)}
                {renderGroup('Phase 2 — Current', phase2)}
                {renderGroup('Phase 3 — Later', phase3)}
              </>
            )}
          </div>

          <div className="flex-1 flex flex-col min-h-0 min-h-[500px]">
            {selected && <TopicChecklist itemId={selected.id} key={selected.id} />}
            <LearningChat item={selected} />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          <div ref={listRef} className="md:w-80 xl:w-96 border-r border-border flex-shrink-0 overflow-y-auto p-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full mb-5 flex items-center justify-center gap-2 text-xs font-semibold px-4 py-3 rounded-xl border border-dashed border-accent-green/30 text-accent-green hover:bg-accent-green/5 transition-all disabled:opacity-50"
            >
              {uploading ? <CircleNotch size={14} className="animate-spin" /> : <UploadSimple size={14} />}
              {uploading ? 'Uploading & extracting...' : 'Upload a PDF'}
            </button>

            {booksLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="skeleton h-16 rounded-xl" />
                ))}
              </div>
            ) : books.length === 0 ? (
              <p className="text-xs text-white/25 text-center px-4 py-6">No books yet — upload a PDF to get started.</p>
            ) : (
              <div className="space-y-1.5">
                {books.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBook(b)}
                    className={clsx(
                      'book-card w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-xl border transition-all duration-150',
                      selectedBook?.id === b.id
                        ? 'bg-accent-green/10 border-accent-green/25 text-white/90'
                        : 'bg-bg-2 border-border text-white/60 hover:border-white/10 hover:text-white/80'
                    )}
                  >
                    <FileText size={18} className="flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium leading-tight">{b.title}</span>
                      <p className="text-xs text-white/30 mt-0.5">{b.page_count} pages</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col min-h-0 min-h-[500px]">
            <BookReader book={selectedBook} />
          </div>
        </div>
      )}
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
