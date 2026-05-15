/**
 * Sticky-bottom composer styled with MUI on top of ComposerPrimitive.
 * The send button becomes a stop button while the model is generating;
 * both states share the same 48px tap target. Safe-area padding keeps
 * the home-bar from eating the affordance on iOS.
 */

import type { KeyboardEvent } from 'react';
import { ComposerPrimitive, useComposerRuntime, useThread } from '@assistant-ui/react';
import { Box, IconButton, TextField } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';

export function ComposerView() {
  // ComposerPrimitive.If only filters on composer-local state (editing,
  // dictation) — not on whether the *thread* is running. We pull the
  // thread state directly so the Send/Stop swap is correct.
  const isRunning = useThread((t) => t.isRunning);
  const composer = useComposerRuntime();

  // ComposerPrimitive.Input ships built-in Enter-to-send via `submitMode`,
  // but that handler attaches to the rendered element. We use `asChild`
  // with MUI's TextField, which forwards props to its OUTER wrapper, not
  // to the inner textarea where the user actually presses keys — so the
  // primitive's keydown never fires. We wire submit ourselves on the
  // inner input element via slotProps.htmlInput.
  const onInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;
    if (e.shiftKey) return; // Shift+Enter → newline
    if (e.nativeEvent.isComposing) return; // IME composing → don't submit
    e.preventDefault();
    void composer.send();
  };

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
          // Center-align: a 48px IconButton next to a small TextField looks
          // best with their visual centers aligned. flex-end would put both
          // bottoms flush, but the icon's optical center then sits noticeably
          // higher than the text baseline of the field.
          alignItems: 'center',
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
                onKeyDown: onInputKeyDown,
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: 3 },
            }}
          />
        </ComposerPrimitive.Input>

        {isRunning ? (
          <ComposerPrimitive.Cancel asChild>
            <IconButton color="primary" aria-label="Stop" sx={{ width: 48, height: 48 }}>
              <StopIcon />
            </IconButton>
          </ComposerPrimitive.Cancel>
        ) : (
          <ComposerPrimitive.Send asChild>
            <IconButton color="primary" aria-label="Send" sx={{ width: 48, height: 48 }}>
              <SendIcon />
            </IconButton>
          </ComposerPrimitive.Send>
        )}
      </Box>
    </ComposerPrimitive.Root>
  );
}
