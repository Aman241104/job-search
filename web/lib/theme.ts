import { converter, clampChroma, formatHex } from 'culori';

const toOklch = converter('oklch');

// Material 3's own tone stops — kept identical so the ramp lines up with
// the semantic role picks (container/on-container etc.) used in globals.css.
export const TONE_STOPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100] as const;

/**
 * Generates a perceptually-even tonal ramp from one seed color, in OKLCH
 * space (hue + chroma held constant, lightness swept across the tone
 * stops) — the same idea as Material 3's HCT tonal palettes, at a fraction
 * of the implementation cost. Chroma is clamped back into sRGB gamut at
 * each stop since very light/dark tones can't sustain the seed's full
 * chroma without clipping.
 */
export function generateTonalPalette(seedHex: string): Record<number, string> {
  const seed = toOklch(seedHex);
  if (!seed) throw new Error(`Invalid seed color: ${seedHex}`);
  const hue = seed.h ?? 0;
  const chroma = seed.c ?? 0;

  const palette: Record<number, string> = {};
  for (const tone of TONE_STOPS) {
    const clamped = clampChroma({ mode: 'oklch', l: tone / 100, c: chroma, h: hue }, 'oklch');
    palette[tone] = formatHex(clamped);
  }
  return palette;
}
