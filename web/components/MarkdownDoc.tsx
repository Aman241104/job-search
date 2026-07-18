'use client';

import Link from 'next/link';
import { ArrowLeft } from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MarkdownDoc({ title, subtitle, markdown }: { title: string; subtitle: string; markdown: string }) {
  return (
    <div className="min-h-screen pb-24 md:pb-8 px-6 md:px-8 py-6">
      <div className="max-w-3xl mx-auto">
        <Link href="/docs" className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/40 hover:text-accent-green transition-colors mb-6">
          <ArrowLeft size={14} /> All docs
        </Link>
        <h1 className="text-2xl font-bold text-white/90 mb-1">{title}</h1>
        <p className="text-white/40 text-sm mb-8">{subtitle}</p>
        <article className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
