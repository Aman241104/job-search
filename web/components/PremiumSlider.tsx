'use client';

const SLIDER_COLOR: Record<string, string> = {
  green: 'rgb(var(--accent-green))',
  cyan: 'rgb(var(--accent-cyan))',
  purple: 'rgb(var(--accent-purple))',
  yellow: 'rgb(var(--accent-yellow))',
};

const VALUE_TEXT: Record<string, string> = {
  green: 'text-accent-green',
  cyan: 'text-accent-cyan',
  purple: 'text-accent-purple',
  yellow: 'text-accent-yellow',
};

export default function PremiumSlider({
  label,
  value,
  min,
  max,
  suffix = '',
  color = 'green',
  sub,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  color?: 'green' | 'cyan' | 'purple' | 'yellow';
  sub?: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-white/40 uppercase tracking-wider">{label}</span>
        <span className={`font-mono font-bold text-2xl ${VALUE_TEXT[color]}`}>
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="slider-premium"
        style={{ '--slider-pct': `${pct}%`, '--slider-color': SLIDER_COLOR[color] } as React.CSSProperties}
      />
      {sub && <p className="text-xs text-white/30 mt-1.5">{sub}</p>}
    </div>
  );
}
