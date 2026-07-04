'use client';

import { Icon } from '@phosphor-icons/react';
import clsx from 'clsx';

interface EmptyStateProps {
  icon: Icon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  color?: 'green' | 'cyan' | 'purple' | 'yellow' | 'pink';
}

const colorMap = {
  green: 'bg-accent-green/10 text-accent-green',
  cyan: 'bg-accent-cyan/10 text-accent-cyan',
  purple: 'bg-accent-purple/10 text-accent-purple',
  yellow: 'bg-accent-yellow/10 text-accent-yellow',
  pink: 'bg-accent-pink/10 text-accent-pink',
};

export default function EmptyState({ icon: Icon, title, description, action, color = 'green' }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div
        className={clsx(
          'chip-breathe w-16 h-16 rounded-2xl flex items-center justify-center mb-5',
          colorMap[color]
        )}
      >
        <Icon size={26} />
      </div>
      <h3 className="text-base font-semibold text-ink mb-1.5">{title}</h3>
      {description && (
        <p className="text-sm text-ink-muted max-w-xs mb-6 leading-relaxed">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="text-sm font-semibold px-5 py-2.5 rounded-xl bg-accent-green/10 border border-accent-green/25 text-accent-green hover:bg-accent-green/15 transition-all active:scale-[0.98]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
