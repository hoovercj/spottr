import { useState } from 'react';
import { IconButton } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useLocation } from 'react-router-dom';
import { ChatDialog } from '@/features/ai/chat/ChatDialog';

/**
 * Floating button that opens the Coach chat. Mounted once inside
 * AppLayout, gated to read-friendly screens (Home, History, Progress).
 * Stays well above the bottom navbar and respects the safe-area inset.
 *
 * Workout / Lift / RoutineEdit deliberately don't get the button:
 *   - Workout has the "Finish workout" CTA at the bottom
 *   - Lift has the numeric keypad sheet
 *   - RoutineEdit has a save-bar
 * adding a floating button there would collide with the primary action surface.
 *
 * UX spec §11 forbids `<Fab>`; we build the same visual affordance from
 * a primary-colored circular `<IconButton>` instead.
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
      <IconButton
        color="primary"
        aria-label="Open AI coach"
        onClick={() => setOpen(true)}
        sx={{
          position: 'fixed',
          right: 16,
          // Floats above the bottom navbar (~56px) plus iOS safe-area.
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
          zIndex: (t) => t.zIndex.fab,
          // FAB-shaped: filled primary circle, 56px tap target, lifted.
          width: 56,
          height: 56,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          boxShadow: 3,
          '&:hover': { bgcolor: 'primary.dark' },
        }}
      >
        <AutoAwesomeIcon />
      </IconButton>
      <ChatDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
