/**
 * Builder dialog for "Create new exercise" — invoked from the exercise
 * picker when the seed library doesn't include what the user wants to log.
 *
 * Two modes:
 * - `kind: 'family'` — creates a new LiftFamily + its first Variant.
 * - `kind: 'variant'` — adds a Variant to an existing family (the user
 *   already picked the family and only needs a new variation of it).
 */

import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { EQUIPMENT_KINDS, type EquipmentKind } from '@/data/types';
import { createCustomExercise, createCustomVariant } from '@/features/library/actions';

type Mode = { kind: 'family' } | { kind: 'variant'; liftFamilyId: string; familyName: string };

export interface NewExerciseDialogProps {
  open: boolean;
  mode: Mode;
  onCancel: () => void;
  /** Receives the IDs of the (possibly new) family and variant. */
  onCreated: (result: { liftFamilyId: string; variantId: string }) => void;
}

const EQUIPMENT_LABELS: Record<EquipmentKind, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  'smith-machine': 'Smith machine',
  custom: 'Other',
};

export function NewExerciseDialog({ open, mode, onCancel, onCreated }: NewExerciseDialogProps) {
  const [familyName, setFamilyName] = useState('');
  const [variantName, setVariantName] = useState('');
  const [equipmentKind, setEquipmentKind] = useState<EquipmentKind>('barbell');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setFamilyName('');
    setVariantName('');
    setEquipmentKind('barbell');
    setBusy(false);
    setError(null);
  }, [open, mode.kind]);

  const isFamilyMode = mode.kind === 'family';
  const canSave =
    !busy && variantName.trim().length > 0 && (!isFamilyMode || familyName.trim().length > 0);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (isFamilyMode) {
        const r = await createCustomExercise({
          familyName,
          variantName,
          equipmentKind,
        });
        onCreated({ liftFamilyId: r.family.id, variantId: r.variant.id });
      } else {
        const v = await createCustomVariant({
          liftFamilyId: mode.liftFamilyId,
          variantName,
          equipmentKind,
        });
        onCreated({ liftFamilyId: mode.liftFamilyId, variantId: v.id });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create exercise.');
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} fullWidth maxWidth="xs">
      <DialogTitle>
        {isFamilyMode ? 'New exercise' : `New variant of ${mode.familyName}`}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {isFamilyMode && (
            <TextField
              label="Exercise"
              placeholder="e.g. Hip Thrust"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              fullWidth
              autoFocus
              size="small"
            />
          )}
          <TextField
            label="Variant"
            placeholder="e.g. Barbell, Cable, Sled…"
            value={variantName}
            onChange={(e) => setVariantName(e.target.value)}
            fullWidth
            autoFocus={!isFamilyMode}
            size="small"
          />
          <FormControl size="small" fullWidth>
            <InputLabel id="new-exercise-equipment">Equipment</InputLabel>
            <Select
              labelId="new-exercise-equipment"
              label="Equipment"
              value={equipmentKind}
              onChange={(e) => setEquipmentKind(e.target.value as EquipmentKind)}
            >
              {EQUIPMENT_KINDS.map((k) => (
                <MenuItem key={k} value={k}>
                  {EQUIPMENT_LABELS[k]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {error && (
            <Typography variant="body2" color="error.main">
              {error}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy} variant="text" color="inherit">
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={!canSave} variant="contained">
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
