'use client';

import { MeshGradient } from '@paper-design/shaders-react';

// Ambient ONLY on the 3 hero moments (login, onboarding, empty states) —
// never globally, per the redesign plan's performance section: a WebGL
// canvas context isn't free even when lightweight. Colors reuse the app's
// own tone-80 accent hexes (green/cyan/purple) instead of introducing a new
// hue — same palette as everywhere else in the app, just animated.
export default function HeroBackground({ className = '' }: { className?: string }) {
  return (
    <MeshGradient
      className={`absolute inset-0 -z-10 ${className}`}
      colors={['#0f0e0c', '#7BD49C', '#8AC3FF', '#C7ADFF']}
      distortion={0.85}
      swirl={0.35}
      grainMixer={0.25}
      grainOverlay={0.15}
      speed={0.3}
      style={{ opacity: 0.35 }}
    />
  );
}
