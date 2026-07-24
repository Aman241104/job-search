'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import Link from 'next/link';
import { ArrowRight, CircleNotch } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { ChipEditor, Field, Section } from '@/components/ProfileFields';

export default function OnboardingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const pageRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [locationPreference, setLocationPreference] = useState<string[]>([]);
  const [lpaMin, setLpaMin] = useState('8');
  const [lpaMax, setLpaMax] = useState('12');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill name from the Google account so it's not a blank required field.
  useEffect(() => {
    if (user?.name) setName((prev) => prev || user.name);
  }, [user]);

  useEffect(() => {
    if (!pageRef.current) return;
    gsap.fromTo(
      pageRef.current.querySelectorAll('.onboarding-section'),
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.08, duration: 0.5, ease: 'power3.out' }
    );
  }, []);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.saveProfile({
        name,
        email: user?.email || '',
        skills,
        target_roles: targetRoles,
        location_preference: locationPreference,
        target_lpa: { min: parseInt(lpaMin, 10) || 0, max: parseInt(lpaMax, 10) || 0 },
        onboarding_completed: true,
      });
      router.replace('/dashboard');
    } catch {
      setError('Save failed — check your connection and try again.');
      setSaving(false);
    }
  };

  return (
    <div ref={pageRef} className="max-w-xl mx-auto px-4 py-12">
      <div className="onboarding-section mb-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-green to-accent-cyan mx-auto mb-4 flex items-center justify-center">
          <span className="text-bg font-mono font-bold text-lg">J</span>
        </div>
        <h1 className="text-xl font-semibold text-white/90 mb-2">Welcome, {user?.name?.split(' ')[0] || 'there'}</h1>
        <p className="text-sm text-white/40">
          Quick setup so job matching and scoring work for you specifically. You can change all of this later in Profile.
        </p>
        <Link href="/guide" className="inline-block mt-3 text-xs text-accent-green/70 hover:text-accent-green transition-colors">
          New here? Read the full guide →
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        <Section title="About you">
          <Field label="Name" value={name} onChange={setName} placeholder="Your name" />
        </Section>

        <Section title="Skills">
          <ChipEditor
            label="Technologies & Tools"
            chips={skills}
            onChange={setSkills}
            placeholder="React, TypeScript, Node.js…"
          />
        </Section>

        <Section title="Job Preferences">
          <ChipEditor
            label="Target Roles"
            chips={targetRoles}
            onChange={setTargetRoles}
            placeholder="Frontend Developer, React Developer…"
          />
          <ChipEditor
            label="Location Preference"
            chips={locationPreference}
            onChange={setLocationPreference}
            placeholder="Remote, Bangalore, Mumbai…"
          />
          <div>
            <label className="block text-xs font-mono text-white/40 mb-1.5 uppercase tracking-wider">
              Target LPA (₹)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                value={lpaMin}
                onChange={(e) => setLpaMin(e.target.value)}
                placeholder="8"
                className="w-24 rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-white/85 placeholder-white/20 outline-none focus:border-accent-green/40 transition-colors duration-150 font-mono text-center"
              />
              <span className="text-white/25 font-mono text-sm">—</span>
              <input
                type="number"
                min={0}
                value={lpaMax}
                onChange={(e) => setLpaMax(e.target.value)}
                placeholder="12"
                className="w-24 rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-white/85 placeholder-white/20 outline-none focus:border-accent-green/40 transition-colors duration-150 font-mono text-center"
              />
              <span className="text-white/30 text-xs font-mono">LPA</span>
            </div>
          </div>
        </Section>

        {error && <p className="text-accent-pink text-sm text-center">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={saving || !name.trim()}
          className="onboarding-section flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-accent-green/10 hover:bg-accent-green/20 border border-accent-green/25 text-accent-green text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? <CircleNotch size={16} className="animate-spin" /> : <ArrowRight size={16} />}
          {saving ? 'Setting up…' : 'Finish setup'}
        </button>
      </div>
    </div>
  );
}
