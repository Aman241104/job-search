'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { ArrowsClockwise, Check, CircleNotch, Copy, LinkedinLogo, EnvelopeSimple, Lightbulb, ChatsCircle, BookOpenText, Question, MagnifyingGlass, Warning } from '@phosphor-icons/react';
import { api, FormAnswers, FollowupDraft, PrepPack } from '@/lib/api';

// Text lands in job-board forms: never leading/trailing whitespace per line.
const tidy = (s: string) => s.split('\n').map((l) => l.trim()).join('\n').trim();

function CopyBlock({ label, text, hint }: { label: string; text: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  const copy = async () => {
    await navigator.clipboard.writeText(tidy(text));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-xl border border-border bg-white/[0.03]">
      <div className="flex items-center justify-between px-3 pt-2.5">
        <p className="text-[11px] font-semibold text-white/50">{label}</p>
        <button
          onClick={copy}
          className={clsx(
            'flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors',
            copied ? 'text-accent-green bg-accent-green/10' : 'text-white/45 hover:text-white/80 hover:bg-white/5'
          )}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="px-3 pb-3 pt-1 text-xs text-white/80 whitespace-pre-wrap leading-relaxed">{tidy(text)}</p>
      {hint && <p className="px-3 pb-2.5 -mt-1 text-[10px] text-white/30">{hint}</p>}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-white/40 py-6 justify-center">
      <CircleNotch size={14} className="animate-spin" /> {label}
    </div>
  );
}

// ── Form answers ─────────────────────────────────────────────────────────────

export function FormAnswersSection({ jobId }: { jobId: string }) {
  const [data, setData] = useState<FormAnswers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = (refresh = false) => {
    setLoading(true);
    setError('');
    api.formAnswers(jobId, refresh)
      .then(setData)
      .catch(() => setError('Could not generate answers — try again.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Loading label="Writing answers for this job's application form…" />;
  if (error && !data) return <p className="text-xs text-accent-pink py-4">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40">Answers for the questions application forms usually ask.</p>
        <button onClick={() => load(true)} disabled={loading}
          className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 disabled:opacity-40">
          <ArrowsClockwise size={12} className={loading ? 'animate-spin' : ''} /> Rewrite
        </button>
      </div>
      {data.removed_claims?.length > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-accent-yellow bg-accent-yellow/10 rounded-lg px-2.5 py-1.5">
          <Warning size={12} className="mt-0.5 flex-shrink-0" />
          Removed skills you don&apos;t have from the AI draft: {data.removed_claims.join(', ')}
        </p>
      )}
      <CopyBlock label="Why should you be hired for this role?" text={data.why_hire} hint="Also works as a short cover letter" />
      <CopyBlock label="Portfolio / work samples" text={data.work_samples} />
      <CopyBlock label="Links" text={data.links} />
      <CopyBlock label="Experience" text={data.experience} />
      <CopyBlock label="Availability / notice period" text={data.availability} />
      <CopyBlock label="Expected CTC" text={data.expected_ctc} />
      <CopyBlock label="Education" text={data.education} />
      <CopyBlock label="Location / relocation" text={data.location} />
      <CopyBlock label="Contact" text={data.contact} />
    </div>
  );
}

// ── Follow-up ────────────────────────────────────────────────────────────────

export function FollowupSection({ jobId }: { jobId: string }) {
  const [data, setData] = useState<FollowupDraft | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.followupDraft(jobId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white/60">No reply yet?</p>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/10 disabled:opacity-50">
          {loading ? <CircleNotch size={12} className="animate-spin" /> : <ChatsCircle size={12} />}
          {data ? 'Redraft follow-up' : 'Draft a follow-up'}
        </button>
      </div>
      {data && (
        <>
          <CopyBlock label="LinkedIn note (to a recruiter or engineer there)" text={data.linkedin_note} />
          <CopyBlock label="Email" text={data.email} />
          <div className="flex gap-3 text-[11px] text-white/35">
            <span className="flex items-center gap-1"><LinkedinLogo size={12} /> Find people via the Overview tab&apos;s contact search</span>
            <span className="flex items-center gap-1"><EnvelopeSimple size={12} /> Send from your own inbox</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Interview prep ───────────────────────────────────────────────────────────

export function PrepSection({ jobId }: { jobId: string }) {
  const [data, setData] = useState<PrepPack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openQ, setOpenQ] = useState<number | null>(0);

  const load = (refresh = false) => {
    setLoading(true);
    setError('');
    api.prepPack(jobId, refresh)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Prep pack failed'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Loading label="Building your prep pack from this job description…" />;
  if (error && !data) {
    return (
      <div className="py-4 space-y-2">
        <p className="text-xs text-accent-pink">{error}</p>
        <button onClick={() => load(true)} className="text-xs text-accent-cyan hover:underline">Try again</button>
      </div>
    );
  }
  if (!data) return null;

  const List = ({ icon: Icon, title, items }: { icon: typeof Lightbulb; title: string; items: string[] }) =>
    items?.length ? (
      <div>
        <p className="flex items-center gap-1.5 text-xs font-semibold text-white/60 mb-1.5"><Icon size={13} />{title}</p>
        <ul className="space-y-1">
          {items.map((t, i) => <li key={i} className="text-xs text-white/70 pl-4 relative before:content-['•'] before:absolute before:left-1 before:text-white/30">{t}</li>)}
        </ul>
      </div>
    ) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40">Built from this job description, your resume and your story bank.</p>
        <button onClick={() => load(true)} disabled={loading}
          className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 disabled:opacity-40">
          <ArrowsClockwise size={12} className={loading ? 'animate-spin' : ''} /> Rebuild
        </button>
      </div>

      <div>
        <p className="flex items-center gap-1.5 text-xs font-semibold text-white/60 mb-2"><Question size={13} />Likely questions</p>
        <div className="space-y-1.5">
          {data.likely_questions.map((q, i) => (
            <div key={i} className="rounded-xl border border-border bg-white/[0.03]">
              <button onClick={() => setOpenQ(openQ === i ? null : i)} className="w-full text-left px-3 py-2.5 text-xs font-medium text-white/85">
                {q.question}
              </button>
              {openQ === i && (
                <div className="px-3 pb-3 space-y-1.5">
                  <p className="text-[11px] text-white/35 italic">{q.why_they_ask}</p>
                  <p className="text-xs text-white/70 whitespace-pre-wrap">{q.answer_outline}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <List icon={BookOpenText} title="Revise before the interview" items={data.topics_to_revise} />
      {data.stories_to_use?.length > 0 && (
        <List icon={Lightbulb} title="Stories from your bank to use" items={data.stories_to_use.map((s) => s.use_for)} />
      )}
      <List icon={ChatsCircle} title="Questions to ask them" items={data.questions_to_ask_them} />
      <List icon={MagnifyingGlass} title="Research the company" items={data.company_research} />
    </div>
  );
}
