import { useEffect, useState } from 'react';
import { Box, Checkbox, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import type { CardioModality } from '@/data/types';
import { setCardio, toggleStretch } from '@/features/sundries/actions';
import { useCardioForSession, useStretchForSession } from '@/features/sundries/hooks';

const MODALITIES: { value: CardioModality; label: string }[] = [
  { value: 'exercise-bike', label: 'Exercise bike' },
  { value: 'stair-stepper', label: 'Stair stepper' },
  { value: 'treadmill', label: 'Treadmill' },
  { value: 'outdoor-run', label: 'Outdoor run' },
  { value: 'rowing-erg', label: 'Rowing erg' },
];

const DEFAULT_MODALITY: CardioModality = 'exercise-bike';

interface Props {
  sessionId: string;
}

export function StretchCardioRow({ sessionId }: Props) {
  const stretch = useStretchForSession(sessionId);
  const cardio = useCardioForSession(sessionId);

  const [modality, setModality] = useState<CardioModality>(DEFAULT_MODALITY);
  const [duration, setDuration] = useState<string>('');

  // Sync local state when a session's cardio row first loads or changes.
  useEffect(() => {
    if (cardio) {
      setModality(cardio.modality);
      setDuration(cardio.durationMin != null ? String(cardio.durationMin) : '');
    }
  }, [cardio]);

  const cardioDone = cardio != null && !cardio.skipped;

  // Commit the row from current local + checkbox state.
  const commit = (opts: {
    nextChecked?: boolean;
    nextModality?: CardioModality;
    nextDuration?: string;
  }) => {
    const nextChecked = opts.nextChecked ?? cardioDone;
    const nextModality = opts.nextModality ?? modality;
    const nextDuration = opts.nextDuration ?? duration;
    const parsedDuration = nextDuration === '' ? undefined : parseFloat(nextDuration);
    void setCardio({
      sessionId,
      modality: nextModality,
      skipped: !nextChecked,
      ...(parsedDuration != null && Number.isFinite(parsedDuration)
        ? { durationMin: parsedDuration }
        : {}),
    });
  };

  const onToggleCheckbox = (checked: boolean) => commit({ nextChecked: checked });

  const onModalityChange = (next: CardioModality) => {
    setModality(next);
    if (cardio) commit({ nextModality: next });
  };

  const onDurationBlur = () => {
    if (cardio) commit({ nextDuration: duration });
  };

  return (
    <Stack
      spacing={0}
      divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}
      sx={{ borderTop: '1px solid', borderColor: 'divider' }}
    >
      {/* Cardio row: modality | duration | checkbox */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr 48px',
          alignItems: 'center',
          columnGap: 1,
          minHeight: 56,
          py: 0.5,
        }}
      >
        <Select
          value={modality}
          size="small"
          onChange={(e) => onModalityChange(e.target.value as CardioModality)}
          aria-label="Cardio modality"
        >
          {MODALITIES.map((m) => (
            <MenuItem key={m.value} value={m.value}>
              {m.label}
            </MenuItem>
          ))}
        </Select>
        <TextField
          value={duration}
          onChange={(e) => setDuration(e.target.value.replace(/[^0-9.]/g, ''))}
          onBlur={onDurationBlur}
          placeholder="min"
          size="small"
          inputMode="numeric"
          slotProps={{ htmlInput: { 'aria-label': 'Cardio duration in minutes' } }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Checkbox
            checked={cardioDone}
            onChange={(e) => onToggleCheckbox(e.target.checked)}
            inputProps={{ 'aria-label': 'Log cardio' }}
            sx={{ width: 48, height: 48 }}
          />
        </Box>
      </Box>

      {/* Stretch row: label | (spacer) | checkbox */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 48px',
          alignItems: 'center',
          minHeight: 56,
          py: 0.5,
        }}
      >
        <Typography variant="body1">Stretched</Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Checkbox
            checked={stretch?.done ?? false}
            onChange={(e) => void toggleStretch(sessionId, e.target.checked)}
            inputProps={{ 'aria-label': 'Log stretching' }}
            sx={{ width: 48, height: 48 }}
          />
        </Box>
      </Box>
    </Stack>
  );
}
