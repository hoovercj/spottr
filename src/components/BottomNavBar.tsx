/**
 * Fixed-bottom three-tab navbar: History | Workout | Settings.
 *
 * The "Workout" tab is the routine-week home (`/`) by default but routes to
 * `/workout` if there's an active session so a single tap returns the user
 * to where they last were.
 */

import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import { useActiveSession } from '@/features/session/hooks';

const HISTORY = 'history';
const WORKOUT = 'workout';
const PROGRESS = 'progress';
const SETTINGS = 'settings';

type Tab = typeof HISTORY | typeof WORKOUT | typeof PROGRESS | typeof SETTINGS;

function tabForPath(pathname: string): Tab {
  if (pathname.startsWith('/history')) return HISTORY;
  if (pathname.startsWith('/progress')) return PROGRESS;
  if (pathname.startsWith('/settings')) return SETTINGS;
  return WORKOUT;
}

export function BottomNavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const active = useActiveSession();
  const current = tabForPath(location.pathname);

  const onChange = (next: Tab) => {
    if (next === HISTORY) void navigate('/history');
    else if (next === PROGRESS) void navigate('/progress');
    else if (next === SETTINGS) void navigate('/settings');
    else void navigate(active ? '/workout' : '/');
  };

  return (
    <Paper
      elevation={3}
      sx={{
        position: 'sticky',
        bottom: 0,
        pb: 'env(safe-area-inset-bottom, 0px)',
        borderTop: '1px solid',
        borderColor: 'divider',
      }}
    >
      <BottomNavigation value={current} onChange={(_e, value: Tab) => onChange(value)} showLabels>
        <BottomNavigationAction label="Workout" value={WORKOUT} icon={<FitnessCenterIcon />} />
        <BottomNavigationAction label="History" value={HISTORY} icon={<HistoryIcon />} />
        <BottomNavigationAction label="Progress" value={PROGRESS} icon={<ShowChartIcon />} />
        <BottomNavigationAction label="Settings" value={SETTINGS} icon={<SettingsIcon />} />
      </BottomNavigation>
    </Paper>
  );
}
