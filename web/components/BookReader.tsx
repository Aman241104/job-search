'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Send, Loader2 } from 'lucide-react';
import { api, LearningBook, BookPage } from '@/lib/api';
import { useToast } from './Toast';

interface BookReaderProps {
  book: LearningBook | null;
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}

export default function BookReader({ book }: BookReaderProps) {
  const [pageNum, setPageNum] = useState(1);
  const [page, setPage] = useState<BookPage | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const { toast } = useToast();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!book) return;
    setPageNum(book.current_page || 1);
    setChatMessages([]);
  }, [book?.id]);

  useEffect(() => {
    if (!book) return;
    setLoadingPage(true);
    setChatMessages([]);
    api
      .getBookPage(book.id, pageNum)
      .then(setPage)
      .catch(() => toast('Failed to load page', 'error'))
      .finally(() => setLoadingPage(false));
  }, [book?.id, pageNum]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSummarize = async () => {
    if (!book || !page) return;
    setSummarizing(true);
    try {
      const res = await api.summarizeBookPage(book.id, pageNum);
      setPage({ ...page, summary: res.summary });
    } catch {
      toast('Failed to summarize page', 'error');
    } finally {
      setSummarizing(false);
    }
  };

  const handleSend = async () => {
    if (!book || !chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      const res = await api.bookChat(book.id, pageNum, msg);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: res.response }]);
    } catch {
      toast('Failed to send message', 'error');
    } finally {
      setChatLoading(false);
    }
  };

  if (!book) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <div className="text-4xl mb-4">📄</div>
          <p className="text-white/40 text-sm">Select a book, or upload a PDF to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
        <div>
          <h3 className="font-semibold text-white/90 text-sm">{book.title}</h3>
          <p className="text-xs text-white/35">
            Page {pageNum} of {book.page_count}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            disabled={pageNum <= 1}
            className="p-1.5 rounded-lg border border-border text-white/50 hover:text-white/80 disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setPageNum((p) => Math.min(book.page_count, p + 1))}
            disabled={pageNum >= book.page_count}
            className="p-1.5 rounded-lg border border-border text-white/50 hover:text-white/80 disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {loadingPage ? (
          <div className="skeleton h-40 rounded-xl" />
        ) : (
          <>
            <div className="bg-bg-2 border border-border rounded-xl p-4">
              <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
                {page?.text || '(No extractable text on this page.)'}
              </p>
            </div>

            <div>
              <button
                onClick={handleSummarize}
                disabled={summarizing}
                className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg bg-accent-purple/10 border border-accent-purple/30 text-accent-purple hover:bg-accent-purple/15 transition-all disabled:opacity-50"
              >
                {summarizing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {page?.summary ? 'Regenerate summary' : 'Summarize this page'}
              </button>
              {page?.summary && (
                <div
                  className="mt-3 bg-accent-purple/5 border border-accent-purple/15 rounded-xl p-4 text-sm text-white/70 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(page.summary) }}
                />
              )}
            </div>

            {chatMessages.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-border">
                {chatMessages.map((m, i) => (
                  <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div
                      className={
                        m.role === 'user'
                          ? 'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-accent-green/15 border border-accent-green/20 text-white/90'
                          : 'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-bg-3 border border-border text-white/80'
                      }
                    >
                      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                    </div>
                  </div>
                ))}
                {chatLoading && <Loader2 size={14} className="animate-spin text-white/30" />}
                <div ref={chatEndRef} />
              </div>
            )}
          </>
        )}
      </div>

      <div className="px-5 py-4 border-t border-border flex-shrink-0">
        <div className="flex items-center gap-3 bg-bg-3 border border-border rounded-xl px-4 py-2.5">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={chatLoading}
            placeholder="Ask about this page..."
            className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/25 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={chatLoading || !chatInput.trim()}
            className="text-accent-green disabled:text-white/20 p-1"
          >
            {chatLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-[10px] text-white/20 mt-1.5 text-center">
          Answers are grounded only in this page&rsquo;s actual text — not general knowledge
        </p>
      </div>
    </div>
  );
}
