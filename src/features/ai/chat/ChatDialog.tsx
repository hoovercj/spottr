/**
 * Full-screen MUI Dialog shell wrapping the assistant-ui-driven chat
 * thread. The chrome (title bar with reset + close) lives here; the
 * thread, message rendering, composer, and streaming behavior all live
 * inside ChatThread.
 */

import { useCallback, useState } from 'react';
import { AppBar, Dialog, IconButton, Toolbar, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { ChatThread } from '@/features/ai/chat/ChatThread';

export interface ChatDialogProps {
  open: boolean;
  onClose: () => void;
}

interface SessionApi {
  reset: () => void;
  isEmpty: boolean;
}

export function ChatDialog({ open, onClose }: ChatDialogProps) {
  // ChatThread owns the session; it hands us a reset function so the
  // toolbar button can wipe the conversation without ChatDialog having
  // to reach into the runtime.
  const [api, setApi] = useState<SessionApi | null>(null);
  const onReady = useCallback((next: SessionApi) => setApi(next), []);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      disableScrollLock
      slotProps={{
        paper: {
          sx: { height: '100dvh', display: 'flex', flexDirection: 'column' },
        },
      }}
    >
      <AppBar position="static" elevation={0} color="default">
        <Toolbar sx={{ minHeight: 48, gap: 1 }}>
          <Typography variant="h6" sx={{ flex: 1 }}>
            Coach
          </Typography>
          <IconButton
            aria-label="New conversation"
            onClick={() => api?.reset()}
            disabled={!api || api.isEmpty}
          >
            <RestartAltIcon />
          </IconButton>
          <IconButton aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <ChatThread onSessionReady={onReady} />
    </Dialog>
  );
}
