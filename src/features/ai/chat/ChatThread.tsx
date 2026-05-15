/**
 * Mounts the assistant-ui runtime around a MUI-styled thread layout:
 *   Viewport (scrollable) → Messages (one row per turn)
 *     → AssistantMessage / UserMessage
 *   Empty state when no messages
 *   Floating "jump to latest" button when the user has scrolled away
 *   Composer pinned at the bottom
 */

import { useEffect } from 'react';
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
} from '@assistant-ui/react';
import { Alert, Box, Button, Fab, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useChatRuntime } from '@/features/ai/chat/useChatRuntime';
import { useChatSession } from '@/features/ai/chat/useChatSession';
import { AssistantMessage, UserMessage } from '@/features/ai/chat/MessageView';
import { ComposerView } from '@/features/ai/chat/ComposerView';

export interface ChatThreadHandles {
  onReset?: () => void;
}

/**
 * Exposes the underlying chat session to ChatDialog so the "New
 * conversation" button can reset it without ChatThread having to know
 * about dialog chrome.
 */
export function ChatThread({
  onSessionReady,
}: {
  onSessionReady?: (api: { reset: () => Promise<void>; isEmpty: boolean }) => void;
}) {
  const session = useChatSession();
  const runtime = useChatRuntime(session);

  useEffect(() => {
    if (!onSessionReady) return;
    onSessionReady({
      reset: session.reset,
      isEmpty: session.state.messages.length === 0,
    });
  }, [onSessionReady, session.reset, session.state.messages.length]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        <ThreadPrimitive.Root asChild>
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <ThreadPrimitive.Viewport
              asChild
              autoScroll
            >
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  py: 1,
                }}
              >
                <ThreadPrimitive.Empty>
                  <EmptyState />
                </ThreadPrimitive.Empty>

                <ThreadPrimitive.Messages
                  components={{
                    UserMessage,
                    AssistantMessage,
                  }}
                />
              </Box>
            </ThreadPrimitive.Viewport>

            {session.state.error && (
              <Box sx={{ px: 2, py: 1 }}>
                <Alert severity="warning" variant="outlined">
                  {session.state.error}
                  {session.state.error.includes('No AI provider configured') && (
                    <Box sx={{ mt: 1 }}>
                      <Button
                        component={RouterLink}
                        to="/settings"
                        size="small"
                        variant="outlined"
                      >
                        Open Settings
                      </Button>
                    </Box>
                  )}
                </Alert>
              </Box>
            )}

            <ThreadPrimitive.ScrollToBottom asChild>
              <Fab
                color="default"
                size="small"
                aria-label="Jump to latest"
                sx={{
                  position: 'absolute',
                  // Above the composer, but not blocking the input area.
                  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
                  right: 16,
                  zIndex: 1,
                }}
              >
                <KeyboardArrowDownIcon />
              </Fab>
            </ThreadPrimitive.ScrollToBottom>

            <ComposerView />
          </Box>
        </ThreadPrimitive.Root>
      </Box>
    </AssistantRuntimeProvider>
  );
}

function EmptyState() {
  return (
    <Stack
      spacing={1.5}
      sx={{
        px: 3,
        pt: 6,
        pb: 4,
        alignItems: 'center',
        textAlign: 'center',
        color: 'text.secondary',
      }}
    >
      <Typography variant="body1" color="text.primary">
        Ask anything about your training.
      </Typography>
      <Typography variant="body2">Try:</Typography>
      <Typography variant="body2">"How has my squat trended over the past 6 weeks?"</Typography>
      <Typography variant="body2">"Am I making progress on bench at 5×5 vs 8-12?"</Typography>
    </Stack>
  );
}
