'use client';

import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';
import gsap from 'gsap';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

function SingleToast({
  item,
  onRemove,
}: {
  item: ToastItem;
  onRemove: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    gsap.from(ref.current, {
      x: 120,
      opacity: 0,
      duration: 0.35,
      ease: 'back.out(1.7)',
    });

    const timer = setTimeout(() => {
      if (!ref.current) return;
      gsap.to(ref.current, {
        x: 120,
        opacity: 0,
        duration: 0.25,
        ease: 'power2.in',
        onComplete: () => onRemove(item.id),
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [item.id, onRemove]);

  const handleDismiss = () => {
    if (!ref.current) return;
    gsap.to(ref.current, {
      x: 120,
      opacity: 0,
      duration: 0.25,
      ease: 'power2.in',
      onComplete: () => onRemove(item.id),
    });
  };

  const styles = {
    success: {
      border: 'border-accent-green/30',
      icon: <CheckCircle2 size={16} className="text-accent-green flex-shrink-0 mt-0.5" />,
      glow: 'shadow-[0_0_20px_rgba(99,255,178,0.12)]',
    },
    error: {
      border: 'border-red-500/30',
      icon: <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />,
      glow: 'shadow-[0_0_20px_rgba(239,68,68,0.12)]',
    },
    info: {
      border: 'border-accent-cyan/30',
      icon: <Info size={16} className="text-accent-cyan flex-shrink-0 mt-0.5" />,
      glow: 'shadow-[0_0_20px_rgba(103,232,249,0.12)]',
    },
  };

  const s = styles[item.type];

  return (
    <div
      ref={ref}
      className={`flex items-start gap-3 bg-bg-2 border ${s.border} ${s.glow} rounded-xl px-4 py-3 min-w-[280px] max-w-[380px] pointer-events-auto`}
    >
      {s.icon}
      <span className="text-sm text-white/80 flex-1 leading-relaxed">{item.message}</span>
      <button
        onClick={handleDismiss}
        className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0 mt-0.5"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
        {toasts.map((t) => (
          <SingleToast key={t.id} item={t} onRemove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
