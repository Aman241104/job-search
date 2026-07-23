'use client';

import { useState, KeyboardEvent } from 'react';
import { X } from '@phosphor-icons/react';

export function ChipEditor({
  label,
  chips,
  onChange,
  placeholder,
}: {
  label: string;
  chips: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const addChip = () => {
    const val = input.trim();
    if (val && !chips.includes(val)) {
      onChange([...chips, val]);
    }
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addChip();
    } else if (e.key === 'Backspace' && !input && chips.length > 0) {
      onChange(chips.slice(0, -1));
    }
  };

  const removeChip = (chip: string) => {
    onChange(chips.filter((c) => c !== chip));
  };

  return (
    <div>
      <label className="block text-xs font-mono text-white/40 mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      <div className="min-h-[44px] flex flex-wrap gap-1.5 p-2 rounded-xl border border-border bg-bg focus-within:border-accent-green/40 transition-colors duration-150">
        {chips.map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-accent-green/10 text-accent-green text-xs font-mono border border-accent-green/20"
          >
            {chip}
            <button
              onClick={() => removeChip(chip)}
              className="text-accent-green/50 hover:text-accent-green transition-colors ml-0.5"
              type="button"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addChip}
          placeholder={chips.length === 0 ? (placeholder ?? 'Type and press Enter…') : ''}
          className="flex-1 min-w-[120px] bg-transparent text-white/80 text-sm outline-none placeholder-white/20 py-0.5 px-1"
        />
      </div>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  suffix?: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-mono text-white/40 mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-white/85 placeholder-white/20 outline-none focus:border-accent-green/40 transition-colors duration-150 font-sans"
        />
        {suffix && (
          <span className="absolute right-3 text-white/25 pointer-events-none">{suffix}</span>
        )}
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="profile-section rounded-2xl border border-border bg-bg-2 p-5 flex flex-col gap-4">
      <h2 className="text-xs font-mono text-white/30 uppercase tracking-widest">{title}</h2>
      {children}
    </div>
  );
}
