"use client";

import React, { useEffect, useId, useState } from "react";

export type Theme = "light" | "dark" | "dim";

interface ThemeSwitcherProps {
  defaultValue?: Theme;
  value?: Theme;
  onValueChange?: (theme: Theme) => void;
}

// Refraction map for the liquid-glass filters: red encodes x-displacement,
// green y-displacement, 50% grey = none. Neutral across the middle and
// ramping only near the edges, so the backdrop bends at the rim like a lens
// while the center stays readable. Generated instead of shipping a ~16KB
// base64 WebP (the original component's approach) — same technique, tunable.
const LENS_MAP = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" preserveAspectRatio="none">
    <defs>
      <linearGradient id="x" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#000"/><stop offset=".22" stop-color="#800000"/>
        <stop offset=".78" stop-color="#800000"/><stop offset="1" stop-color="#f00"/>
      </linearGradient>
      <linearGradient id="y" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#000"/><stop offset=".22" stop-color="#008000"/>
        <stop offset=".78" stop-color="#008000"/><stop offset="1" stop-color="#0f0"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#x)"/>
    <rect width="100" height="100" fill="url(#y)" style="mix-blend-mode:screen"/>
  </svg>`
)}`;

const themeOptions: { value: Theme; cOption: string; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    cOption: "1",
    label: "Light",
    icon: (
      <svg className="switcher__icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 36 36" aria-hidden>
        <path
          fill="var(--c)"
          fillRule="evenodd"
          d="M18 12a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
          clipRule="evenodd"
        />
        <path
          fill="var(--c)"
          d="M17 6.038a1 1 0 1 1 2 0v3a1 1 0 0 1-2 0v-3ZM24.244 7.742a1 1 0 1 1 1.618 1.176L24.1 11.345a1 1 0 1 1-1.618-1.176l1.763-2.427ZM29.104 13.379a1 1 0 0 1 .618 1.902l-2.854.927a1 1 0 1 1-.618-1.902l2.854-.927ZM29.722 20.795a1 1 0 0 1-.619 1.902l-2.853-.927a1 1 0 1 1 .618-1.902l2.854.927ZM25.862 27.159a1 1 0 0 1-1.618 1.175l-1.763-2.427a1 1 0 1 1 1.618-1.175l1.763 2.427ZM19 30.038a1 1 0 0 1-2 0v-3a1 1 0 1 1 2 0v3ZM11.755 28.334a1 1 0 0 1-1.618-1.175l1.764-2.427a1 1 0 1 1 1.618 1.175l-1.764 2.427ZM6.896 22.697a1 1 0 1 1-.618-1.902l2.853-.927a1 1 0 1 1 .618 1.902l-2.853.927ZM6.278 15.28a1 1 0 1 1 .618-1.901l2.853.927a1 1 0 1 1-.618 1.902l-2.853-.927ZM10.137 8.918a1 1 0 0 1 1.618-1.176l1.764 2.427a1 1 0 0 1-1.618 1.176l-1.764-2.427Z"
        />
      </svg>
    ),
  },
  {
    value: "dark",
    cOption: "2",
    label: "Dark",
    icon: (
      <svg className="switcher__icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 36 36" aria-hidden>
        <path
          fill="var(--c)"
          d="M12.5 8.473a10.968 10.968 0 0 1 8.785-.97 7.435 7.435 0 0 0-3.737 4.672l-.09.373A7.454 7.454 0 0 0 28.732 20.4a10.97 10.97 0 0 1-5.232 7.125l-.497.27c-5.014 2.566-11.175.916-14.234-3.813l-.295-.483C5.53 18.403 7.130 11.930 12.017 8.770l.483-.297Zm4.234.616a8.946 8.946 0 0 0-2.805.883l-.429.234A9 9 0 0 0 10.206 22.5l.241.395A9 9 0 0 0 22.5 25.794l.416-.255a8.94 8.94 0 0 0 2.167-1.990 9.433 9.433 0 0 1-2.782-.313c-5.043-1.352-8.036-6.535-6.686-11.578l.147-.491c.242-.745.573-1.440.972-2.078Z"
        />
      </svg>
    ),
  },
  {
    value: "dim",
    cOption: "3",
    label: "Dim",
    icon: (
      <svg className="switcher__icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 36 36" aria-hidden>
        <path
          fill="var(--c)"
          d="M5 21a1 1 0 0 1 1-1h24a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1ZM12 25a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H13a1 1 0 0 1-1-1ZM15 29a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1ZM18 13a6 6 0 0 1 5.915 7h-2.041A4.005 4.005 0 0 0 18 15a4 4 0 0 0-3.874 5h-2.041A6 6 0 0 1 18 13ZM17 7.038a1 1 0 1 1 2 0v3a1 1 0 0 1-2 0v-3ZM24.244 8.742a1 1 0 1 1 1.618 1.176L24.1 12.345a1 1 0 1 1-1.618-1.176l1.763-2.427ZM29.104 14.379a1 1 0 0 1 .618 1.902l-2.854.927a1 1 0 1 1-.618-1.902l2.854-.927ZM6.278 16.28a1 1 0 1 1 .618-1.901l2.853.927a1 1 0 1 1-.618 1.902l-2.853-.927ZM10.137 9.918a1 1 0 0 1 1.618-1.176l1.764 2.427a1 1 0 0 1-1.618 1.176l-1.764-2.427Z"
        />
      </svg>
    ),
  },
];

export function ThemeSwitcher({ defaultValue = "light", value, onValueChange }: ThemeSwitcherProps) {
  const [internalValue, setInternalValue] = useState<Theme>(defaultValue);
  const activeValue = value ?? internalValue;
  // Which option the pill slides *from* — drives the direction-aware squash.
  const [previousOption, setPreviousOption] = useState<string | undefined>(undefined);
  // Unique per instance: two switchers on one page must not share a radio group.
  const groupName = `theme-${useId()}`;

  useEffect(() => {
    if (value !== undefined) setInternalValue(value);
  }, [value]);

  const handleChange = (newValue: Theme) => {
    setPreviousOption(themeOptions.find((o) => o.value === activeValue)?.cOption);
    if (onValueChange) onValueChange(newValue);
    else setInternalValue(newValue);
  };

  return (
    <fieldset className="switcher" data-previous={previousOption}>
      <legend className="switcher__legend">Choose theme</legend>

      {themeOptions.map((option) => (
        <label key={option.value} className="switcher__option" title={option.label}>
          <input
            className="switcher__input"
            type="radio"
            name={groupName}
            value={option.value}
            aria-label={option.label}
            c-option={option.cOption}
            checked={activeValue === option.value}
            onChange={() => handleChange(option.value)}
          />
          {option.icon}
        </label>
      ))}

      <div className="switcher__filter" aria-hidden>
        <svg>
          <filter id="switcher" primitiveUnits="objectBoundingBox">
            <feImage result="map" width="100%" height="100%" x="0" y="0" href={LENS_MAP} preserveAspectRatio="none" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.02" result="blur" />
            <feDisplacementMap in="blur" in2="map" scale="0.08" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="toggler" primitiveUnits="objectBoundingBox">
            <feImage result="map" width="100%" height="100%" x="0" y="0" href={LENS_MAP} preserveAspectRatio="none" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.01" result="blur" />
            <feDisplacementMap in="blur" in2="map" scale="0.18" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      </div>
    </fieldset>
  );
}
