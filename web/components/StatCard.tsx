'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import clsx from 'clsx';
import { Icon, TrendUp, TrendDown } from '@phosphor-icons/react';

interface StatCardProps {
  label: string;
  value: number;
  icon: Icon;
  color: 'green' | 'pink' | 'purple' | 'cyan' | 'yellow';
  trend?: number;
  suffix?: string;
  loading?: boolean;
}

const colorMap = {
  green: {
    iconBg: 'bg-accent-green/10 border-accent-green/20',
    iconColor: 'text-accent-green',
    glow: 'shadow-[0_0_30px_rgb(var(--accent-green)/0.05)]',
    value: 'text-accent-green',
    trend: 'text-accent-green',
  },
  pink: {
    iconBg: 'bg-accent-pink/10 border-accent-pink/20',
    iconColor: 'text-accent-pink',
    glow: 'shadow-[0_0_30px_rgb(var(--accent-pink)/0.05)]',
    value: 'text-accent-pink',
    trend: 'text-accent-pink',
  },
  purple: {
    iconBg: 'bg-accent-purple/10 border-accent-purple/20',
    iconColor: 'text-accent-purple',
    glow: 'shadow-[0_0_30px_rgb(var(--accent-purple)/0.05)]',
    value: 'text-accent-purple',
    trend: 'text-accent-purple',
  },
  cyan: {
    iconBg: 'bg-accent-cyan/10 border-accent-cyan/20',
    iconColor: 'text-accent-cyan',
    glow: 'shadow-[0_0_30px_rgb(var(--accent-cyan)/0.05)]',
    value: 'text-accent-cyan',
    trend: 'text-accent-cyan',
  },
  yellow: {
    iconBg: 'bg-accent-yellow/10 border-accent-yellow/20',
    iconColor: 'text-accent-yellow',
    glow: 'shadow-[0_0_30px_rgb(var(--accent-yellow)/0.05)]',
    value: 'text-accent-yellow',
    trend: 'text-accent-yellow',
  },
};

export default function StatCard({
  label,
  value,
  icon: Icon,
  color,
  trend,
  suffix = '',
  loading = false,
}: StatCardProps) {
  const [display, setDisplay] = useState(0);
  const objRef = useRef({ value: 0 });
  const c = colorMap[color];

  useEffect(() => {
    if (loading) return;
    objRef.current.value = 0;
    gsap.to(objRef.current, {
      value: value,
      duration: 1.5,
      ease: 'power2.out',
      onUpdate: () => setDisplay(Math.round(objRef.current.value)),
    });
  }, [value, loading]);

  if (loading) {
    return (
      <div className="bg-bg-2 border border-border rounded-2xl p-6">
        <div className="skeleton h-8 w-8 rounded-lg mb-4" />
        <div className="skeleton h-8 w-20 rounded-lg mb-2" />
        <div className="skeleton h-4 w-28 rounded" />
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'card-hover bg-bg-2 border border-border rounded-2xl p-6 relative overflow-hidden',
        c.glow
      )}
    >
      {/* Background accent */}
      <div
        className={clsx(
          'absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-10 pointer-events-none',
          color === 'green' && 'bg-accent-green',
          color === 'pink' && 'bg-accent-pink',
          color === 'purple' && 'bg-accent-purple',
          color === 'cyan' && 'bg-accent-cyan',
          color === 'yellow' && 'bg-accent-yellow'
        )}
      />

      {/* Icon */}
      <div
        className={clsx('w-10 h-10 rounded-xl border flex items-center justify-center mb-4', c.iconBg)}
      >
        <Icon size={18} className={c.iconColor} />
      </div>

      {/* Value */}
      <div className={clsx('font-mono text-3xl font-bold mb-1', c.value)}>
        {display}
        {suffix}
      </div>

      {/* Label + trend */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/40 font-sans">{label}</span>
        {trend !== undefined && (
          <span
            className={clsx(
              'flex items-center gap-1 text-xs font-medium',
              trend >= 0 ? 'text-accent-green' : 'text-accent-pink'
            )}
          >
            {trend >= 0 ? <TrendUp size={12} /> : <TrendDown size={12} />}
            {Math.abs(trend)}
          </span>
        )}
      </div>
    </div>
  );
}
