/**
 * Renders a single tool-call part as a collapsible MUI accordion. Shows
 * tool name + status pill in the header; expanding reveals the args
 * the model sent and the result the runner returned. Color-coded:
 * pending = neutral, done = green, error = red.
 *
 * Used as the `tools.Fallback` slot in MessagePrimitive.Parts so every
 * tool call in the catalog renders the same way without needing one
 * registered renderer per tool.
 */

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { ToolCallMessagePartProps } from '@assistant-ui/react';

function pretty(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function ToolCallView({
  toolName,
  args,
  result,
  isError,
  status,
}: ToolCallMessagePartProps) {
  const running = status?.type === 'running';
  const done = status?.type === 'complete' && result !== undefined;
  const errored = Boolean(isError);

  const pillColor = errored
    ? 'error.main'
    : done
      ? 'success.main'
      : running
        ? 'text.secondary'
        : 'text.secondary';
  const pillLabel = errored ? 'error' : running ? 'running…' : done ? 'done' : 'pending';

  return (
    <Accordion
      disableGutters
      elevation={0}
      square
      sx={{
        my: 0.5,
        bgcolor: 'action.hover',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        '&::before': { display: 'none' },
        '&.Mui-expanded': { margin: '4px 0' },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon fontSize="small" />}
        sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }}>
          <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
            {toolName}
          </Typography>
          <Typography
            component="span"
            variant="caption"
            sx={{ color: pillColor, fontFamily: 'monospace' }}
          >
            {pillLabel}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Stack spacing={1}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              args
            </Typography>
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1,
                bgcolor: 'background.paper',
                borderRadius: 0.5,
                fontFamily: 'monospace',
                fontSize: '0.78em',
                overflowX: 'auto',
                maxHeight: 220,
                overflowY: 'auto',
              }}
            >
              {pretty(args)}
            </Box>
          </Box>
          {result !== undefined && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                result
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1,
                  bgcolor: 'background.paper',
                  borderRadius: 0.5,
                  fontFamily: 'monospace',
                  fontSize: '0.78em',
                  overflowX: 'auto',
                  maxHeight: 320,
                  overflowY: 'auto',
                }}
              >
                {pretty(result)}
              </Box>
            </Box>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
