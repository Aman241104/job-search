import Link from 'next/link';
import { BookOpen, GraduationCap, ArrowRight } from '@phosphor-icons/react/ssr';

const docs = [
  {
    href: '/docs/setup',
    icon: BookOpen,
    title: 'Setup Guide',
    description: 'How scripts/setup.py works — every account and key you need, explained step by step.',
  },
  {
    href: '/docs/learning',
    icon: GraduationCap,
    title: 'How the Playlists Feature Works',
    description: 'A deep dive into the YouTube playlist study RAG pipeline — ingest, chunking, embeddings, FAISS, and the ask flow.',
  },
];

export default function DocsIndexPage() {
  return (
    <div className="min-h-screen pb-24 md:pb-8 px-6 md:px-8 py-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-white/90 mb-1">Docs</h1>
        <p className="text-white/40 text-sm mb-8">Written guides for this project.</p>

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
      </div>
    </div>
  );
}
