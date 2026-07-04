'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { FloppyDisk, CircleNotch, Plus, X, ArrowSquareOut, GitBranch, User, Briefcase, Code, Trophy, Check, Trash, WarningCircle, ArrowClockwise } from '@phosphor-icons/react';
import { ToastProvider, useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import clsx from 'clsx';

type ResumeData = Record<string, unknown>;

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatSectionTitle = (key: string) => {
  const overrides: Record<string, string> = {
    technical: 'Technical Skills',
    soft: 'Soft Skills',
    tools: 'Tools & Platforms',
    languages: 'Languages',
    frameworks: 'Frameworks',
    databases: 'Databases',
    api: 'APIs & Integration',
  };
  return overrides[key.toLowerCase()] || key.charAt(0).toUpperCase() + key.slice(1);
};

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function ResumeSkeleton() {
  return (
    <div className="px-6 md:px-8 py-6 max-w-3xl space-y-5">
      {/* Header skeleton */}
      <div className="bg-bg-2 border border-border rounded-2xl p-5 space-y-4">
        <div className="skeleton h-4 w-32 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="skeleton h-3 w-16 rounded" />
              <div className="skeleton h-9 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </div>
      {/* Summary skeleton */}
      <div className="bg-bg-2 border border-border rounded-2xl p-5 space-y-3">
        <div className="skeleton h-4 w-40 rounded" />
        <div className="skeleton h-28 w-full rounded-xl" />
      </div>
      {/* Skills skeleton */}
      <div className="bg-bg-2 border border-border rounded-2xl p-5 space-y-3">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-7 rounded-lg" style={{ width: `${60 + i * 12}px` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

function ResumePageInner() {
  const [data, setData] = useState<ResumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'skills' | 'projects' | 'achievements'>('profile');
  // New category UI state
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const headerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // ── Load resume ────────────────────────────────────────────────────────────
  const loadResume = async (isRetry = false) => {
    if (isRetry) setRetrying(true);
    setError(false);
    try {
      const d = await api.resume();
      setData(d);
      setIsDirty(false);
    } catch {
      setError(true);
      toast('Failed to load resume', 'error');
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  };

  useEffect(() => {
    loadResume();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Unsaved-changes browser warning ───────────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // ── Header animation ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!headerRef.current || loading) return;
    gsap.fromTo(headerRef.current, { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out' });
  }, [loading]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    try {
      await api.saveResume(data);
      setSaved(true);
      setIsDirty(false);
      setTimeout(() => setSaved(false), 2500);
      toast('Resume saved!', 'success');
    } catch {
      toast('Failed to save resume', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Field updater — marks dirty ────────────────────────────────────────────
  const updateField = (path: string[], value: unknown) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      let cur: Record<string, unknown> = next;
      for (let i = 0; i < path.length - 1; i++) {
        cur = cur[path[i]] as Record<string, unknown>;
      }
      cur[path[path.length - 1]] = value;
      return next;
    });
    setIsDirty(true);
  };

  // ── Add project ────────────────────────────────────────────────────────────
  const addProject = () => {
    updateField(['projects'], [...((data?.projects as Array<Record<string, unknown>>) || []), {
      name: '',
      description: '',
      live_url: '',
      github_url: '',
      tech_stack: [],
      bullets: [],
    }]);
  };

  // ── Remove project ─────────────────────────────────────────────────────────
  const removeProject = (idx: number) => {
    const next = [...((data?.projects as Array<Record<string, unknown>>) || [])];
    next.splice(idx, 1);
    updateField(['projects'], next);
  };

  // ── Add skill category ─────────────────────────────────────────────────────
  const confirmAddCategory = () => {
    const key = newCategoryName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!key) return;
    const currentSkills = (data?.skills as Record<string, string[]>) || {};
    if (currentSkills[key]) {
      toast('Category already exists', 'error');
      return;
    }
    updateField(['skills', key], []);
    setNewCategoryName('');
    setAddingCategory(false);
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="sticky top-0 z-30 bg-bg/90 backdrop-blur-lg border-b border-border px-6 md:px-8 py-4 flex items-center justify-between">
          <div>
            <div className="skeleton h-5 w-28 rounded mb-1.5" />
            <div className="skeleton h-3 w-64 rounded" />
          </div>
          <div className="skeleton h-10 w-20 rounded-xl" />
        </div>
        <ResumeSkeleton />
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <WarningCircle size={32} className="text-accent-pink/70" />
        <p className="text-white/50 text-sm">Failed to load resume data.</p>
        <button
          onClick={() => loadResume(true)}
          disabled={retrying}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan text-sm font-medium hover:bg-accent-cyan/20 transition-all disabled:opacity-50"
        >
          {retrying ? <CircleNotch size={14} className="animate-spin" /> : <ArrowClockwise size={14} />}
          {retrying ? 'Retrying...' : 'Retry'}
        </button>
      </div>
    );
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const info = data.personal_info as Record<string, string>;
  const skills = data.skills as Record<string, string[]>;
  const projects = data.projects as Array<Record<string, unknown>>;
  const achievements = data.achievements as string[];
  const summaryText = (data.summary as string) || '';
  const summaryLen = summaryText.length;
  const summaryOverLimit = summaryLen > 400;
  const summaryNearLimit = summaryLen > 350;

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'skills', label: 'Skills', icon: Code },
    { id: 'projects', label: 'Projects', icon: Briefcase },
    { id: 'achievements', label: 'Achievements', icon: Trophy },
  ] as const;

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      {/* Header */}
      <div ref={headerRef} className="sticky top-0 z-30 bg-bg/90 backdrop-blur-lg border-b border-border px-6 md:px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-sans font-bold text-white/90 text-lg">My Resume</h1>
          <p className="text-xs text-white/30 mt-0.5">Edit your master resume — all tailored CVs derive from this</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Unsaved changes indicator */}
          {isDirty && !saving && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400/80">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Unsaved changes
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className={clsx(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200',
              saved
                ? 'bg-accent-green/20 border-accent-green/40 text-accent-green'
                : saving
                  ? 'border-white/10 text-white/30 cursor-not-allowed'
                  : 'bg-accent-green/10 border-accent-green/30 text-accent-green hover:bg-accent-green/20'
            )}
          >
            {saving ? <CircleNotch size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <FloppyDisk size={14} />}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 md:px-8 pt-5 pb-1 flex items-center gap-1 border-b border-border overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
              activeTab === id
                ? 'bg-accent-green/10 text-accent-green'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className="px-6 md:px-8 py-6 max-w-3xl">

        {/* Profile tab */}
        {activeTab === 'profile' && (
          <div className="space-y-5">
            <Section title="Personal Info">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: 'name', label: 'Name' },
                  { key: 'email', label: 'Email' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'location', label: 'Location' },
                  { key: 'linkedin', label: 'LinkedIn' },
                  { key: 'github', label: 'GitHub' },
                  { key: 'portfolio', label: 'Portfolio' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-xs text-white/30 uppercase tracking-wider mb-1 block">{label}</label>
                    <input
                      type="text"
                      value={info[key] || ''}
                      onChange={(e) => updateField(['personal_info', key], e.target.value)}
                      className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm text-white/80 focus:outline-none focus:border-accent-green/30"
                    />
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Professional Summary">
              <textarea
                value={summaryText}
                onChange={(e) => updateField(['summary'], e.target.value)}
                rows={5}
                className="w-full bg-bg-2 border border-border rounded-xl px-4 py-3 text-sm text-white/80 placeholder:text-white/20 resize-none focus:outline-none focus:border-accent-green/30 leading-relaxed"
                placeholder="Write a compelling professional summary..."
              />
              <div className="mt-1 space-y-1">
                <p className={clsx('text-xs', summaryNearLimit ? 'text-accent-pink' : 'text-white/25')}>
                  {summaryLen} / 400 characters
                </p>
                {summaryOverLimit && (
                  <p className="text-xs text-accent-pink/80 flex items-center gap-1">
                    <WarningCircle size={10} />
                    Consider shortening — ATS systems may truncate long summaries
                  </p>
                )}
              </div>
            </Section>

            <Section title="Areas of Interest">
              <ChipEditor
                chips={(data.areas_of_interest as string[]) || []}
                onChange={(chips) => updateField(['areas_of_interest'], chips)}
                placeholder="Add interest..."
                color="cyan"
              />
            </Section>
          </div>
        )}

        {/* Skills tab */}
        {activeTab === 'skills' && (
          <div className="space-y-5">
            {Object.entries(skills).map(([category, chips]) => (
              <Section key={category} title={formatSectionTitle(category)}>
                <ChipEditor
                  chips={chips}
                  onChange={(newChips) => updateField(['skills', category], newChips)}
                  placeholder={`Add ${formatSectionTitle(category).toLowerCase()} skill...`}
                  color="green"
                />
              </Section>
            ))}

            {/* Add category UI */}
            {addingCategory ? (
              <div className="bg-bg-2 border border-dashed border-accent-cyan/30 rounded-2xl p-4 flex items-center gap-3">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); confirmAddCategory(); }
                    if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryName(''); }
                  }}
                  placeholder="Category name (e.g. Databases)"
                  autoFocus
                  className="flex-1 bg-bg-3 border border-border rounded-xl px-3 py-2 text-sm text-white/70 placeholder:text-white/20 focus:outline-none focus:border-accent-cyan/30"
                />
                <button
                  onClick={confirmAddCategory}
                  className="px-3 py-2 rounded-xl bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan text-xs font-medium hover:bg-accent-cyan/20 transition-all"
                >
                  Add
                </button>
                <button
                  onClick={() => { setAddingCategory(false); setNewCategoryName(''); }}
                  className="p-2 rounded-xl text-white/30 hover:text-white/60 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingCategory(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-accent-cyan/25 text-accent-cyan/60 text-sm font-medium hover:border-accent-cyan/50 hover:text-accent-cyan hover:bg-accent-cyan/5 transition-all"
              >
                <Plus size={14} />
                Add Category
              </button>
            )}
          </div>
        )}

        {/* Projects tab */}
        {activeTab === 'projects' && (
          <div className="space-y-5">
            {projects.map((project, i) => (
              <div key={i} className="bg-bg-2 border border-border rounded-2xl p-5">
                {/* Project card header */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
                  <input
                    type="text"
                    value={(project.name as string) || ''}
                    onChange={(e) => {
                      const next = [...projects];
                      next[i] = { ...next[i], name: e.target.value };
                      updateField(['projects'], next);
                    }}
                    placeholder="Project name"
                    className="flex-1 bg-transparent text-sm font-semibold text-white/70 placeholder:text-white/20 focus:outline-none focus:text-white/90"
                  />
                  <button
                    onClick={() => removeProject(i)}
                    className="ml-3 p-1.5 rounded-lg text-white/20 hover:text-accent-pink hover:bg-accent-pink/10 transition-all flex-shrink-0"
                    title="Remove project"
                  >
                    <Trash size={13} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-white/30 uppercase tracking-wider mb-1 block">Description</label>
                    <textarea
                      value={(project.description as string) || ''}
                      onChange={(e) => {
                        const next = [...projects];
                        next[i] = { ...next[i], description: e.target.value };
                        updateField(['projects'], next);
                      }}
                      rows={3}
                      className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2.5 text-sm text-white/80 resize-none focus:outline-none focus:border-accent-green/30"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-white/30 uppercase tracking-wider mb-1 block flex items-center gap-1">
                        <ArrowSquareOut size={10} /> Live URL
                      </label>
                      <input
                        type="text"
                        value={(project.live_url as string) || ''}
                        onChange={(e) => {
                          const next = [...projects];
                          next[i] = { ...next[i], live_url: e.target.value };
                          updateField(['projects'], next);
                        }}
                        className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2 text-xs text-white/70 focus:outline-none focus:border-accent-green/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-white/30 uppercase tracking-wider mb-1 block flex items-center gap-1">
                        <GitBranch size={10} /> GitHub URL
                      </label>
                      <input
                        type="text"
                        value={(project.github_url as string) || ''}
                        onChange={(e) => {
                          const next = [...projects];
                          next[i] = { ...next[i], github_url: e.target.value };
                          updateField(['projects'], next);
                        }}
                        className="w-full bg-bg-2 border border-border rounded-xl px-3 py-2 text-xs text-white/70 focus:outline-none focus:border-accent-green/30"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-white/30 uppercase tracking-wider mb-1.5 block">Bullet Points</label>
                    <BulletEditor
                      bullets={(project.bullets as string[]) || []}
                      onChange={(bullets) => {
                        const next = [...projects];
                        next[i] = { ...next[i], bullets };
                        updateField(['projects'], next);
                      }}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-white/30 uppercase tracking-wider mb-1 block">Tech Stack</label>
                    <ChipEditor
                      chips={(project.tech_stack as string[]) || []}
                      onChange={(chips) => {
                        const next = [...projects];
                        next[i] = { ...next[i], tech_stack: chips };
                        updateField(['projects'], next);
                      }}
                      placeholder="Add tech..."
                      color="purple"
                    />
                  </div>
                </div>
              </div>
            ))}

            {/* Add Project button */}
            <button
              onClick={addProject}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-dashed border-accent-cyan/25 text-accent-cyan/60 text-sm font-medium hover:border-accent-cyan/50 hover:text-accent-cyan hover:bg-accent-cyan/5 transition-all"
            >
              <Plus size={14} />
              Add Project
            </button>
          </div>
        )}

        {/* Achievements tab */}
        {activeTab === 'achievements' && (
          <Section title="Achievements & Extra-curricular">
            <BulletEditor
              bullets={achievements}
              onChange={(bullets) => updateField(['achievements'], bullets)}
              placeholder="Add achievement..."
            />
          </Section>
        )}
      </div>
    </div>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-2 border border-border rounded-2xl p-5">
      <h3 className="font-sans font-semibold text-white/70 text-sm mb-4 pb-3 border-b border-border">{title}</h3>
      {children}
    </div>
  );
}

// ─── ChipEditor ──────────────────────────────────────────────────────────────

function ChipEditor({
  chips,
  onChange,
  placeholder,
  color,
}: {
  chips: string[];
  onChange: (chips: string[]) => void;
  placeholder: string;
  color: 'green' | 'cyan' | 'purple' | 'yellow';
}) {
  const [input, setInput] = useState('');
  const colorMap = {
    green: 'bg-accent-green/10 border-accent-green/20 text-accent-green',
    cyan: 'bg-accent-cyan/10 border-accent-cyan/20 text-accent-cyan',
    purple: 'bg-accent-purple/10 border-accent-purple/20 text-accent-purple',
    yellow: 'bg-accent-yellow/10 border-accent-yellow/20 text-accent-yellow',
  };

  const add = () => {
    const val = input.trim();
    if (val && !chips.includes(val)) {
      onChange([...chips, val]);
    }
    setInput('');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip}
            className={clsx('flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border', colorMap[color])}
          >
            {chip}
            <button
              onClick={() => onChange(chips.filter((c) => c !== chip))}
              className="ml-0.5 opacity-60 hover:opacity-100"
            >
              <X size={9} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 bg-bg-3 border border-border rounded-xl px-3 py-1.5 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-accent-green/30"
        />
        <button
          onClick={add}
          className="p-1.5 rounded-lg bg-accent-green/10 border border-accent-green/20 text-accent-green hover:bg-accent-green/20 transition-all"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── BulletEditor ────────────────────────────────────────────────────────────

function BulletEditor({
  bullets,
  onChange,
  placeholder = 'Add bullet point...',
}: {
  bullets: string[];
  onChange: (bullets: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const val = input.trim();
    if (val) { onChange([...bullets, val]); }
    setInput('');
  };

  return (
    <div className="space-y-2">
      {bullets.map((b, i) => (
        <div key={i} className="flex items-start gap-2 group">
          <span className="text-accent-green/50 text-xs mt-2 flex-shrink-0">▸</span>
          <input
            type="text"
            value={b}
            onChange={(e) => {
              const next = [...bullets];
              next[i] = e.target.value;
              onChange(next);
            }}
            className="flex-1 bg-bg-3 border border-transparent rounded-xl px-3 py-2 text-xs text-white/70 focus:outline-none focus:border-accent-green/30 hover:border-border transition-all"
          />
          <button
            onClick={() => onChange(bullets.filter((_, j) => j !== i))}
            className="p-1.5 rounded-lg text-white/20 hover:text-accent-pink opacity-0 group-hover:opacity-100 transition-all mt-0.5"
          >
            <X size={11} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 mt-2">
        <span className="text-white/20 text-xs flex-shrink-0">▸</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 bg-bg-3 border border-dashed border-border rounded-xl px-3 py-2 text-xs text-white/40 placeholder:text-white/20 focus:outline-none focus:border-accent-green/30"
        />
        <button
          onClick={add}
          className="p-1.5 rounded-lg bg-white/5 border border-border text-white/30 hover:text-accent-green hover:border-accent-green/20 transition-all"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Page export ─────────────────────────────────────────────────────────────

export default function ResumePage() {
  return (
    <ToastProvider>
      <ResumePageInner />
    </ToastProvider>
  );
}
