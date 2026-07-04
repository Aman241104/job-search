'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import clsx from 'clsx';
import { PaperPlaneTilt, CircleNotch, GraduationCap } from '@phosphor-icons/react';
import { api, LearningItem, LearningMessage } from '@/lib/api';
import { useToast } from './Toast';

interface LearningChatProps {
  item: LearningItem | null;
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/\n/g, '<br/>');
}

export default function LearningChat({ item }: LearningChatProps) {
  const [messages, setMessages] = useState<LearningMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = document.querySelector('.learning-msg:last-child');
    if (!lastMsg) return;
    gsap.from(lastMsg, { y: 20, opacity: 0, duration: 0.35, ease: 'power3.out' });
  }, [messages.length]);

  // Auto-open the tutor for the selected item — backend auto-generates a
  // topic breakdown on first-ever open for that item (empty message signals that).
  useEffect(() => {
    if (!item) return;
    setMessages([]);
    setOpening(true);
    api
      .learningChat(item.id, '')
      .then((res) => {
        setMessages([{ role: 'assistant', content: res.response }]);
      })
      .catch(() => toast('Failed to load tutor for this topic', 'error'))
      .finally(() => {
        setOpening(false);
        inputRef.current?.focus();
      });
  }, [item?.id]);

  const handleSend = async () => {
    if (!input.trim() || !item || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    try {
      const res = await api.learningChat(item.id, userMsg);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.response }]);
    } catch {
      toast('Failed to send message', 'error');
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
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

  if (!item) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <div className="chip-breathe w-14 h-14 rounded-2xl bg-accent-green/10 text-accent-green flex items-center justify-center mx-auto mb-4">
            <GraduationCap size={24} />
          </div>
          <p className="text-white/40 text-sm">Select a book or course to start learning</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
        <div>
          <h3 className="font-semibold text-white/90 text-sm">{item.title}</h3>
          <p className="text-xs text-white/35 capitalize">{item.item_type} tutor</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {opening && messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <CircleNotch size={20} className="animate-spin mx-auto mb-2 text-white/30" />
              <p className="text-white/30 text-xs">Loading topic breakdown...</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={clsx('learning-msg flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            {msg.role === 'assistant' && (
              <div className="mr-2 flex-shrink-0 mt-1">
                <div className="w-6 h-6 rounded-full bg-accent-purple/20 border border-accent-purple/30 flex items-center justify-center">
                  <GraduationCap size={12} className="text-accent-purple" />
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
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="learning-msg flex justify-start">
            <div className="mr-2 flex-shrink-0 mt-1">
              <div className="w-6 h-6 rounded-full bg-accent-purple/20 border border-accent-purple/30 flex items-center justify-center">
                <GraduationCap size={12} className="text-accent-purple" />
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

      <div className="px-5 py-4 border-t border-border flex-shrink-0">
        <div className="flex items-center gap-3 bg-bg-3 border border-border rounded-xl px-4 py-2.5">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={opening || loading}
            placeholder={loading ? 'Waiting for response...' : 'Ask about any topic in this book/course...'}
            className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/25 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={opening || loading || !input.trim()}
            className="text-accent-green disabled:text-white/20 transition-colors hover:text-accent-green/80 p-1"
          >
            {loading ? <CircleNotch size={16} className="animate-spin" /> : <PaperPlaneTilt size={16} />}
          </button>
        </div>
        <p className="text-[10px] text-white/20 mt-1.5 text-center">
          FAQ-style tutor — ask anything about this book/course, press Enter to send
        </p>
      </div>
    </div>
  );
}
