import Link from 'next/link';
import {
  BookOpen,
  GraduationCap,
  ArrowRight,
  Path,
  MagnifyingGlass,
  FileText,
  Database,
  Brain,
  PaperPlaneTilt,
  Sparkle,
} from '@phosphor-icons/react/ssr';

const gettingStarted = [
  {
    href: '/docs/setup',
    icon: BookOpen,
    title: 'Setup Guide',
    description: 'How scripts/setup.py works — every account and key you need, explained step by step.',
  },
];

const howItWorks = [
  {
    href: '/docs/architecture',
    icon: Path,
    title: 'System Architecture',
    description: 'How the frontend, backend, database, and AI providers all connect. Read this one first.',
  },
  {
    href: '/docs/job-finder',
    icon: MagnifyingGlass,
    title: 'Job Finder',
    description: '14 sources, dedup, and the two-phase keyword + AI scoring pipeline.',
  },
  {
    href: '/docs/cv-generator',
    icon: FileText,
    title: 'CV & Cover Letter Generator',
    description: 'How a tailored application gets written, refined, and rendered to PDF.',
  },
  {
    href: '/docs/tracker',
    icon: Database,
    title: 'Tracker',
    description: 'The database layer — 17-table schema, dual SQLite/Postgres, Excel export.',
  },
  {
    href: '/docs/trainer',
    icon: Brain,
    title: 'Interview Trainer',
    description: '8 topics, multi-turn scored coaching, and where sessions get saved.',
  },
  {
    href: '/docs/apply',
    icon: PaperPlaneTilt,
    title: 'Applying',
    description: 'Single-job and batch apply across email, Telegram, and browser pre-fill.',
  },
  {
    href: '/docs/extras',
    icon: Sparkle,
    title: 'Legitimacy, Contacts, Stories & Books',
    description: 'Posting legitimacy check, contact discovery, the STAR story bank, and the PDF book library.',
  },
  {
    href: '/docs/learning',
    icon: GraduationCap,
    title: 'How the Playlists Feature Works',
    description: 'A deep dive into the YouTube playlist study RAG pipeline — ingest, chunking, embeddings, FAISS, and the ask flow.',
  },
];

function DocList({ docs }: { docs: typeof howItWorks }) {
  return (
    <div className="space-y-3">
      {docs.map(({ href, icon: Icon, title, description }) => (
        <Link
          key={href}
          href={href}
          className="group flex items-start gap-4 px-5 py-4 rounded-xl border border-border bg-bg-1 hover:border-accent-green/30 transition-all duration-150"
        >
          <div className="w-9 h-9 rounded-lg bg-accent-green/10 border border-accent-green/30 flex items-center justify-center flex-shrink-0">
            <Icon size={18} className="text-accent-green" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-white/90">{title}</h2>
            <p className="text-xs text-white/40 mt-1 leading-relaxed">{description}</p>
          </div>
          <ArrowRight size={16} className="text-white/20 group-hover:text-accent-green group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1.5" />
        </Link>
      ))}
    </div>
  );
}

export default function DocsIndexPage() {
  return (
    <div className="min-h-screen pb-24 md:pb-8 px-6 md:px-8 py-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-white/90 mb-1">Docs</h1>
        <p className="text-white/40 text-sm mb-8">Written guides for this project.</p>

        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Getting Started</h3>
        <DocList docs={gettingStarted} />

        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 mt-8">How It Works</h3>
        <DocList docs={howItWorks} />
      </div>
    </div>
  );
}
