/**
 * Fixed-bottom nav: four labeled tabs flanking a central Spottr logo.
 *
 * The "Workout" tab is the routine-week home (`/`) by default but routes to
 * `/workout` if there's an active session so a single tap returns the user
 * to where they last were. The central logo is a decorative brand mark
 * only — it doesn't navigate anywhere on tap.
 *
 * Each tab's active color picks up one of the Olympic bumper-plate accents
 * so the nav doubles as a wayfinding cue: green for the active-workout
 * affordance, blue for history, yellow for progress, neutral for settings.
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
const LOGO = 'logo';

type Tab = typeof HISTORY | typeof WORKOUT | typeof PROGRESS | typeof SETTINGS;
type NavValue = Tab | typeof LOGO;

function tabForPath(pathname: string): Tab {
  if (pathname.startsWith('/history')) return HISTORY;
  if (pathname.startsWith('/progress')) return PROGRESS;
  if (pathname.startsWith('/settings')) return SETTINGS;
  return WORKOUT;
}

const TAB_ICON_SIZE = 22;
const LOGO_SIZE = 52;

// Per-tab style: slight icon shrink so the larger central logo stands out,
// plus the bumper-plate color on the selected state.
function tabSx(color: string) {
  return {
    color: 'text.secondary',
    '&.Mui-selected': { color },
    '& .MuiSvgIcon-root': { fontSize: TAB_ICON_SIZE },
  };
}

export function BottomNavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const active = useActiveSession();
  const current = tabForPath(location.pathname);

  const onChange = (next: NavValue) => {
    // Logo is decorative — ignore taps so the user stays on the current
    // screen and no "selected" state ever applies to it.
    if (next === LOGO) return;
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
      <BottomNavigation
        value={current}
        onChange={(_e, value: NavValue) => onChange(value)}
        showLabels
      >
        <BottomNavigationAction
          label="Workout"
          value={WORKOUT}
          icon={<FitnessCenterIcon />}
          sx={tabSx('primary.main')}
        />
        <BottomNavigationAction
          label="History"
          value={HISTORY}
          icon={<HistoryIcon />}
          sx={tabSx('secondary.main')}
        />
        <BottomNavigationAction
          value={LOGO}
          aria-hidden="true"
          tabIndex={-1}
          disableRipple
          icon={
            <img
              src="./icon-nav.svg"
              alt=""
              width={LOGO_SIZE}
              height={LOGO_SIZE}
              style={{ display: 'block' }}
            />
          }
          // Hide the label slot entirely so the (slightly larger) logo
          // centers vertically inside the action box without nudging the
          // surrounding tabs' label baseline. Also strip the hover/active
          // affordances since the logo isn't interactive.
          sx={{
            '& .MuiBottomNavigationAction-label': { display: 'none' },
            '&.Mui-selected': { color: 'inherit' },
            cursor: 'default',
            '&:hover': { backgroundColor: 'transparent' },
            minWidth: 0,
          }}
        />
        <BottomNavigationAction
          label="Progress"
          value={PROGRESS}
          icon={<ShowChartIcon />}
          sx={tabSx('warning.main')}
        />
        <BottomNavigationAction
          label="Settings"
          value={SETTINGS}
          icon={<SettingsIcon />}
          sx={tabSx('text.primary')}
        />
      </BottomNavigation>
    </Paper>
  );
}
