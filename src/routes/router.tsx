/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from 'react';
import { Box, Typography } from '@mui/material';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { Home } from '@/routes/Home';
import { Onboarding } from '@/routes/Onboarding';
import { AppLayout } from '@/components/AppLayout';
import { useExportStatus, isOnboardingComplete } from '@/features/export/hooks';

const Settings = lazy(() => import('@/routes/Settings').then((m) => ({ default: m.Settings })));
const Workout = lazy(() => import('@/routes/Workout').then((m) => ({ default: m.Workout })));
const SessionWorkoutRoute = lazy(() =>
  import('@/routes/Workout').then((m) => ({ default: m.SessionWorkoutRoute })),
);
const Lift = lazy(() => import('@/routes/Lift').then((m) => ({ default: m.Lift })));
const SessionLiftRoute = lazy(() =>
  import('@/routes/Lift').then((m) => ({ default: m.SessionLiftRoute })),
);
const History = lazy(() => import('@/routes/History').then((m) => ({ default: m.History })));
const HistorySession = lazy(() =>
  import('@/routes/HistorySession').then((m) => ({ default: m.HistorySession })),
);
const HistoryVariant = lazy(() =>
  import('@/routes/HistoryVariant').then((m) => ({ default: m.HistoryVariant })),
);
const RoutineEdit = lazy(() =>
  import('@/routes/RoutineEdit').then((m) => ({ default: m.RoutineEdit })),
);
const Progress = lazy(() => import('@/routes/Progress').then((m) => ({ default: m.Progress })));

const BASE = '/spottr/';

function RouteFallback() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="body2" color="text.secondary">
        Loading…
      </Typography>
    </Box>
  );
}

function lazyRoute(element: React.ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

function OnboardingGate() {
  const status = useExportStatus();
  if (status === undefined) return null;
  if (!isOnboardingComplete(status)) {
    return <Navigate to="/onboarding" replace />;
  }
  return <Outlet />;
}

function OnboardingRedirectIfDone() {
  const status = useExportStatus();
  if (status === undefined) return null;
  if (isOnboardingComplete(status)) {
    return <Navigate to="/" replace />;
  }
  return <Onboarding />;
}

export const router = createBrowserRouter(
  [
    {
      path: '/onboarding',
      element: <OnboardingRedirectIfDone />,
    },
    {
      element: <OnboardingGate />,
      children: [
        // Routes wrapped in the AppLayout (with bottom navbar).
        {
          element: <AppLayout />,
          children: [
            { path: '/', element: <Home /> },
            { path: '/workout', element: lazyRoute(<Workout />) },
            { path: '/session/:sessionId', element: lazyRoute(<SessionWorkoutRoute />) },
            { path: '/history', element: lazyRoute(<History />) },
            { path: '/history/session/:sessionId', element: lazyRoute(<HistorySession />) },
            { path: '/history/variant/:variantId', element: lazyRoute(<HistoryVariant />) },
            { path: '/settings', element: lazyRoute(<Settings />) },
            { path: '/progress', element: lazyRoute(<Progress />) },
            { path: '/routine/edit/new', element: lazyRoute(<RoutineEdit />) },
            { path: '/routine/edit/:programId', element: lazyRoute(<RoutineEdit />) },
          ],
        },
        // Routes that bypass the navbar — focused single-purpose flows.
        { path: '/workout/lift/:liftId', element: lazyRoute(<Lift />) },
        { path: '/session/:sessionId/lift/:liftId', element: lazyRoute(<SessionLiftRoute />) },
      ],
    },
  ],
  { basename: BASE },
);
