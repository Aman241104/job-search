'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface ScoreRingProps {
  score: number;
  size?: number;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'rgb(var(--accent-cyan))';
  if (score >= 60) return 'rgb(var(--accent-green))';
  if (score >= 40) return 'rgb(var(--accent-yellow))';
  return 'rgb(var(--accent-pink))';
}

export default function ScoreRing({ score, size = 48 }: ScoreRingProps) {
  const circleRef = useRef<SVGCircleElement>(null);
  const radius = 20;
  const strokeWidth = 3;
  const circumference = 2 * Math.PI * radius;
  const color = getScoreColor(score);
  const center = size / 2;
  const scale = size / 50; // base size is 50

  useEffect(() => {
    if (!circleRef.current) return;
    const targetOffset = circumference - (score / 100) * circumference;

    gsap.fromTo(
      circleRef.current,
      { strokeDashoffset: circumference },
      {
        strokeDashoffset: targetOffset,
        duration: 1.2,
        ease: 'power3.out',
        delay: 0.1,
      }
    );
  }, [score, circumference]);

  const fontSize = size * 0.28;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      {/* Track */}
      <circle
        cx={center}
        cy={center}
        r={radius * scale}
        fill="none"
        stroke="rgb(var(--ink) / 0.08)"
        strokeWidth={strokeWidth * scale}
      />
      {/* Progress */}
      <circle
        ref={circleRef}
        cx={center}
        cy={center}
        r={radius * scale}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth * scale}
        strokeDasharray={circumference * scale}
        strokeDashoffset={circumference * scale}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
      />
      {/* Center text */}
      <text
        x={center}
        y={center}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize={fontSize}
        fontFamily="Fragment Mono, monospace"
        fontWeight="bold"
      >
        {score}
      </text>
    </svg>
  );
}
