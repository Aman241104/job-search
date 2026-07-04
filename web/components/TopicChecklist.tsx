'use client';

import { useEffect, useState } from 'react';
import { Check } from '@phosphor-icons/react';
import clsx from 'clsx';
import { api, LearningTopic } from '@/lib/api';
import { useToast } from './Toast';

interface TopicChecklistProps {
  itemId: string;
}

export default function TopicChecklist({ itemId }: TopicChecklistProps) {
  const [topics, setTopics] = useState<LearningTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);
    api
      .getItemTopics(itemId)
      .then(setTopics)
      .catch(() => toast('Failed to load topic checklist', 'error'))
      .finally(() => setLoading(false));
  }, [itemId]);

  const toggle = async (topic: LearningTopic) => {
    setTopics((prev) => prev.map((t) => (t.id === topic.id ? { ...t, covered: !t.covered } : t)));
    try {
      await api.toggleTopic(topic.id);
    } catch {
      toast('Failed to update topic', 'error');
      setTopics((prev) => prev.map((t) => (t.id === topic.id ? { ...t, covered: topic.covered } : t)));
    }
  };

  if (loading) {
    return <div className="px-5 py-3 border-b border-border skeleton h-16 rounded-none" />;
  }

  const coveredCount = topics.filter((t) => t.covered).length;
  const score = topics.length > 0 ? Math.round((coveredCount / topics.length) * 100) : 0;

  return (
    <div className="border-b border-border flex-shrink-0">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-white/50">Zero-to-Hero Coverage</span>
          <span className="text-xs text-white/30">
            {coveredCount}/{topics.length} topics
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-green rounded-full transition-all duration-300"
              style={{ width: `${score}%` }}
            />
          </div>
          <span className="font-mono text-xs font-bold text-accent-green w-9 text-right">{score}/100</span>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-1.5 max-h-64 overflow-y-auto">
          {topics.map((topic) => (
            <button
              key={topic.id}
              onClick={() => toggle(topic)}
              className="w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
            >
              <span
                className={clsx(
                  'w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center transition-colors',
                  topic.covered ? 'bg-accent-green border-accent-green' : 'border-white/20'
                )}
              >
                {!!topic.covered && <Check size={11} className="text-bg" weight="bold" />}
              </span>
              <span className={clsx('text-xs', topic.covered ? 'text-white/40 line-through' : 'text-white/70')}>
                {topic.topic_name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
