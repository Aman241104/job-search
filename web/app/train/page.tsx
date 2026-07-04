'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Target, PuzzlePiece, CubeTransparent, Handshake, Atom, HardDrives, Terminal, Database, Users, Palette, CurrencyInr, BookOpen, Icon } from '@phosphor-icons/react';
import TrainChat from '@/components/TrainChat';
import { ToastProvider } from '@/components/Toast';
import { api, TrainTopic, TrainProgress } from '@/lib/api';
import clsx from 'clsx';

const FALLBACK_TOPICS: TrainTopic[] = [
  { key: 'dsa', name: 'Data Structures & Algorithms', description: 'Arrays, trees, graphs, dynamic programming', icon: '' },
  { key: 'system_design', name: 'System Design', description: 'Scalable architecture, databases, caching', icon: '' },
  { key: 'behavioral', name: 'Behavioral (STAR)', description: 'Situational questions using STAR method', icon: '' },
  { key: 'frontend', name: 'Frontend Dev', description: 'React, TypeScript, CSS, performance', icon: '' },
  { key: 'backend', name: 'Backend Dev', description: 'APIs, databases, microservices, Node/Python', icon: '' },
  { key: 'python', name: 'Python', description: 'Language features, OOP, frameworks, best practices', icon: '' },
  { key: 'sql', name: 'SQL & Databases', description: 'Queries, indexing, transactions, optimization', icon: '' },
  { key: 'hr', name: 'HR & Culture Fit', description: 'Salary negotiation, career goals, teamwork', icon: '' },
];

// Topics come from the backend and its `icon` field is a raw emoji string —
// mapped here to lucide icons instead, keyword-matched against the topic's
// name (its `key` is just a numeric ID, not a semantic slug) so emoji never
// render in the UI.
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

export default function TrainPage() {
  const [topics, setTopics] = useState<TrainTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<TrainTopic | null>(null);
  const [progress, setProgress] = useState<TrainProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const topicsRef = useRef<HTMLDivElement>(null);

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

  return (
    <ToastProvider>
      <div className="min-h-screen pb-24 md:pb-8 flex flex-col">
        {/* Header */}
        <div className="px-6 md:px-8 py-6 border-b border-border">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white/90 mb-1">Interview Trainer</h1>
              <p className="text-white/35 text-sm">
                Practice with AI. Get scored. Ace your interviews.
              </p>
            </div>

            {progress && (
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="font-mono text-xl font-bold text-accent-green">
                    {progress.avg_score.toFixed(1)}
                  </div>
                  <div className="text-xs text-white/35">avg score</div>
                </div>
                <div className="text-center">
                  <div className="font-mono text-xl font-bold text-accent-purple">
                    {progress.sessions_completed}
                  </div>
                  <div className="text-xs text-white/35">sessions</div>
                </div>
                <div className="text-center">
                  <div className="font-mono text-xl font-bold text-accent-cyan">
                    {progress.total_messages}
                  </div>
                  <div className="text-xs text-white/35">answers</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main grid */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          {/* Topics panel */}
          <div
            ref={topicsRef}
            className="md:w-80 xl:w-96 border-r border-border flex-shrink-0 overflow-y-auto"
          >
            <div className="p-4">
              <p className="text-xs font-medium text-white/35 uppercase tracking-wider mb-3 px-2">
                Practice Topics
              </p>

              {loading ? (
                <div className="space-y-2">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="skeleton h-16 rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {topics.map((topic) => {
                    const isActive = selectedTopic?.key === topic.key;
                    const isCovered = progress?.topics_covered?.includes(topic.key);

                    return (
                      <button
                        key={topic.key}
                        onClick={() => setSelectedTopic(topic)}
                        className={clsx(
                          'topic-card w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-xl border transition-all duration-150',
                          isActive
                            ? 'bg-accent-green/10 border-accent-green/25 text-white/90'
                            : 'bg-bg-2 border-border text-white/60 hover:border-white/10 hover:text-white/80'
                        )}
                      >
                        {(() => {
                          const Icon = topicIcon(topic.name);
                          return (
                            <span
                              className={clsx(
                                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                                isActive ? 'bg-accent-green/15 text-accent-green' : 'bg-white/5 text-white/40'
                              )}
                            >
                              <Icon size={15} />
                            </span>
                          );
                        })()}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={clsx(
                                'text-sm font-medium leading-tight',
                                isActive && 'text-white/95'
                              )}
                            >
                              {topic.name}
                            </span>
                            {isCovered && (
                              <span className="w-1.5 h-1.5 rounded-full bg-accent-green flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-white/30 mt-0.5 leading-relaxed">
                            {topic.description}
                          </p>
                        </div>
                        {isActive && (
                          <div className="w-1 h-8 rounded-full bg-accent-green flex-shrink-0 self-center" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tips */}
            <div className="p-4 border-t border-border mx-4 mb-4">
              <div className="bg-bg-2 rounded-xl p-4 border border-border space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-white/50">
                  <Target size={12} className="text-accent-yellow" />
                  Pro Tips
                </div>
                <ul className="text-xs text-white/30 space-y-1.5">
                  <li>• Use the STAR method for behavioral questions</li>
                  <li>• Think aloud when solving DSA problems</li>
                  <li>• Ask clarifying questions before answering</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Chat panel */}
          <div className="flex-1 flex flex-col min-h-0 min-h-[500px]">
            <TrainChat topic={selectedTopic} />
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
