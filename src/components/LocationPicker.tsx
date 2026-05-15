import { useEffect, useState } from 'react';
import { Box, Button, Stack, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { BottomListDrawer } from '@/components/BottomListDrawer';
import { InlineRenameRow } from '@/components/InlineRenameRow';
import { NO_LOCATION_NAME } from '@/data/seed';
import type { Location, Units } from '@/data/types';
import { useAllLocations, useCurrentLocation } from '@/features/locations/hooks';
import {
  createLocation,
  renameLocation,
  setCurrentLocationId,
  setLocationUnits,
} from '@/features/locations/actions';
import { useUserSettings } from '@/features/settings/hooks';

export interface LocationPickerProps {
  open: boolean;
  onClose: () => void;
}

export function LocationPicker({ open, onClose }: LocationPickerProps) {
  const locations = useAllLocations();
  const current = useCurrentLocation();
  const settings = useUserSettings();
  const [newName, setNewName] = useState('');
  const [newUnits, setNewUnits] = useState<Units>('lb');

  // When the picker opens (or user-default changes), seed the new-location
  // unit toggle with the user default.
  useEffect(() => {
    if (settings) setNewUnits(settings.units);
  }, [settings, open]);

  const onCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await createLocation({ name: trimmed, units: newUnits });
    setNewName('');
    onClose();
  };

  return (
    <BottomListDrawer
      open={open}
      title="Location"
      onClose={onClose}
      footer={
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New location name"
              size="small"
              fullWidth
              slotProps={{ htmlInput: { 'aria-label': 'New location name' } }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void onCreate();
                }
              }}
            />
            <UnitsToggle
              value={newUnits}
              onChange={setNewUnits}
              ariaLabel="Units for new location"
            />
            <Button variant="contained" onClick={() => void onCreate()} disabled={!newName.trim()}>
              Add
            </Button>
          </Stack>
        </Stack>
      }
    >
      <Box>
        {sortedWithCurrentFirst(locations ?? [], current?.id).map((loc) => (
          <LocationRow
            key={loc.id}
            location={loc}
            isCurrent={current?.id === loc.id}
            defaultUnits={settings?.units ?? 'lb'}
            onSelect={() => {
              void setCurrentLocationId(loc.id);
              onClose();
            }}
            onRename={async (next) => {
              await renameLocation(loc.id, next);
            }}
            onChangeUnits={(u) => void setLocationUnits(loc.id, u)}
          />
        ))}
      </Box>
    </BottomListDrawer>
  );
}

function sortedWithCurrentFirst<T extends { id: string }>(items: T[], currentId?: string): T[] {
  if (!currentId) return items;
  const idx = items.findIndex((x) => x.id === currentId);
  if (idx < 0) return items;
  const cur = items[idx]!;
  return [cur, ...items.slice(0, idx), ...items.slice(idx + 1)];
}

interface LocationRowProps {
  location: Location;
  isCurrent: boolean;
  defaultUnits: Units;
  onSelect: () => void;
  onRename: (next: string) => void | Promise<void>;
  onChangeUnits: (units: Units) => void;
}

function LocationRow({
  location,
  isCurrent,
  defaultUnits,
  onSelect,
  onRename,
  onChangeUnits,
}: LocationRowProps) {
  const isBuiltin = location.name === NO_LOCATION_NAME;
  const resolvedUnits: Units = location.units ?? defaultUnits;

  return (
    <InlineRenameRow
      label={location.name}
      isCurrent={isCurrent}
      canEdit={!isBuiltin}
      extraActions={
        isCurrent && !isBuiltin ? (
          <UnitsToggle
            value={resolvedUnits}
            onChange={onChangeUnits}
            ariaLabel={`Units for ${location.name}`}
          />
        ) : null
      }
      onSelect={onSelect}
      onRename={onRename}
    />
  );
}

interface UnitsToggleProps {
  value: Units;
  onChange: (next: Units) => void;
  ariaLabel: string;
}

function UnitsToggle({ value, onChange, ariaLabel }: UnitsToggleProps) {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      size="small"
      aria-label={ariaLabel}
      onChange={(_e, next: Units | null) => {
        if (next) onChange(next);
      }}
      sx={{ '& .MuiToggleButton-root': { px: 1, py: 0.5, minWidth: 0 } }}
    >
      <ToggleButton value="lb">lb</ToggleButton>
      <ToggleButton value="kg">kg</ToggleButton>
    </ToggleButtonGroup>
  );
}
