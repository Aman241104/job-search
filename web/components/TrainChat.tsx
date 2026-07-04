'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import clsx from 'clsx';
import { PaperPlaneTilt, CircleNotch, Star, Target, Robot } from '@phosphor-icons/react';
import { api, TrainMessage, TrainTopic } from '@/lib/api';
import { useToast } from './Toast';

interface TrainChatProps {
  topic: TrainTopic | null;
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/\n/g, '<br/>');
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 8 ? 'text-accent-green bg-accent-green/10 border-accent-green/20' :
    score >= 6 ? 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20' :
    'text-accent-pink bg-accent-pink/10 border-accent-pink/20';

  return (
    <span className={clsx('inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ml-2', color)}>
      <Star size={9} />
      {score}/10
    </span>
  );
}

export default function TrainChat({ topic }: TrainChatProps) {
  const [messages, setMessages] = useState<TrainMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [avgScore, setAvgScore] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Animate new messages
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = document.querySelector('.chat-msg:last-child');
    if (!lastMsg) return;
    gsap.from(lastMsg, {
      y: 20,
      opacity: 0,
      duration: 0.35,
      ease: 'power3.out',
    });
  }, [messages.length]);

  const handleStart = async () => {
    if (!topic) return;
    setStarting(true);
    setMessages([]);
    setSessionId(null);
    setAvgScore(null);
    try {
      const session = await api.trainStart(topic.key);
      setSessionId(session.session_id);
      setMessages([
        {
          role: 'assistant',
          content: session.message || `Welcome to **${topic.name}** training! I'll ask you interview questions and give you detailed feedback.\n\nReady? Let's begin.`,
        },
      ]);
      toast(`Started ${topic.name} session`, 'success');
      inputRef.current?.focus();
    } catch {
      toast('Failed to start training session', 'error');
    } finally {
      setStarting(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !sessionId || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await api.trainChat(sessionId, userMsg);
      const aiMsg: TrainMessage = {
        role: 'assistant',
        content: res.response,
        score: res.score,
      };
      setMessages((prev) => [...prev, aiMsg]);

      if (res.score !== undefined) {
        const existingScores = messages
          .filter((m) => m.score !== undefined)
          .map((m) => m.score as number);
        existingScores.push(res.score as number);
        setAvgScore(
          Math.round((existingScores.reduce((a, b) => a + b, 0) / existingScores.length) * 10) / 10
        );
      }
    } catch {
      toast('Failed to send message', 'error');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!topic) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <div className="chip-breathe w-14 h-14 rounded-2xl bg-accent-green/10 text-accent-green flex items-center justify-center mx-auto mb-4">
            <Target size={24} />
          </div>
          <p className="text-white/40 text-sm">Select a topic to start training</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{topic.icon}</span>
          <div>
            <h3 className="font-semibold text-white/90 text-sm">{topic.name}</h3>
            <p className="text-xs text-white/35">{topic.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {avgScore !== null && (
            <div className="flex items-center gap-1.5 bg-bg-3 px-3 py-1.5 rounded-lg border border-border">
              <Star size={12} className="text-accent-yellow" />
              <span className="text-xs font-mono text-accent-yellow font-bold">
                {avgScore}/10
              </span>
              <span className="text-xs text-white/30">avg</span>
            </div>
          )}
          <button
            onClick={handleStart}
            disabled={starting}
            className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl bg-accent-purple/10 border border-accent-purple/30 text-accent-purple hover:bg-accent-purple/15 transition-all duration-150 disabled:opacity-50"
          >
            {starting ? (
              <>
                <CircleNotch size={12} className="animate-spin" />
                Starting...
              </>
            ) : sessionId ? (
              'Restart'
            ) : (
              'Start Session'
            )}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <div className="text-3xl mb-3">{topic.icon}</div>
              <p className="text-white/40 text-sm mb-1">Ready to practice {topic.name}?</p>
              <p className="text-white/25 text-xs">Click &ldquo;Start Session&rdquo; to begin</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={clsx(
              'chat-msg flex',
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            {msg.role === 'assistant' && (
              <div className="mr-2 flex-shrink-0 mt-1">
                <div className="w-6 h-6 rounded-full bg-accent-purple/20 border border-accent-purple/30 flex items-center justify-center">
                  <Robot size={12} className="text-accent-purple" />
                </div>
              </div>
            )}

            <div
              className={clsx(
                'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-accent-green/15 border border-accent-green/20 text-white/90 rounded-tr-md'
                  : 'ai-message bg-bg-3 border border-border text-white/80 rounded-tl-md'
              )}
            >
              {msg.role === 'assistant' ? (
                <div>
                  <div
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                  {msg.score !== undefined && (
                    <div className="mt-2 pt-2 border-t border-white/10 flex items-center">
                      <span className="text-xs text-white/30">Score:</span>
                      <ScoreBadge score={msg.score} />
                    </div>
                  )}
                </div>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-msg flex justify-start">
            <div className="mr-2 flex-shrink-0 mt-1">
              <div className="w-6 h-6 rounded-full bg-accent-purple/20 border border-accent-purple/30 flex items-center justify-center">
                <Robot size={12} className="text-accent-purple" />
              </div>
            </div>
            <div className="bg-bg-3 border border-border rounded-2xl rounded-tl-md px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-5 py-4 border-t border-border flex-shrink-0">
        <div className="flex items-center gap-3 bg-bg-3 border border-border rounded-xl px-4 py-2.5">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!sessionId || loading}
            placeholder={
              !sessionId
                ? 'Start a session first...'
                : loading
                ? 'Waiting for response...'
                : 'Type your answer...'
            }
            className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/25 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!sessionId || loading || !input.trim()}
            className="text-accent-green disabled:text-white/20 transition-colors hover:text-accent-green/80 p-1"
          >
            {loading ? (
              <CircleNotch size={16} className="animate-spin" />
            ) : (
              <PaperPlaneTilt size={16} />
            )}
          </button>
        </div>
        <p className="text-[10px] text-white/20 mt-1.5 text-center">
          Press Enter to send &bull; AI evaluates your answers 0&ndash;10
        </p>
      </div>
    </div>
  );
}
