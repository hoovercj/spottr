/**
 * Custom numeric keypad — fits the rack-side input contract from UX spec §7.
 *
 * We do not use the OS soft keyboard; doing so causes reflow during set logging.
 * The keypad is rendered as a SwipeableDrawer anchored to the bottom so it
 * sits in the left-thumb-reachable zone (NFR14).
 */

import { useEffect, useState } from 'react';
import { Box, Button, IconButton, Stack, SwipeableDrawer, Typography } from '@mui/material';

export type KeypadVariant = 'weight' | 'reps';

export interface NumericKeypadProps {
  open: boolean;
  variant: KeypadVariant;
  initialValue: number;
  unitLabel: string;
  /** Plate / rep increment (e.g., 5 lb or 2.5 kg). */
  step: number;
  onConfirm: (value: number) => void;
  onCancel: () => void;
}

export function NumericKeypad(props: NumericKeypadProps) {
  const [draft, setDraft] = useState<string>(String(props.initialValue));

  useEffect(() => {
    if (props.open) {
      setDraft(String(props.initialValue));
    }
  }, [props.open, props.initialValue]);

  const parsed = parseDraft(draft, props.variant);
  const canConfirm = parsed !== null && parsed >= 0;

  const appendDigit = (d: string) => {
    setDraft((cur) => {
      const next = cur === '0' ? d : cur + d;
      return next;
    });
  };

  const appendDot = () => {
    if (props.variant !== 'weight') return;
    if (draft.includes('.')) return;
    setDraft((cur) => (cur === '' ? '0.' : cur + '.'));
  };

  const clear = () => setDraft('');

  const step = (delta: number) => {
    const current = parsed ?? 0;
    const next = Math.max(
      0,
      roundToStep(current + delta, props.variant === 'weight' ? props.step : 1),
    );
    setDraft(formatDraftValue(next, props.variant));
  };

  const confirm = () => {
    if (parsed !== null) props.onConfirm(parsed);
  };

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={props.open}
      onOpen={() => undefined}
      onClose={props.onCancel}
      disableSwipeToOpen
      ModalProps={{ keepMounted: false }}
    >
      <Box
        sx={{
          p: 2,
          pb: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="body2" color="text.secondary">
            {props.variant === 'weight' ? 'Weight' : 'Reps'} ({props.unitLabel})
          </Typography>
          <IconButton onClick={props.onCancel} aria-label="Close keypad" size="small">
            ✕
          </IconButton>
        </Stack>

        <Typography
          variant="h1"
          className="numeric-cell"
          aria-live="polite"
          sx={{ textAlign: 'center', fontSize: '3rem', minHeight: '3.5rem' }}
        >
          {draft || '0'}
        </Typography>

        <Stack direction="row" spacing={1.5} justifyContent="space-between">
          <Button
            variant="text"
            onClick={() => step(-(props.variant === 'weight' ? props.step : 1))}
            aria-label={`decrease by ${props.variant === 'weight' ? props.step : 1}`}
            sx={{ flex: 1, minHeight: 48 }}
          >
            − {props.variant === 'weight' ? props.step : 1}
          </Button>
          <Button
            variant="text"
            onClick={() => step(props.variant === 'weight' ? props.step : 1)}
            aria-label={`increase by ${props.variant === 'weight' ? props.step : 1}`}
            sx={{ flex: 1, minHeight: 48 }}
          >
            + {props.variant === 'weight' ? props.step : 1}
          </Button>
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 1,
          }}
        >
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <Button
              key={d}
              variant="text"
              onClick={() => appendDigit(d)}
              aria-label={`digit ${d}`}
              sx={{ minHeight: 56, fontSize: '1.25rem' }}
            >
              {d}
            </Button>
          ))}
          <Button
            variant="text"
            onClick={clear}
            aria-label="clear"
            sx={{ minHeight: 56, fontSize: '1.25rem' }}
          >
            clr
          </Button>
          <Button
            variant="text"
            onClick={() => appendDigit('0')}
            aria-label="digit 0"
            sx={{ minHeight: 56, fontSize: '1.25rem' }}
          >
            0
          </Button>
          <Button
            variant="text"
            onClick={appendDot}
            aria-label="decimal point"
            disabled={props.variant !== 'weight'}
            sx={{ minHeight: 56, fontSize: '1.25rem' }}
          >
            .
          </Button>
        </Box>

        <Button
          variant="contained"
          fullWidth
          disabled={!canConfirm}
          onClick={confirm}
          sx={{ minHeight: 56 }}
        >
          Done
        </Button>
      </Box>
    </SwipeableDrawer>
  );
}

function parseDraft(s: string, variant: KeypadVariant): number | null {
  if (s === '' || s === '.') return null;
  const n = variant === 'weight' ? parseFloat(s) : parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function roundToStep(n: number, step: number): number {
  const inv = 1 / step;
  return Math.round(n * inv) / inv;
}

function formatDraftValue(n: number, variant: KeypadVariant): string {
  if (variant === 'reps') return String(Math.round(n));
  // Trim trailing .0 noise for weight values.
  const fixed = n.toFixed(2);
  return fixed.replace(/\.?0+$/, '') || '0';
}
