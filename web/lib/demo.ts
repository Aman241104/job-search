// Demo mode: /demo turns it on (localStorage), and every api call is answered from the fixtures below instead of the
// backend. No login, no cold start, nothing saved. Recruiters land here from the portfolio.
// Companies and postings are invented (plausible, never real employers or real applications).
import type { Job, JobsResponse, Stats, ResumeMatch, AuthUser } from './api';

export const DEMO_KEY = 'jobsearch-demo';
export const isDemo = (): boolean => {
  try { return typeof window !== 'undefined' && localStorage.getItem(DEMO_KEY) === '1'; } catch { return false; }
};
export const setDemo = (on: boolean) => {
  try { if (on) localStorage.setItem(DEMO_KEY, '1'); else localStorage.removeItem(DEMO_KEY); } catch { /* private mode */ }
};

const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const J = (id: number, title: string, company: string, score: number, location: string, status: Job['status'], salary: string, reason: string, ago: number): Job => ({
  id: `demo-${id}`, title, company, score, location, status, salary, source: ['Remotive', 'Adzuna', 'The Muse', 'Naukri (manual)'][id % 4],
  url: '#', score_reason: reason, starred: id % 5 === 0, date_found: day(ago), date_posted: day(ago + 1),
  date_applied: status === 'found' ? undefined : day(Math.max(0, ago - 1)),
  description: `${company} is hiring a ${title}. You'll build product features end to end with React and Node, work with design on the UI, ship weekly, and own what you ship. Requirements: strong JavaScript/TypeScript, React, REST APIs, Git; Postgres or MongoDB a plus. 0–2 years.`,
});

const JOBS: Job[] = [
  J(1, 'Full Stack Developer (React/Node)', 'Kestrel Labs', 92, 'Ahmedabad (on-site)', 'interviewing', '₹8–11 LPA', 'Stack match: React, Node, Postgres; fresher-friendly; Ahmedabad bonus.', 2),
  J(2, 'Frontend Engineer, Next.js', 'Lumen Commerce', 88, 'Remote (India)', 'applied', '₹9–12 LPA', 'Next.js + TypeScript match; remote; product team.', 3),
  J(3, 'React Developer', 'Saffron Health', 85, 'Ahmedabad (hybrid)', 'applied', '₹7–9 LPA', 'React + REST match; healthcare domain; hybrid.', 4),
  J(4, 'Software Engineer I, Web', 'Tidewater Analytics', 83, 'Remote', 'found', '$18–24k', 'Strong JS match; needs charts (Recharts) which you have.', 1),
  J(5, 'AI Product Engineer (LLM apps)', 'Orbit Ledger', 81, 'Bengaluru / Remote', 'offer', '₹12–14 LPA', 'LLM tooling + React; matches Pulse AI / Job Search OS work.', 9),
  J(6, 'UI Developer, Motion', 'Northgate Studio', 79, 'Ahmedabad (on-site)', 'found', '₹6–8 LPA', 'GSAP + Framer Motion match; studio work.', 1),
  J(7, 'MERN Stack Developer', 'Brightloop Digital', 77, 'Gandhinagar', 'rejected', '₹6–7.5 LPA', 'MongoDB/Express match; asked 1+ yr.', 12),
  J(8, 'Junior Full Stack Engineer', 'Pinecrest Logistics', 74, 'Remote (APAC)', 'ghosted', '₹8 LPA', 'Node + SQL match; logistics dashboards.', 15),
  J(9, 'Frontend Developer (Vue/React)', 'Harbor & Co', 71, 'Pune', 'found', '₹7–9 LPA', 'React match; Vue is a gap.', 2),
  J(10, 'Web Developer, Agency', 'Monsoon Creative', 68, 'Ahmedabad (on-site)', 'found', '₹5–6.5 LPA', 'Agency sites; below salary target.', 3),
  J(11, 'Backend Developer (Python)', 'Quarry Systems', 62, 'Remote', 'skipped', '₹7 LPA', 'FastAPI match but backend-only; 2+ yrs asked.', 6),
  J(12, 'Product Engineer, Growth', 'Fernhill Fintech', 86, 'Ahmedabad (hybrid)', 'found', '₹10–13 LPA', 'Full-stack + experiments; fintech; strong fit.', 0),
];

const STATS: Stats = (() => {
  const c = (s: Job['status']) => JOBS.filter((j) => j.status === s).length;
  return { total: JOBS.length, found: c('found'), applied: c('applied'), interviewing: c('interviewing'), offers: c('offer'), rejected: c('rejected'),
    ghosted: c('ghosted'), avg_score: Math.round(JOBS.reduce((a, j) => a + j.score, 0) / JOBS.length), high_match: JOBS.filter((j) => j.score >= 80).length };
})();

const jobs = (p: Record<string, string | number | boolean> = {}): JobsResponse => {
  let list = JOBS.slice();
  if (p.status) list = list.filter((j) => j.status === p.status);
  if (p.min_score) list = list.filter((j) => j.score >= Number(p.min_score));
  const q = String(p.q || p.search || '').toLowerCase();
  if (q) list = list.filter((j) => `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(q));
  list.sort((a, b) => b.score - a.score);
  const per = Number(p.per_page || 20), page = Number(p.page || 1);
  return { jobs: list.slice((page - 1) * per, page * per), total: list.length, page, per_page: per, total_pages: Math.max(1, Math.ceil(list.length / per)) };
};
const find = (id: string) => JOBS.find((j) => j.id === id) || JOBS[0];

const CV = (j: Job) => `# Aman Patel\nFull-stack developer · Ahmedabad · patelaman0241@gmail.com\n\n## Summary\nFull-stack developer shipping React/Next.js products with Node and Postgres. Tailored for **${j.title}** at **${j.company}**.\n\n## Experience\n**Full Stack Engineer, Gravity Multi Media Marketing** (Jan 2026 – now)\n- Built and maintain 12+ client web apps; REST APIs, auth, reusable components.\n\n## Projects\n- **Job Search OS**: multi-agent job search with two-stage LLM scoring (this app).\n- **Pulse AI**: multi-tenant WhatsApp agent SaaS.\n\n## Skills\nReact, Next.js, TypeScript, Node.js, Express, PostgreSQL, Tailwind, GSAP\n\n_Demo output: generated from sample data._`;

const DEMO_USER: AuthUser = { id: 'demo', email: 'demo@example.com', name: 'Demo visitor', avatar_url: '', created_at: day(30) };

// Methods the demo answers. Anything else rejects with a clear message, which every screen already shows as an error.
const FIXTURES: Record<string, (...a: never[]) => unknown> = {
  me: () => DEMO_USER,
  userProfile: () => ({ onboarding_completed: true, name: 'Demo visitor' }),
  logout: () => { setDemo(false); return { ok: true }; },
  stats: () => STATS,
  jobs: (p: Record<string, string | number | boolean>) => jobs(p),
  job: (id: string) => find(id),
  jobSkillGap: (): ResumeMatch => ({ have: ['React', 'TypeScript', 'Node.js', 'REST APIs', 'Git'], missing: ['Docker'], match_pct: 86,
    add_to_skills: ['Docker'], lead_with: [{ where: 'Projects · Job Search OS', bullet: 'Shipped a multi-agent pipeline with two-stage LLM scoring', skills: ['Node.js', 'LLM'] }] }),
  jobLegitimacy: () => ({ score: 91, flags: [] }),
  jobContact: (id: string) => { const j = find(id); return { search_query: `${j.company} engineering manager`, search_url: '#', message_draft: `Hi, I just applied for the ${j.title} role at ${j.company}. I build React/Node products end to end and would love to talk.` }; },
  apply: (id: string) => { const j = find(id); return { cv: CV(j), cover_letter: `Dear ${j.company} team,\n\nI'd like to apply for the ${j.title} role...\n\n_Demo output._`, cv_path: '', cover_path: '', apply_url: '#' }; },
  cvContent: (id: string) => ({ content: CV(find(id)) }),
  getInterviews: () => ({ rounds: [] }),
  resume: () => ({ name: 'Aman Patel', summary: 'Full-stack developer (demo resume).' }),
  update: () => ({ ok: true }), updateStatus: () => ({ ok: true }), saveNotes: () => ({ ok: true }), starJob: () => ({ starred: true }),
  bulkAction: () => ({ updated: 0 }),
  statsTimeline: () => ({ timeline: Array.from({ length: 14 }, (_, i) => ({ date: day(13 - i), found: 3 + ((i * 7) % 5), applied: (i * 3) % 3 })) }),
  streak: () => ({ streak: 6, today_points: 3, goal: 5, met_today: false, frozen_days: [] }),
  followups: () => ({ jobs: JOBS.filter((j) => j.status === 'applied') }),
};

export function withDemo<T extends object>(real: T): T {
  return new Proxy(real, {
    get(target, key: string) {
      const fn = (target as Record<string, unknown>)[key];
      if (typeof fn !== 'function') return fn;
      return (...args: never[]) => {
        if (!isDemo()) return (fn as (...a: never[]) => unknown)(...args);
        const f = FIXTURES[key];
        if (f) return Promise.resolve(f(...args));
        if (key === 'export' || key === 'exportAllData' || key.startsWith('download')) return undefined;   // sync file actions: no-op
        if (key === 'findStream') return { close() {}, addEventListener() {}, onmessage: null, onerror: null };   // no live search in the demo
        return Promise.reject(new Error('Not part of the demo: sign in to the real app for this.'));
      };
    },
  });
}
