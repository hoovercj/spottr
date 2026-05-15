import { Box, Stack, Typography } from '@mui/material';
import type { AIMessage } from '@/features/ai/providers/types';

/**
 * One conversation turn. User bubbles right-align with a colored fill;
 * assistant bubbles flow full-width. Tool-call turns render a tiny "ran
 * tool X" trace line so the user can see grounding without it dominating.
 * `role: 'tool'` messages aren't rendered directly — the trace line on
 * the preceding assistant turn already covers what the user needs.
 */
export function MessageBubble({ msg }: { msg: AIMessage }) {
  if (msg.role === 'tool' || msg.role === 'system') return null;
  if (msg.role === 'user') {
    return (
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
          <Typography variant="body1">{msg.content}</Typography>
        </Box>
      </Stack>
    );
  }
  // Assistant turn — may have toolCalls and/or content.
  return (
    <Stack sx={{ px: 2, py: 0.5 }} spacing={0.5}>
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          {msg.toolCalls.map((c) => `· ran ${c.name}`).join('  ')}
        </Typography>
      )}
      {msg.content && (
        <Typography
          variant="body1"
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {msg.content}
        </Typography>
      )}
    </Stack>
  );
}
