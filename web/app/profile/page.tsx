'use client';

import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import gsap from 'gsap';
import { ArrowSquareOut, X, Check, CircleNotch } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import clsx from 'clsx';

/* ─────────────────────── types ──────────────────────── */

interface ProfileData {
  name: string;
  email: string;
  phone: string;
  college: string;
  cgpa: string;
  github: string;
  portfolio: string;
  skills: string[];
  target_roles: string[];
  location_preference: string[];
  target_lpa: { min: number; max: number };
  current_offer: string;
}

const DEFAULT_PROFILE: ProfileData = {
  name: '',
  email: '',
  phone: '',
  college: '',
  cgpa: '',
  github: '',
  portfolio: '',
  skills: [],
  target_roles: [],
  location_preference: [],
  target_lpa: { min: 8, max: 12 },
  current_offer: '',
};

/* ─────────────────────── chip editor ─────────────────── */

function ChipEditor({
  label,
  chips,
  onChange,
  placeholder,
}: {
  label: string;
  chips: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const addChip = () => {
    const val = input.trim();
    if (val && !chips.includes(val)) {
      onChange([...chips, val]);
    }
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addChip();
    } else if (e.key === 'Backspace' && !input && chips.length > 0) {
      onChange(chips.slice(0, -1));
    }
  };

  const removeChip = (chip: string) => {
    onChange(chips.filter((c) => c !== chip));
  };

  return (
    <div>
      <label className="block text-xs font-mono text-white/40 mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      <div className="min-h-[44px] flex flex-wrap gap-1.5 p-2 rounded-xl border border-border bg-bg focus-within:border-accent-green/40 transition-colors duration-150">
        {chips.map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-accent-green/10 text-accent-green text-xs font-mono border border-accent-green/20"
          >
            {chip}
            <button
              onClick={() => removeChip(chip)}
              className="text-accent-green/50 hover:text-accent-green transition-colors ml-0.5"
              type="button"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addChip}
          placeholder={chips.length === 0 ? (placeholder ?? 'Type and press Enter…') : ''}
          className="flex-1 min-w-[120px] bg-transparent text-white/80 text-sm outline-none placeholder-white/20 py-0.5 px-1"
        />
      </div>
    </div>
  );
}

/* ─────────────────────── text input ─────────────────── */

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  suffix?: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-mono text-white/40 mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-white/85 placeholder-white/20 outline-none focus:border-accent-green/40 transition-colors duration-150 font-sans"
        />
        {suffix && (
          <span className="absolute right-3 text-white/25 pointer-events-none">{suffix}</span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────── section card ───────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="profile-section rounded-2xl border border-border bg-bg-2 p-5 flex flex-col gap-4">
      <h2 className="text-xs font-mono text-white/30 uppercase tracking-widest">{title}</h2>
      {children}
    </div>
  );
}

/* ─────────────────────── main page ──────────────────── */

export default function ProfilePage() {
  const pageRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState<ProfileData>(DEFAULT_PROFILE);
  const [original, setOriginal] = useState<ProfileData>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const isDirty = JSON.stringify(profile) !== JSON.stringify(original);

  /* fetch profile on mount */
  useEffect(() => {
    api
      .userProfile()
      .then((data) => {
        const p = data as unknown as ProfileData;
        setProfile({ ...DEFAULT_PROFILE, ...p });
        setOriginal({ ...DEFAULT_PROFILE, ...p });
      })
      .catch(() => setError('Failed to load profile. Is the backend running?'))
      .finally(() => setLoading(false));
  }, []);

  /* GSAP entrance */
  useEffect(() => {
    if (loading || !pageRef.current) return;
    const sections = pageRef.current.querySelectorAll('.profile-section');
    gsap.fromTo(
      sections,
      { y: 28, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.08, duration: 0.5, ease: 'power3.out', delay: 0.05 }
    );
  }, [loading]);

  /* field helpers */
  const set = <K extends keyof ProfileData>(key: K, value: ProfileData[K]) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const setLpa = (field: 'min' | 'max', raw: string) => {
    const n = parseInt(raw, 10);
    setProfile((prev) => ({
      ...prev,
      target_lpa: { ...prev.target_lpa, [field]: isNaN(n) ? 0 : n },
    }));
  };

  /* save */
  const handleSave = async () => {
    setSaveState('saving');
    try {
      await api.saveProfile(profile as unknown as Record<string, unknown>);
      setOriginal(profile);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2200);
    } catch {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 2500);
    }
  };

  /* ── render ── */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-accent-green/30 border-t-accent-green animate-spin" />
          <p className="text-white/30 text-sm font-mono">Loading profile…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="text-center">
          <p className="text-accent-pink text-sm mb-1">{error}</p>
          <p className="text-white/30 text-xs font-mono">Check that the backend is running on port 8000.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={pageRef} className="max-w-2xl mx-auto px-4 py-8 pb-24 md:pb-8">
      {/* Header */}
      <div className="profile-section flex items-center justify-between mb-6 rounded-2xl border border-border bg-bg-2 px-5 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-white/90">My Profile</h1>
          {isDirty && (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-mono text-accent-yellow"
              title="Unsaved changes"
            >
              <span className="w-2 h-2 rounded-full bg-accent-yellow inline-block" />
              Unsaved
            </span>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={saveState === 'saving' || !isDirty}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
            saveState === 'saved'
              ? 'bg-accent-green/15 text-accent-green border border-accent-green/30'
              : saveState === 'error'
              ? 'bg-accent-pink/15 text-accent-pink border border-accent-pink/30'
              : isDirty
              ? 'bg-accent-green/10 text-accent-green border border-accent-green/25 hover:bg-accent-green/20'
              : 'bg-white/5 text-white/30 border border-border cursor-not-allowed'
          )}
        >
          {saveState === 'saving' ? (
            <CircleNotch size={14} className="animate-spin" />
          ) : saveState === 'saved' ? (
            <Check size={14} />
          ) : null}
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'saved'
            ? 'Saved!'
            : saveState === 'error'
            ? 'Error — retry'
            : 'Save Changes'}
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {/* 1. Personal Info */}
        <Section title="Personal Info">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Name"
              value={profile.name}
              onChange={(v) => set('name', v)}
              placeholder="Aman Patel"
            />
            <Field
              label="Email"
              value={profile.email}
              onChange={(v) => set('email', v)}
              type="email"
              placeholder="you@email.com"
            />
          </div>
          <Field
            label="Phone"
            value={profile.phone}
            onChange={(v) => set('phone', v)}
            placeholder="+91 9999999999"
          />
        </Section>

        {/* 2. Education */}
        <Section title="Education">
          <Field
            label="College"
            value={profile.college}
            onChange={(v) => set('college', v)}
            placeholder="LDCE Ahmedabad, B.E. EC Engineering"
          />
          <Field
            label="CGPA"
            value={profile.cgpa}
            onChange={(v) => set('cgpa', v)}
            placeholder="8.00"
          />
        </Section>

        {/* 3. Links */}
        <Section title="Links">
          <Field
            label="GitHub"
            value={profile.github}
            onChange={(v) => set('github', v)}
            placeholder="github.com/yourhandle"
            suffix={<ArrowSquareOut size={14} />}
          />
          <Field
            label="Portfolio"
            value={profile.portfolio}
            onChange={(v) => set('portfolio', v)}
            placeholder="yoursite.vercel.app"
            suffix={<ArrowSquareOut size={14} />}
          />
        </Section>

        {/* 4. Skills */}
        <Section title="Skills">
          <ChipEditor
            label="Technologies & Tools"
            chips={profile.skills}
            onChange={(v) => set('skills', v)}
            placeholder="React, TypeScript, Node.js…"
          />
        </Section>

        {/* 5. Job Preferences */}
        <Section title="Job Preferences">
          <ChipEditor
            label="Target Roles"
            chips={profile.target_roles}
            onChange={(v) => set('target_roles', v)}
            placeholder="Frontend Developer, React Developer…"
          />
          <ChipEditor
            label="Location Preference"
            chips={profile.location_preference}
            onChange={(v) => set('location_preference', v)}
            placeholder="Remote, Ahmedabad, Gujarat…"
          />

          {/* Target LPA */}
          <div>
            <label className="block text-xs font-mono text-white/40 mb-1.5 uppercase tracking-wider">
              Target LPA (₹)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                value={profile.target_lpa.min || ''}
                onChange={(e) => setLpa('min', e.target.value)}
                placeholder="8"
                className="w-24 rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-white/85 placeholder-white/20 outline-none focus:border-accent-green/40 transition-colors duration-150 font-mono text-center"
              />
              <span className="text-white/25 font-mono text-sm">—</span>
              <input
                type="number"
                min={0}
                value={profile.target_lpa.max || ''}
                onChange={(e) => setLpa('max', e.target.value)}
                placeholder="12"
                className="w-24 rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-white/85 placeholder-white/20 outline-none focus:border-accent-green/40 transition-colors duration-150 font-mono text-center"
              />
              <span className="text-white/30 text-xs font-mono">LPA</span>
            </div>
          </div>
        </Section>

        {/* 6. Current Offer */}
        <Section title="Current Offer">
          <Field
            label="Offer Details"
            value={profile.current_offer}
            onChange={(v) => set('current_offer', v)}
            placeholder="TCS Digital 7 LPA"
          />
        </Section>
      </div>
    </div>
  );
}
