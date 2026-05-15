import { createTheme } from '@mui/material/styles';
import { darkPalette, lightPalette, spacing, tapTarget, typography } from '@/theme/tokens';
import type { Palette, PlatePalette, PlateTintPalette } from '@/theme/tokens';

type SurfacePalette = { 0: string; 1: string; 2: string; 3: string };

declare module '@mui/material/styles' {
  interface Palette {
    plates: PlatePalette;
    plateTint: PlateTintPalette;
    surfaces: SurfacePalette;
  }
  interface PaletteOptions {
    plates?: PlatePalette;
    plateTint?: PlateTintPalette;
    surfaces?: SurfacePalette;
  }
}

function paletteSpec(p: Palette, mode: 'light' | 'dark') {
  return {
    mode,
    background: {
      default: p.surface[0],
      paper: p.surface[1],
    },
    text: {
      primary: p.text.primary,
      secondary: p.text.secondary,
    },
    primary: {
      main: p.plates.green,
      contrastText: mode === 'dark' ? p.surface[0] : '#FFFFFF',
    },
    secondary: {
      main: p.plates.blue,
      contrastText: '#FFFFFF',
    },
    warning: {
      main: p.plates.yellow,
      contrastText: mode === 'dark' ? p.surface[0] : '#1A1A1D',
    },
    error: {
      main: p.plates.red,
    },
    divider: p.divider,
    plates: p.plates,
    plateTint: p.plateTint,
    surfaces: p.surface,
  };
}

export const theme = createTheme({
  // Data-attribute selector: the active scheme is read from
  // `<html data-mui-color-scheme="…">`. This lets the Settings toggle
  // override the OS preference. `applyThemeMode` in
  // `src/features/settings/themeMode.ts` owns writing that attribute;
  // for the "System" preference it mirrors `prefers-color-scheme` and
  // listens for changes so flipping the OS theme also flips the app
  // live. The default scheme (used when no attribute is set yet — e.g.
  // a stray HMR boot before the apply hook runs) stays dark.
  colorSchemes: {
    light: { palette: paletteSpec(lightPalette, 'light') },
    dark: { palette: paletteSpec(darkPalette, 'dark') },
  },
  defaultColorScheme: 'dark',
  cssVariables: {
    colorSchemeSelector: 'data',
  },
  spacing: spacing.unit,
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: typography.fontFamily,
    h1: { fontSize: '2rem', lineHeight: 1.25, fontWeight: 500 },
    h2: { fontSize: '1.5rem', lineHeight: 1.3, fontWeight: 500 },
    body1: { fontSize: '1rem', lineHeight: 1.5, fontWeight: 400 },
    body2: { fontSize: '0.875rem', lineHeight: 1.5, fontWeight: 400 },
    caption: { fontSize: '0.75rem', lineHeight: 1.4, fontWeight: 400 },
    button: {
      fontSize: '1rem',
      lineHeight: 1,
      fontWeight: 500,
      textTransform: 'none',
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        variant: 'contained',
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          minHeight: tapTarget.baseline,
          textTransform: 'none',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minWidth: tapTarget.baseline,
          minHeight: tapTarget.baseline,
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          padding: 12,
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        // Use MUI's generated CSS variables so the body color switches with
        // prefers-color-scheme. Same for the focus ring.
        body: {
          backgroundColor: 'var(--mui-palette-background-default)',
          color: 'var(--mui-palette-text-primary)',
        },
        // Suppress the mobile-browser default tap highlight (typically a
        // translucent blue/teal flash) — we render tap feedback ourselves
        // via :active / :focus-visible so the colors stay on-brand.
        '*': {
          WebkitTapHighlightColor: 'transparent',
        },
        '*:focus-visible': {
          outline: '2px solid var(--mui-palette-primary-main)',
          outlineOffset: 2,
        },
        '.numeric-cell': {
          fontVariantNumeric: typography.monoNumerics,
        },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.001ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.001ms !important',
            scrollBehavior: 'auto !important',
          },
        },
      },
    },
  },
});
