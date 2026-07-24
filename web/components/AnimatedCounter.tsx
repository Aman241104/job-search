'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

// Same count-up technique as StatCard — extracted so hero sections outside
// the dashboard (Batch Apply) can use it without a full stat-card shell.
export default function AnimatedCounter({
  value,
  suffix = '',
  className = '',
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const objRef = useRef({ value: 0 });

  useEffect(() => {
    gsap.to(objRef.current, {
      value,
      duration: 1.2,
      ease: 'power2.out',
      onUpdate: () => setDisplay(Math.round(objRef.current.value)),
    });
  }, [value]);

  return (
    <span className={className}>
      {display}
      {suffix}
    </span>
  );
}
