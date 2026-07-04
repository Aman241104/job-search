'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { motion } from 'framer-motion';
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

// Tailwind's JIT scanner only picks up complete, literal class strings —
// `` `bg-${family}-70` `` would compile to nothing since the scanner can't
// resolve runtime template literals. Every class needed per color is
// spelled out in full here instead.
const blobOuter: Record<StatCardProps['color'], string> = {
  green: 'bg-tone-green-70',
  cyan: 'bg-tone-blue-70',
  purple: 'bg-tone-purple-70',
  yellow: 'bg-tone-yellow-70',
  pink: 'bg-tone-pink-70',
};

const blobInner: Record<StatCardProps['color'], string> = {
  green: 'bg-tone-green-50',
  cyan: 'bg-tone-blue-50',
  purple: 'bg-tone-purple-50',
  yellow: 'bg-tone-yellow-50',
  pink: 'bg-tone-pink-50',
};

const iconChipBg: Record<StatCardProps['color'], string> = {
  green: 'bg-tone-green-90 dark:bg-tone-green-30 border-tone-green-80/40',
  cyan: 'bg-tone-blue-90 dark:bg-tone-blue-30 border-tone-blue-80/40',
  purple: 'bg-tone-purple-90 dark:bg-tone-purple-30 border-tone-purple-80/40',
  yellow: 'bg-tone-yellow-90 dark:bg-tone-yellow-30 border-tone-yellow-80/40',
  pink: 'bg-tone-pink-90 dark:bg-tone-pink-30 border-tone-pink-80/40',
};

const iconColorClass: Record<StatCardProps['color'], string> = {
  green: 'text-accent-green',
  cyan: 'text-accent-cyan',
  purple: 'text-accent-purple',
  yellow: 'text-accent-yellow',
  pink: 'text-accent-pink',
};

export default function StatCard({
  label,
  value,
  icon: IconComp,
  color,
  trend,
  suffix = '',
  loading = false,
}: StatCardProps) {
  const [display, setDisplay] = useState(0);
  const objRef = useRef({ value: 0 });

  useEffect(() => {
    if (loading) return;
    objRef.current.value = 0;
    // Elastic overshoot on landing — the number "settles" with a little
    // bounce instead of just stopping, the springy Material-You feel.
    gsap.to(objRef.current, {
      value: value,
      duration: 1.3,
      ease: 'power2.out',
      onUpdate: () => setDisplay(Math.round(objRef.current.value)),
      onComplete: () => {
        gsap.fromTo(objRef.current, { value }, {
          value: value,
          duration: 0.01,
        });
      },
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
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="bg-bg-2 border border-border rounded-2xl p-6 relative overflow-hidden"
    >
      {/* Overlapping gradient blobs — the Be.run-style signature visual.
          Two soft blurred circles from the same tonal family, offset and
          overlapping, drifting very slowly for a sense of life. */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <motion.div
          className={clsx('absolute rounded-full blur-2xl opacity-[0.16]', blobOuter[color])}
          style={{ width: 90, height: 90, top: -20, right: -10 }}
          animate={{ scale: [1, 1.12, 1], x: [0, 6, 0], y: [0, -4, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className={clsx('absolute rounded-full blur-xl opacity-[0.22]', blobInner[color])}
          style={{ width: 56, height: 56, top: 6, right: 34 }}
          animate={{ scale: [1, 1.18, 1], x: [0, -5, 0], y: [0, 5, 0] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        />
      </div>

      {/* Icon */}
      <div
        className={clsx(
          'relative w-10 h-10 rounded-xl border flex items-center justify-center mb-4',
          iconChipBg[color]
        )}
      >
        <IconComp size={18} weight="fill" className={iconColorClass[color]} />
      </div>

      {/* Value */}
      <div className={clsx('relative font-mono text-3xl font-bold mb-1', iconColorClass[color])}>
        {display}
        {suffix}
      </div>

      {/* Label + trend */}
      <div className="relative flex items-center justify-between">
        <span className="text-sm text-white/40 font-sans">{label}</span>
        {trend !== undefined && (
          <span
            className={clsx(
              'flex items-center gap-1 text-xs font-medium',
              trend >= 0 ? 'text-accent-green' : 'text-accent-pink'
            )}
          >
            {trend >= 0 ? <TrendUp size={12} weight="fill" /> : <TrendDown size={12} weight="fill" />}
            {Math.abs(trend)}
          </span>
        )}
      </div>
    </motion.div>
  );
}
