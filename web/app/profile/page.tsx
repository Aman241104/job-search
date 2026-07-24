'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ArrowSquareOut, Check, CircleNotch, TelegramLogo, DownloadSimple, Trash } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { ChipEditor, Field, Section } from '@/components/ProfileFields';
import { useAuth } from '@/components/AuthProvider';
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
  skill_weights: Record<string, number>;
  enabled_sources: string[];
  min_score_threshold: number;
  salary_weight: number;
  location_weight: number;
  smtp_email: string;
  smtp_app_password: string;
  smtp_app_password_set: boolean;
  telegram_chat_id: string;
  auto_find_enabled: boolean;
}

// Mirrors JobFinderAgent.ALL_SOURCE_KEYS in agents/job_finder.py — keep in sync.
const ALL_SOURCES = [
  { key: 'internshala', label: 'Internshala' },
  { key: 'jobicy', label: 'Jobicy' },
  { key: 'adzuna', label: 'Adzuna' },
  { key: 'jooble', label: 'Jooble' },
  { key: 'careerjet', label: 'Careerjet' },
  { key: 'weworkremotely', label: 'WeWorkRemotely' },
  { key: 'arbeitnow', label: 'Arbeitnow' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'remotive', label: 'Remotive' },
  { key: 'remoteok', label: 'RemoteOK' },
  { key: 'remoteco', label: 'Remote.co' },
  { key: 'themuse', label: 'The Muse' },
  { key: 'himalayas', label: 'Himalayas' },
  { key: 'hn_hiring', label: "HN Who's Hiring" },
];

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
  skill_weights: {},
  enabled_sources: ALL_SOURCES.map((s) => s.key),
  min_score_threshold: 40,
  salary_weight: 50,
  location_weight: 50,
  smtp_email: '',
  smtp_app_password: '',
  smtp_app_password_set: false,
  telegram_chat_id: '',
  auto_find_enabled: false,
};

/* ─────────────────────── main page ──────────────────── */

export default function ProfilePage() {
  const pageRef = useRef<HTMLDivElement>(null);
  const { logout } = useAuth();

  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [profile, setProfile] = useState<ProfileData>(DEFAULT_PROFILE);
  const [original, setOriginal] = useState<ProfileData>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [telegramConnectUrl, setTelegramConnectUrl] = useState<string | null>(null);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);

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

  const setSkillWeight = (skill: string, weight: number) => {
    setProfile((prev) => ({ ...prev, skill_weights: { ...prev.skill_weights, [skill]: weight } }));
  };

  const toggleSource = (key: string) => {
    setProfile((prev) => ({
      ...prev,
      enabled_sources: prev.enabled_sources.includes(key)
        ? prev.enabled_sources.filter((k) => k !== key)
        : [...prev.enabled_sources, key],
    }));
  };

  /* telegram connect flow */
  const refreshTelegramStatus = async () => {
    const data = await api.userProfile();
    const chatId = (data as unknown as ProfileData).telegram_chat_id || '';
    setProfile((prev) => ({ ...prev, telegram_chat_id: chatId }));
    setOriginal((prev) => ({ ...prev, telegram_chat_id: chatId }));
  };

  const handleTelegramConnect = async () => {
    setTelegramBusy(true);
    try {
      const { connect_url } = await api.telegramConnectLink();
      setTelegramConnectUrl(connect_url);
      window.open(connect_url, '_blank');
    } catch {
      setTelegramError('Could not get a Telegram connect link. Is TELEGRAM_BOT_TOKEN configured?');
    } finally {
      setTelegramBusy(false);
    }
  };

  const handleTelegramDisconnect = async () => {
    setTelegramBusy(true);
    try {
      await api.telegramDisconnect();
      setProfile((prev) => ({ ...prev, telegram_chat_id: '' }));
      setOriginal((prev) => ({ ...prev, telegram_chat_id: '' }));
      setTelegramConnectUrl(null);
    } finally {
      setTelegramBusy(false);
    }
  };

  /* danger zone */
  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await api.deleteAccount();
      await logout();
    } catch {
      setDeleting(false);
    }
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
              placeholder="Jane Doe"
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
            placeholder="Your College, B.Tech Computer Science"
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
          {profile.skills.length > 0 && (
            <div className="flex flex-col gap-3 pt-1">
              <label className="block text-xs font-mono text-white/40 uppercase tracking-wider">
                Skill Weights — how much each counts toward a job&apos;s score
              </label>
              {profile.skills.map((skill) => (
                <div key={skill} className="flex items-center gap-3">
                  <span className="text-sm text-white/70 w-32 truncate flex-shrink-0">{skill}</span>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={profile.skill_weights[skill] ?? 10}
                    onChange={(e) => setSkillWeight(skill, parseInt(e.target.value, 10))}
                    className="flex-1 accent-accent-green"
                  />
                  <span className="text-xs font-mono text-white/40 w-6 text-right">
                    {profile.skill_weights[skill] ?? 10}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 5. Job Sources */}
        <Section title="Job Sources">
          <p className="text-xs text-white/40 -mt-1 mb-1">
            Uncheck a source to skip it entirely when finding new jobs.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ALL_SOURCES.map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-bg cursor-pointer hover:border-accent-green/30 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={profile.enabled_sources.includes(key)}
                  onChange={() => toggleSource(key)}
                  className="accent-accent-green"
                />
                <span className="text-sm text-white/75">{label}</span>
              </label>
            ))}
          </div>
        </Section>

        {/* 6. Scoring Priorities */}
        <Section title="Scoring Priorities">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-white/40 uppercase tracking-wider">Salary Match Weight</label>
              <span className="text-xs font-mono text-white/40">{profile.salary_weight}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={profile.salary_weight}
              onChange={(e) => set('salary_weight', parseInt(e.target.value, 10))}
              className="w-full accent-accent-green"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-white/40 uppercase tracking-wider">Location Match Weight</label>
              <span className="text-xs font-mono text-white/40">{profile.location_weight}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={profile.location_weight}
              onChange={(e) => set('location_weight', parseInt(e.target.value, 10))}
              className="w-full accent-accent-green"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-white/40 uppercase tracking-wider">
                Minimum Score to Apply
              </label>
              <span className="text-xs font-mono text-white/40">{profile.min_score_threshold}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={profile.min_score_threshold}
              onChange={(e) => set('min_score_threshold', parseInt(e.target.value, 10))}
              className="w-full accent-accent-green"
            />
            <p className="text-xs text-white/30 mt-1">
              Jobs scoring below this need an explicit override before you can generate a CV/apply.
            </p>
          </div>
        </Section>

        {/* 7. Job Preferences */}
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
            placeholder="Remote, Bangalore, Mumbai…"
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

        {/* 8. Email Sending */}
        <Section title="Email Sending">
          <p className="text-xs text-white/40 -mt-1">
            Used to send job applications from your own address. Create a Gmail{' '}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noreferrer"
              className="text-accent-green underline underline-offset-2"
            >
              App Password
            </a>{' '}
            (needs 2-Step Verification on) — regular Gmail passwords won&apos;t work here.
          </p>
          <Field
            label="Gmail Address"
            value={profile.smtp_email}
            onChange={(v) => set('smtp_email', v)}
            placeholder="you@gmail.com"
          />
          <Field
            label="App Password"
            value={profile.smtp_app_password}
            onChange={(v) => set('smtp_app_password', v)}
            type="password"
            placeholder={profile.smtp_app_password_set ? '•••••••• (set — enter a new one to change)' : 'xxxx xxxx xxxx xxxx'}
          />
        </Section>

        {/* 9. Telegram Alerts */}
        <Section title="Telegram Alerts">
          <p className="text-xs text-white/40 -mt-1">
            Get new job matches pushed to Telegram — reply &quot;applied&quot; or &quot;skip&quot;
            to any alert to update the tracker, right from your phone.
          </p>
          {telegramError && <p className="text-xs text-accent-pink">{telegramError}</p>}
          <div className="flex items-center gap-3">
            <TelegramLogo size={20} weight="fill" className="text-[#2AABEE] shrink-0" />
            {profile.telegram_chat_id ? (
              <>
                <span className="text-sm text-accent-green flex-1">Connected</span>
                <button
                  onClick={handleTelegramDisconnect}
                  disabled={telegramBusy}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-white/60 border border-border hover:bg-white/10 transition-colors"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-white/40 flex-1">Not connected</span>
                <button
                  onClick={handleTelegramConnect}
                  disabled={telegramBusy}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-green/10 text-accent-green border border-accent-green/25 hover:bg-accent-green/20 transition-colors"
                >
                  {telegramConnectUrl ? 'Reopen link' : 'Connect Telegram'}
                </button>
                <button
                  onClick={refreshTelegramStatus}
                  disabled={telegramBusy}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-white/60 border border-border hover:bg-white/10 transition-colors"
                >
                  I&apos;ve connected
                </button>
              </>
            )}
          </div>
        </Section>

        {/* 10. Automation */}
        <Section title="Automation">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-white/70">Daily auto-find</p>
              <p className="text-xs text-white/35">
                Finds new jobs automatically once a day, no need to click Find Jobs. Connect
                Telegram above to get instant alerts for your best new matches — without it,
                new jobs still get scraped and scored, just wait until you open the dashboard.
              </p>
            </div>
            <button
              onClick={() => set('auto_find_enabled', !profile.auto_find_enabled)}
              className={clsx(
                'relative w-11 h-6 rounded-full transition-colors shrink-0',
                profile.auto_find_enabled ? 'bg-accent-green/60' : 'bg-white/10'
              )}
            >
              <span
                className={clsx(
                  'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                  profile.auto_find_enabled ? 'translate-x-5' : 'translate-x-0.5'
                )}
              />
            </button>
          </div>
        </Section>

        {/* 11. Current Offer */}
        <Section title="Current Offer">
          <Field
            label="Offer Details"
            value={profile.current_offer}
            onChange={(v) => set('current_offer', v)}
            placeholder="Acme Corp, 7 LPA"
          />
        </Section>

        {/* 12. Danger Zone */}
        <Section title="Danger Zone">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-white/70">Export all my data</p>
              <p className="text-xs text-white/35">Every row this account owns, as one JSON file.</p>
            </div>
            <button
              onClick={() => api.exportAllData()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-white/60 border border-border hover:bg-white/10 transition-colors"
            >
              <DownloadSimple size={14} />
              Export
            </button>
          </div>

          <div className="h-px bg-border" />

          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm text-accent-pink">Delete account</p>
              <p className="text-xs text-white/35">
                Permanently deletes every job, application, resume, and setting tied to this
                account. This cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder='Type "DELETE" to confirm'
                className="rounded-xl border border-border bg-bg px-3 py-2 text-sm text-white/85 placeholder-white/20 outline-none focus:border-accent-pink/40 transition-colors duration-150 font-mono"
              />
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                  deleteConfirmText === 'DELETE' && !deleting
                    ? 'bg-accent-pink/10 text-accent-pink border border-accent-pink/30 hover:bg-accent-pink/20'
                    : 'bg-white/5 text-white/25 border border-border cursor-not-allowed'
                )}
              >
                {deleting ? <CircleNotch size={14} className="animate-spin" /> : <Trash size={14} />}
                {deleting ? 'Deleting…' : 'Delete my account'}
              </button>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
