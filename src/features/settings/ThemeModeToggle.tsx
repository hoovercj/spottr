/**
 * System / Light / Dark picker. Calls into `themeMode.ts` which
 * persists to localStorage and flips `data-mui-color-scheme` on
 * `<html>` — the MUI theme is configured to read from that attribute.
 *
 * Pub-sub subscribe so an external `setThemeMode` call (today only
 * test code, tomorrow perhaps an in-chat coach tool) re-renders the
 * picker without us having to re-poll.
 */

import { useEffect, useState } from 'react';
import { Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import {
  getThemeMode,
  setThemeMode,
  subscribeThemeMode,
  type ThemeMode,
} from '@/features/settings/themeMode';

export function ThemeModeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => getThemeMode());

  useEffect(() => subscribeThemeMode(setMode), []);

  const onChange = (_e: unknown, next: ThemeMode | null) => {
    if (!next) return; // ignore clicks on the already-selected button
    setThemeMode(next);
  };

  return (
    <Stack spacing={1}>
      <Typography variant="h2">Appearance</Typography>
      <Typography variant="body2" color="text.secondary">
        Follow your device's setting or pick one explicitly.
      </Typography>
      <ToggleButtonGroup value={mode} exclusive onChange={onChange} aria-label="Color scheme">
        <ToggleButton value="system" sx={{ px: 3 }}>
          System
        </ToggleButton>
        <ToggleButton value="light" sx={{ px: 3 }}>
          Light
        </ToggleButton>
        <ToggleButton value="dark" sx={{ px: 3 }}>
          Dark
        </ToggleButton>
      </ToggleButtonGroup>
    </Stack>
  );
}
