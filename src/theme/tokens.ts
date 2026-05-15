/**
 * Design tokens — single source of truth.
 *
 * Bound at build time per UX spec §Visual Design Foundation. All colors are
 * named tokens (not literal hex at call sites) so a palette swap is one
 * config change, not a refactor. The light/dark palettes are wired into MUI
 * via `colorSchemes` so the browser's `prefers-color-scheme` setting picks
 * the right one automatically.
 *
 * Accent palette follows IWF Olympic bumper-plate colors (red 25 kg, blue
 * 20 kg, yellow 15 kg, green 10 kg, white 5 kg, black 2.5 kg). The "logged"
 * green doubles as the 10 kg-plate green so the established success color
 * remains the visual spine of the system.
 */

export interface PlatePalette {
  red: string;
  blue: string;
  yellow: string;
  green: string;
  white: string;
  black: string;
}

export interface PlateTintPalette {
  red: string;
  blue: string;
  yellow: string;
  green: string;
}

export interface Palette {
  /**
   * Surface tones ordered low → high elevation:
   *   0 = page background (sunken)
   *   1 = paper / default card
   *   2 = raised tone on paper (alt rows, today-card wash base)
   *   3 = overlay / menu / popover
   */
  surface: { 0: string; 1: string; 2: string; 3: string };
  text: { primary: string; secondary: string };
  /** Back-compat aliases. New code should prefer `plates.green` / `plates.red`. */
  accent: { logged: string; error: string };
  plates: PlatePalette;
  /** Low-alpha plate hues ready to drop into `bgcolor`. */
  plateTint: PlateTintPalette;
  divider: string;
  focusRing: string;
}

const darkPlates: PlatePalette = {
  red: '#EF4444',
  blue: '#3B82F6',
  yellow: '#F5C518',
  green: '#3DDC84',
  white: '#F2F2F5',
  black: '#0E0E10',
};

const darkPlateTint: PlateTintPalette = {
  red: '#EF44441A',
  blue: '#3B82F61A',
  yellow: '#F5C5181A',
  green: '#3DDC841A',
};

export const darkPalette: Palette = {
  surface: {
    0: '#0B0B0E',
    1: '#16161A',
    2: '#1F1F24',
    3: '#2A2A30',
  },
  text: {
    primary: '#F2F2F5',
    secondary: '#A8A8B0',
  },
  accent: {
    logged: darkPlates.green,
    error: darkPlates.red,
  },
  plates: darkPlates,
  plateTint: darkPlateTint,
  divider: '#2C2C30',
  focusRing: darkPlates.green,
};

// Light-mode plate hues are tuned for contrast against white surfaces — the
// dark-mode hues are too bright at full saturation on a light background.
const lightPlates: PlatePalette = {
  red: '#C62828',
  blue: '#1E63D9',
  yellow: '#C99A16',
  green: '#1F8E50',
  white: '#FFFFFF',
  black: '#1A1A1D',
};

const lightPlateTint: PlateTintPalette = {
  red: '#C6282814',
  blue: '#1E63D914',
  yellow: '#C99A1614',
  green: '#1F8E5014',
};

export const lightPalette: Palette = {
  surface: {
    // Page bg pulled a touch cooler/darker so paper visibly floats above it
    // — the old `#FAFAFC` was almost indistinguishable from `#FFFFFF` paper.
    0: '#ECECF1',
    1: '#FFFFFF',
    2: '#F6F6FA',
    3: '#FAFAFC',
  },
  text: {
    primary: '#1A1A1D',
    secondary: '#5C5C66',
  },
  accent: {
    logged: lightPlates.green,
    error: lightPlates.red,
  },
  plates: lightPlates,
  plateTint: lightPlateTint,
  divider: '#E2E2E7',
  focusRing: lightPlates.green,
};

/**
 * Legacy export kept for the few call sites and tests that still reach for
 * the dark palette directly. New code should let MUI resolve colors via the
 * theme so light mode works automatically.
 */
export const colors = darkPalette;

export const spacing = {
  unit: 8,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const typography = {
  fontFamily: 'Roboto, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif',
  monoNumerics: 'tabular-nums',
} as const;

export const tapTarget = {
  /** Material baseline (NFR8). */
  baseline: 48,
  /** Set-table row minimum height. */
  row: 56,
  /** Footer action button. */
  footer: 56,
} as const;
