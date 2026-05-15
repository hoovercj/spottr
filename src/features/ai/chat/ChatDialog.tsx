/**
 * Full-screen MUI Dialog shell wrapping the assistant-ui-driven chat
 * thread. The chrome (title bar with reset + close) lives here; the
 * thread, message rendering, composer, and streaming behavior all live
 * inside ChatThread.
 */

import { useCallback, useState } from 'react';
import { Box, Dialog, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { ChatThread } from '@/features/ai/chat/ChatThread';

export interface ChatDialogProps {
  open: boolean;
  onClose: () => void;
}

interface SessionApi {
  reset: () => Promise<void>;
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
          sx: {
            height: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            // Explicit so the header (below) and the composer (sticky-
            // bottom in ChatThread) all sit on the same tone. The MUI
            // <AppBar> we previously used resolved to palette.AppBar.darkBg
            // (~#272727) in dark mode, which differs from background.paper
            // (~#16161A) — that step was the "weird grey" seam.
            bgcolor: 'background.paper',
          },
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          minHeight: 56,
          // Respect the device notch when the dialog is opened full-screen
          // on iOS.
          pt: 'calc(env(safe-area-inset-top, 0px) + 8px)',
          borderBottom: '1px solid',
          borderColor: 'divider',
          // Same as the Paper above — keeps everything one flat tone.
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="h6" sx={{ flex: 1 }}>
          Coach
        </Typography>
        <IconButton
          aria-label="New conversation"
          onClick={() => {
            void api?.reset();
          }}
          disabled={!api || api.isEmpty}
        >
          <RestartAltIcon />
        </IconButton>
        <IconButton aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>

      <ChatThread onSessionReady={onReady} />
    </Dialog>
  );
}
