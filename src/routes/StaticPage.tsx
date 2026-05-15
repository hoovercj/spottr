/**
 * Shared shell for the static legal / informational pages (Privacy, Terms).
 *
 * Lives outside the OnboardingGate so URLs like /privacy resolve directly —
 * the OAuth consent screen needs to fetch them without a backend session.
 * No bottom navbar; a "← Back" link is the only navigation affordance.
 */

import { useEffect, type ReactNode } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useChromeStore } from '@/features/ui/chromeStore';

interface StaticPageProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export function StaticPage({ title, lastUpdated, children }: StaticPageProps) {
  const navigate = useNavigate();
  const setHideNavbar = useChromeStore((s) => s.setHideNavbar);

  // The page renders its own back affordance — suppress the global navbar
  // so the chrome doesn't compete with the page content.
  useEffect(() => {
    setHideNavbar(true);
    return () => setHideNavbar(false);
  }, [setHideNavbar]);

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <Box
        sx={{
          flexShrink: 0,
          px: 3,
          pt: 2,
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Button size="small" variant="text" onClick={() => void navigate(-1)} sx={{ ml: -1 }}>
          ← Back
        </Button>
        <Typography variant="h1" sx={{ mt: 1 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Last updated {lastUpdated}
        </Typography>
      </Box>

      <Box sx={{ px: 3, py: 3, maxWidth: 720 }}>
        <Stack spacing={2}>{children}</Stack>
      </Box>
    </Box>
  );
}
