/**
 * Design tokens — single source of truth.
 *
 * Bound at build time per UX spec §Visual Design Foundation. All colors are
 * named tokens (not literal hex at call sites) so a palette swap is one
 * config change, not a refactor. The light/dark palettes are wired into MUI
 * via `colorSchemes` so the browser's `prefers-color-scheme` setting picks
 * the right one automatically.
 */

export interface Palette {
  surface: { 0: string; 1: string; 2: string };
  text: { primary: string; secondary: string };
  accent: { logged: string; error: string };
  divider: string;
  focusRing: string;
}

export const darkPalette: Palette = {
  surface: {
    0: '#0E0E10',
    1: '#1A1A1D',
    2: '#26262A',
  },
  text: {
    primary: '#F2F2F5',
    secondary: '#A8A8B0',
  },
  accent: {
    logged: '#3DDC84',
    error: '#FF5252',
  },
  divider: '#2C2C30',
  focusRing: '#3DDC84',
};

export const lightPalette: Palette = {
  surface: {
    0: '#FAFAFC',
    1: '#FFFFFF',
    2: '#F1F1F4',
  },
  text: {
    primary: '#1A1A1D',
    secondary: '#5C5C66',
  },
  accent: {
    // Slightly darker green so it carries the same contrast against a white
    // background that the bright dark-mode green does against near-black.
    logged: '#1F8E50',
    error: '#C62828',
  },
  divider: '#E2E2E7',
  focusRing: '#1F8E50',
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
