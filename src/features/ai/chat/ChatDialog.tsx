import { useEffect, useRef } from 'react';
import {
  AppBar,
  Box,
  CircularProgress,
  Dialog,
  IconButton,
  Stack,
  Toolbar,
  Typography,
  Alert,
  Button,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { Link as RouterLink } from 'react-router-dom';
import { MessageBubble } from '@/features/ai/chat/MessageBubble';
import { Composer } from '@/features/ai/chat/Composer';
import { useChatSession } from '@/features/ai/chat/useChatSession';

export interface ChatDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Full-screen chat overlay. Mounts a fresh `useChatSession` per open so
 * the conversation starts clean each time — conversation persistence is
 * out of scope for the MVP.
 */
export function ChatDialog({ open, onClose }: ChatDialogProps) {
  const { state, send, reset } = useChatSession();
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message on every new turn or streaming
  // toggle. Using `scrollTop = scrollHeight` (not `scrollIntoView`) keeps
  // the scroll inside the dialog without dragging focus.
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [state.messages, state.isStreaming]);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

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
            onClick={reset}
            disabled={state.messages.length === 0}
          >
            <RestartAltIcon />
          </IconButton>
          <IconButton aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box
        ref={listRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          py: 1,
        }}
      >
        {state.messages.length === 0 && !state.isStreaming && (
          <Stack spacing={1} sx={{ px: 3, py: 4 }}>
            <Typography variant="body1" color="text.secondary">
              Ask anything about your training. Try:
            </Typography>
            <Typography variant="body2" color="text.secondary">
              · How has my squat trended over the past 6 weeks?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              · What did I lift on my last bench day?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              · Am I making progress on bench at 5×5 vs 8-12?
            </Typography>
          </Stack>
        )}

        {state.messages.map((m, i) => (
          <MessageBubble key={i} msg={m} />
        ))}

        {state.isStreaming && (
          <Stack direction="row" alignItems="center" sx={{ px: 3, py: 1 }} spacing={1}>
            <CircularProgress size={16} />
            <Typography variant="caption" color="text.secondary">
              thinking…
            </Typography>
          </Stack>
        )}

        {state.error && (
          <Box sx={{ px: 2, py: 1 }}>
            <Alert severity="warning" variant="outlined">
              {state.error}
              {state.error.includes('No AI provider configured') && (
                <Box sx={{ mt: 1 }}>
                  <Button
                    component={RouterLink}
                    to="/settings"
                    size="small"
                    variant="outlined"
                    onClick={onClose}
                  >
                    Open Settings
                  </Button>
                </Box>
              )}
            </Alert>
          </Box>
        )}
      </Box>

      <Composer disabled={state.isStreaming} onSubmit={send} />
    </Dialog>
  );
}
