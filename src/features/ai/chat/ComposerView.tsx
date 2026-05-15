/**
 * Sticky-bottom composer styled with MUI on top of ComposerPrimitive.
 * The send button becomes a stop button while the model is generating;
 * both states share the same 48px tap target. Safe-area padding keeps
 * the home-bar from eating the affordance on iOS.
 */

import { ComposerPrimitive, useThread } from '@assistant-ui/react';
import { Box, IconButton, TextField, Tooltip } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';

export function ComposerView() {
  // ComposerPrimitive.If only filters on composer-local state (editing,
  // dictation) — not on whether the *thread* is running. We pull the
  // thread state directly so the Send/Stop swap is correct.
  const isRunning = useThread((t) => t.isRunning);

  return (
    <ComposerPrimitive.Root asChild>
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
          px: 1.5,
          py: 1,
          pb: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 1,
        }}
      >
        <ComposerPrimitive.Input asChild>
          <TextField
            placeholder="Ask about your training…"
            multiline
            maxRows={4}
            fullWidth
            size="small"
            slotProps={{
              htmlInput: {
                inputMode: 'text',
                enterKeyHint: 'send',
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: 3 },
            }}
          />
        </ComposerPrimitive.Input>

        {isRunning ? (
          <ComposerPrimitive.Cancel asChild>
            <Tooltip title="Stop">
              <IconButton
                color="primary"
                aria-label="Stop"
                sx={{ width: 48, height: 48 }}
              >
                <StopIcon />
              </IconButton>
            </Tooltip>
          </ComposerPrimitive.Cancel>
        ) : (
          <ComposerPrimitive.Send asChild>
            <Tooltip title="Send">
              <IconButton
                color="primary"
                aria-label="Send"
                sx={{ width: 48, height: 48 }}
              >
                <SendIcon />
              </IconButton>
            </Tooltip>
          </ComposerPrimitive.Send>
        )}
      </Box>
    </ComposerPrimitive.Root>
  );
}
