import { createTheme } from '@mui/material/styles';
import { darkPalette, lightPalette, spacing, tapTarget, typography } from '@/theme/tokens';
import type { Palette } from '@/theme/tokens';

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
      main: p.accent.logged,
      contrastText: mode === 'dark' ? p.surface[0] : '#FFFFFF',
    },
    error: {
      main: p.accent.error,
    },
    divider: p.divider,
  };
}

export const theme = createTheme({
  // Media-query selector (the MUI v6 default) makes the scheme follow the
  // browser's prefers-color-scheme. A future settings override would swap to
  // 'data' and set `data-mui-color-scheme` on `<html>`.
  colorSchemes: {
    light: { palette: paletteSpec(lightPalette, 'light') },
    dark: { palette: paletteSpec(darkPalette, 'dark') },
  },
  defaultColorScheme: 'dark',
  cssVariables: {
    colorSchemeSelector: 'media',
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
