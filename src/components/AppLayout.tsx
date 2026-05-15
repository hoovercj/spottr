import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { BottomNavBar } from '@/components/BottomNavBar';
import { useChromeStore } from '@/features/ui/chromeStore';
import { ChatFab } from '@/features/ai/chat/ChatFab';

/**
 * Layout shell that pins the bottom navbar under the routed page. Routes
 * that should not show the navbar (the LiftScreen, onboarding) skip this
 * wrapper in the router configuration.
 *
 * `overflowX: hidden` keeps stray children — typically full-bleed buttons
 * that pick up a 2px border on top of `width: 100%` — from triggering a
 * horizontal scrollbar on the whole shell.
 */
export function AppLayout() {
  const hideNavbar = useChromeStore((s) => s.hideNavbar);
  return (
    <Box
      sx={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
        maxWidth: '100vw',
      }}
    >
      <Box
        component="div"
        sx={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Outlet />
      </Box>
      {!hideNavbar && <BottomNavBar />}
      {!hideNavbar && <ChatFab />}
    </Box>
  );
}
