import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { router } from '@/routes/router';
import { theme } from '@/theme/muiTheme';
import { applyThemeMode, getThemeMode } from '@/features/settings/themeMode';

// Apply the user's color-scheme preference BEFORE the first render so
// the page doesn't flash the wrong theme. Reads from localStorage, which
// is synchronous (unlike the Dexie `meta` table the rest of the app
// uses) — exactly what's needed to avoid a flash-of-wrong-theme.
applyThemeMode(getThemeMode());

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
);
