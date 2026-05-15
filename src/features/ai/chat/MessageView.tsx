/**
 * Renders one assistant turn (markdown text + any tool-call accordions)
 * or one user turn (a right-aligned bubble). assistant-ui hands us the
 * MessagePrimitive context; we control the visual layout with MUI.
 *
 * The composer for editing a user message is intentionally omitted — we
 * don't support editing in MVP. assistant-ui's runtime won't expose an
 * Edit action because we don't declare `onEdit` on the external store
 * adapter.
 */

import { ActionBarPrimitive, MessagePrimitive, useMessage } from '@assistant-ui/react';
import { Box, IconButton, Stack } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { MarkdownText } from '@/features/ai/chat/MarkdownText';
import { ToolCallView } from '@/features/ai/chat/ToolCallView';

export function UserMessage() {
  return (
    <MessagePrimitive.Root asChild>
      <Stack direction="row" justifyContent="flex-end" sx={{ px: 2, py: 0.5 }}>
        <Box
          sx={{
            maxWidth: '85%',
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            borderRadius: 2,
            px: 1.5,
            py: 1,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          <MessagePrimitive.Parts components={{ Text: PlainText }} />
        </Box>
      </Stack>
    </MessagePrimitive.Root>
  );
}

export function AssistantMessage() {
  return (
    <MessagePrimitive.Root asChild>
      <Stack sx={{ px: 2, py: 0.5 }} spacing={0.5}>
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            tools: { Fallback: ToolCallView },
          }}
        />
        <AssistantActions />
      </Stack>
    </MessagePrimitive.Root>
  );
}

/** User turns aren't markdown — they're whatever the user typed, verbatim. */
function PlainText({ text }: { text: string }) {
  return <>{text}</>;
}

function AssistantActions() {
  // Hide the action bar while the model is still streaming this turn,
  // and on empty turns (pure tool-calls with no text yet).
  const message = useMessage();
  const status = message.status?.type;
  if (status === 'running') return null;
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="single-branch"
      asChild
    >
      <Stack direction="row" spacing={0.5} sx={{ pl: 0.5, opacity: 0.7 }}>
        <ActionBarPrimitive.Copy asChild>
          <IconButton size="small" aria-label="Copy">
            <ContentCopyIcon fontSize="inherit" />
          </IconButton>
        </ActionBarPrimitive.Copy>
      </Stack>
    </ActionBarPrimitive.Root>
  );
}
