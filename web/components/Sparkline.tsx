'use client';

// Tiny inline trend line — deliberately not a full Recharts mount for a
// decorative 60x24px hero accent. Values are whatever real series the
// caller passes in (e.g. 14 days of real "found" counts) — never invented.
export default function Sparkline({
  values,
  width = 100,
  height = 32,
  className = '',
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values
    .map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`)
    .join(' ');

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`} fill="none">
      <polygon points={areaPoints} fill="currentColor" opacity={0.12} />
      <polyline points={points} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
