'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { motion } from 'framer-motion';
import {
  PuzzlePiece, CubeTransparent, Handshake, Atom, HardDrives, Terminal, Database,
  Users, Palette, CurrencyInr, BookOpen, Icon, Sparkle, Brain,
} from '@phosphor-icons/react';
import TrainChat from '@/components/TrainChat';
import { ToastProvider } from '@/components/Toast';
import { api, TrainTopic, TrainProgress } from '@/lib/api';
import AnimatedCounter from '@/components/AnimatedCounter';
import clsx from 'clsx';

const FALLBACK_TOPICS: TrainTopic[] = [
  { key: '1', name: 'Technical - React/JS/TS', description: 'React hooks, Next.js SSR/SSG, TypeScript, performance', icon: '' },
  { key: '2', name: 'Technical - Node.js/Backend', description: 'REST APIs, Express middleware, MongoDB, JWT auth, async/await', icon: '' },
  { key: '3', name: 'DSA - Arrays & Strings', description: 'Two pointers, sliding window, hash maps, sorting', icon: '' },
  { key: '4', name: 'DSA - Trees & Graphs', description: 'BFS, DFS, BST operations, binary tree traversals', icon: '' },
  { key: '5', name: 'System Design Basics', description: 'URL shortener, REST API design, caching, CDN basics', icon: '' },
  { key: '6', name: 'HR & Behavioral (STAR method)', description: 'STAR method, tell me about yourself, failures & growth', icon: '' },
  { key: '7', name: 'Portfolio Walkthrough Practice', description: 'DevEvents, Awwwards Clone, Stock App deep-dives', icon: '' },
  { key: '8', name: 'Salary Negotiation', description: 'TCS 7 LPA to 8-12 LPA negotiation at product startups', icon: '' },
];

// Real category grouping over the backend's 8 topic keys (agents/trainer.py's
// TRAINING_TOPICS) — used to roll per-topic real avg scores into the 3
// headline categories, instead of a fabricated confidence percentage.
const TECHNICAL_KEYS = ['1', '2', '3', '4'];
const COMMUNICATION_KEYS = ['6', '7', '8'];
const SYSTEM_DESIGN_KEYS = ['5'];

// Cosmetic "who's interviewing you" flavor — a role-play conceit for the
// chat persona, not a factual claim about a real person. Purely UI chrome.
const INTERVIEWER: Record<string, { name: string; title: string }> = {
  '1': { name: 'Priya Sharma', title: 'Senior Frontend Engineer' },
  '2': { name: 'Rohan Mehta', title: 'Staff Backend Engineer' },
  '3': { name: 'Ananya Rao', title: 'SDE II — Algorithms' },
  '4': { name: 'Karthik Iyer', title: 'SDE II — Data Structures' },
  '5': { name: 'Divya Nair', title: 'Principal Engineer, System Design' },
  '6': { name: 'Neha Kapoor', title: 'Senior HR Business Partner' },
  '7': { name: 'Arjun Malhotra', title: 'Engineering Manager' },
  '8': { name: 'Simran Kaur', title: 'Talent Acquisition Lead' },
};

function topicIcon(name: string): Icon {
  const k = name.toLowerCase();
  if (k.includes('dsa') || k.includes('algo')) return PuzzlePiece;
  if (k.includes('system')) return CubeTransparent;
  if (k.includes('behav') || k.includes('hr') || k.includes('culture')) return Handshake;
  if (k.includes('frontend') || k.includes('react')) return Atom;
  if (k.includes('backend') || k.includes('node') || k.includes('server')) return HardDrives;
  if (k.includes('python')) return Terminal;
  if (k.includes('sql') || k.includes('database')) return Database;
  if (k.includes('salary') || k.includes('negotiat')) return CurrencyInr;
  if (k.includes('portfolio') || k.includes('design')) return Palette;
  if (k.includes('team') || k.includes('people')) return Users;
  return BookOpen;
}

function TopicCard({
  topic, isActive, score, onSelect,
}: {
  topic: TrainTopic; isActive: boolean; score: number | undefined; onSelect: () => void;
}) {
  const Icon = topicIcon(topic.name);
  const tags = topic.description.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 4);

  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ y: -3 }}
      className={clsx(
        'topic-card text-left rounded-2xl border p-5 transition-colors',
        isActive ? 'bg-accent-green/5 border-accent-green/30' : 'bg-bg-2 border-border hover:border-white/15'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <span className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', isActive ? 'bg-accent-green/15 text-accent-green' : 'bg-white/5 text-white/40')}>
          <Icon size={18} />
        </span>
        {score !== undefined ? (
          <span className="text-xs font-mono font-bold text-accent-green">{score}/10</span>
        ) : (
          <span className="text-[10px] text-white/25 uppercase tracking-wide">Not started</span>
        )}
      </div>
      <h3 className="text-sm font-semibold text-white/90 leading-tight mb-2">{topic.name}</h3>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/35">{tag}</span>
        ))}
      </div>
    </motion.button>
  );
}

export default function TrainPage() {
  const [topics, setTopics] = useState<TrainTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<TrainTopic | null>(null);
  const [progress, setProgress] = useState<TrainProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const topicsRef = useRef<HTMLDivElement>(null);

  const loadProgress = () => {
    api.trainProgress().then(setProgress).catch(() => {});
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [topicsData, progressData] = await Promise.allSettled([
          api.trainTopics(),
          api.trainProgress(),
        ]);

        if (topicsData.status === 'fulfilled' && topicsData.value.length > 0) {
          setTopics(topicsData.value);
        } else {
          setTopics(FALLBACK_TOPICS);
        }

        if (progressData.status === 'fulfilled') {
          setProgress(progressData.value);
        }
      } catch {
        setTopics(FALLBACK_TOPICS);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!topicsRef.current || loading) return;
    gsap.fromTo(
      topicsRef.current.querySelectorAll('.topic-card'),
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.06, duration: 0.5, ease: 'power3.out' }
    );
  }, [loading]);

  // ── Real category confidence — averages of real per-topic scores ──
  const categoryScores = useMemo(() => {
    const scores = progress?.topic_scores ?? {};
    const avgOf = (keys: string[]) => {
      const vals = keys.map((k) => scores[k]).filter((v): v is number => v !== undefined);
      return vals.length > 0 ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) : null;
    };
    return {
      technical: avgOf(TECHNICAL_KEYS),
      communication: avgOf(COMMUNICATION_KEYS),
      systemDesign: avgOf(SYSTEM_DESIGN_KEYS),
    };
  }, [progress]);

  const confidenceScore = progress && progress.sessions_completed > 0 ? Math.round(progress.avg_score * 10) : null;

  // ── Real recommended practice — weakest or never-attempted topics ──
  const recommended = useMemo(() => {
    if (topics.length === 0) return [];
    const scores = progress?.topic_scores ?? {};
    const untried = topics.filter((t) => scores[t.key] === undefined);
    if (untried.length > 0) return untried.slice(0, 3);
    return [...topics].sort((a, b) => (scores[a.key] ?? 10) - (scores[b.key] ?? 10)).slice(0, 3);
  }, [topics, progress]);

  return (
    <ToastProvider>
      <div className="min-h-screen pb-24 md:pb-8">
        {/* Header + Confidence hero */}
        <div className="px-6 md:px-8 py-6 border-b border-border">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/50 mb-3">
            <Sparkle size={11} weight="fill" className="text-accent-purple" />
            AI Interview Academy
          </div>
          <h1 className="font-display text-display-sm font-medium text-white/90 mb-1">
            Train like the interview already started.
          </h1>
          <p className="text-white/35 text-sm mb-5">
            Practice with an AI interviewer. Get scored. Walk in ready.
          </p>

          <div className="flex flex-wrap items-center gap-6">
            <div>
              {confidenceScore !== null ? (
                <AnimatedCounter value={confidenceScore} suffix="%" className="block font-mono font-bold text-3xl text-accent-green" />
              ) : (
                <span className="block font-mono font-bold text-3xl text-white/20">—</span>
              )}
              <p className="text-xs text-white/35 mt-0.5">Confidence Score</p>
            </div>
            <div className="w-px h-10 bg-border" />
            <div>
              <p className={clsx('font-mono font-bold text-xl', categoryScores.technical !== null ? 'text-accent-cyan' : 'text-white/20')}>
                {categoryScores.technical ?? '—'}{categoryScores.technical !== null && '%'}
              </p>
              <p className="text-xs text-white/35 mt-0.5">Technical</p>
            </div>
            <div>
              <p className={clsx('font-mono font-bold text-xl', categoryScores.communication !== null ? 'text-accent-yellow' : 'text-white/20')}>
                {categoryScores.communication ?? '—'}{categoryScores.communication !== null && '%'}
              </p>
              <p className="text-xs text-white/35 mt-0.5">Communication</p>
            </div>
            <div>
              <p className={clsx('font-mono font-bold text-xl', categoryScores.systemDesign !== null ? 'text-accent-purple' : 'text-white/20')}>
                {categoryScores.systemDesign ?? '—'}{categoryScores.systemDesign !== null && '%'}
              </p>
              <p className="text-xs text-white/35 mt-0.5">System Design</p>
            </div>
            {progress && progress.sessions_completed > 0 && (
              <>
                <div className="w-px h-10 bg-border" />
                <div>
                  <p className="font-mono font-bold text-xl text-white/60">{progress.sessions_completed}</p>
                  <p className="text-xs text-white/35 mt-0.5">Sessions</p>
                </div>
              </>
            )}
          </div>
        </div>

        {!selectedTopic ? (
          <div className="p-6 md:p-8 space-y-6">
            {recommended.length > 0 && (
              <div className="bg-tint-lavender-95 dark:bg-tint-lavender-20/10 border border-tint-lavender-80/40 dark:border-tint-lavender-30/20 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Brain size={15} className="text-accent-purple" />
                  <h2 className="font-semibold text-white/90 text-sm">Recommended Practice</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recommended.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setSelectedTopic(t)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-bg-2 border border-border text-white/60 hover:border-accent-purple/30 hover:text-white/85 transition-colors"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-white/35 uppercase tracking-wider mb-3">
                What are we training today?
              </p>
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="skeleton h-32 rounded-2xl" />
                  ))}
                </div>
              ) : (
                <div ref={topicsRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {topics.map((topic) => (
                    <TopicCard
                      key={topic.key}
                      topic={topic}
                      isActive={false}
                      score={progress?.topic_scores?.[topic.key]}
                      onSelect={() => setSelectedTopic(topic)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-[600px]">
            <div className="px-6 md:px-8 pt-4">
              <button
                onClick={() => setSelectedTopic(null)}
                className="text-xs text-white/35 hover:text-white/60 transition-colors mb-2"
              >
                ← All topics
              </button>
            </div>
            <TrainChat
              topic={selectedTopic}
              interviewer={INTERVIEWER[selectedTopic.key]}
              onSessionEnd={loadProgress}
            />
          </div>
        )}
      </div>
    </ToastProvider>
  );
}
