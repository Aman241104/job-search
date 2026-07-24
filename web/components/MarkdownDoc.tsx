'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import SmoothScroll from '@/components/SmoothScroll';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export default function MarkdownDoc({
  title,
  subtitle,
  markdown,
  backHref = '/docs',
  backLabel = 'All docs',
}: {
  title: string;
  subtitle: string;
  markdown: string;
  backHref?: string;
  backLabel?: string;
}) {
  const articleRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  // Scroll-progress bar — a real, low-risk use of ScrollTrigger's scrub for
  // long-form reading pages (docs/guide are the only pages this long).
  useEffect(() => {
    if (!articleRef.current) return;
    const st = ScrollTrigger.create({
      trigger: articleRef.current,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => setProgress(self.progress),
    });
    return () => st.kill();
  }, []);

  return (
    <SmoothScroll>
      <div className="fixed top-0 left-0 right-0 h-0.5 bg-transparent z-50">
        <div
          className="h-full bg-accent-green transition-[width] duration-100 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div ref={articleRef} className="min-h-screen pb-24 md:pb-8 px-6 md:px-8 py-6">
        <div className="max-w-3xl mx-auto">
          <Link href={backHref} className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/40 hover:text-accent-green transition-colors mb-6">
            <ArrowLeft size={14} /> {backLabel}
          </Link>
          <h1 className="text-2xl font-bold text-white/90 mb-1">{title}</h1>
          <p className="text-white/40 text-sm mb-8">{subtitle}</p>
          <article className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          </article>
        </div>
      </div>
    </SmoothScroll>
  );
}
