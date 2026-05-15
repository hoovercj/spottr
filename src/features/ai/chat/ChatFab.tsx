import { useState } from 'react';
import { Fab } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useLocation } from 'react-router-dom';
import { ChatDialog } from '@/features/ai/chat/ChatDialog';

/**
 * Floating button that opens the Coach chat. Mounted once inside
 * AppLayout, gated to read-friendly screens (Home, History, Progress).
 * Stays well above the bottom navbar and respects the safe-area inset.
 *
 * Workout / Lift / RoutineEdit deliberately don't get the FAB:
 *   - Workout has the "Finish workout" CTA at the bottom
 *   - Lift has the numeric keypad sheet
 *   - RoutineEdit has a save-bar
 * adding a FAB there would collide with the primary action surface.
 */

const ALLOWED_PREFIXES = ['/history', '/progress'];
const ALLOWED_EXACT = ['/'];

function pathAllowsFab(pathname: string): boolean {
  if (ALLOWED_EXACT.includes(pathname)) return true;
  return ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

export function ChatFab() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  if (!pathAllowsFab(location.pathname)) return null;

  return (
    <>
      <Fab
        color="primary"
        aria-label="Open AI coach"
        onClick={() => setOpen(true)}
        sx={{
          position: 'fixed',
          right: 16,
          // Floats above the bottom navbar (~56px) plus iOS safe-area.
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
          zIndex: (t) => t.zIndex.fab,
        }}
      >
        <AutoAwesomeIcon />
      </Fab>
      <ChatDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
