import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { ProgressChart } from '@/components/ProgressChart';
import { BottomListDrawer } from '@/components/BottomListDrawer';
import {
  useAllChartableVariants,
  useDefaultProgressVariants,
  useProgressData,
} from '@/features/progress/queries';
import type { ChartableVariant } from '@/features/progress/queries';

interface FamilyGroup {
  familyId: string;
  familyName: string;
  variants: ChartableVariant[];
}

function groupByFamily(all: ChartableVariant[]): FamilyGroup[] {
  const map = new Map<string, FamilyGroup>();
  for (const v of all) {
    let group = map.get(v.liftFamilyId);
    if (!group) {
      group = { familyId: v.liftFamilyId, familyName: v.liftFamilyName, variants: [] };
      map.set(v.liftFamilyId, group);
    }
    group.variants.push(v);
  }
  return [...map.values()].sort((a, b) => a.familyName.localeCompare(b.familyName));
}

export function Progress() {
  const defaults = useDefaultProgressVariants();
  const all = useAllChartableVariants();
  const [selected, setSelected] = useState<string[] | null>(null);
  const [pickerStep, setPickerStep] = useState<'closed' | 'family' | 'variant'>('closed');
  const [pickerFamilyId, setPickerFamilyId] = useState<string | null>(null);

  // Seed the selection with the active routine's first lifts once both
  // queries have resolved. Only include defaults that actually have logged
  // data — otherwise the chart sits empty even though other variants in the
  // library have history.
  useEffect(() => {
    if (selected !== null) return;
    if (!defaults || !all) return;
    if (defaults.length === 0) return;
    const chartableIds = new Set(all.map((v) => v.variantId));
    const filtered = defaults.filter((id) => chartableIds.has(id));
    if (filtered.length === 0) return;
    setSelected(filtered);
  }, [defaults, all, selected]);

  const effectiveSelection = useMemo(() => selected ?? [], [selected]);
  const data = useProgressData(effectiveSelection);
  const variantById = useMemo(() => {
    const m = new Map<string, ChartableVariant>();
    for (const v of all ?? []) m.set(v.variantId, v);
    return m;
  }, [all]);
  const families = useMemo(() => groupByFamily(all ?? []), [all]);

  const remove = (variantId: string) => {
    setSelected((cur) => (cur ?? []).filter((x) => x !== variantId));
  };

  const addVariant = (variantId: string) => {
    setSelected((cur) => {
      const base = cur ?? [];
      if (base.includes(variantId)) return base;
      return [...base, variantId];
    });
  };

  const onPickFamily = (familyId: string) => {
    const group = families.find((g) => g.familyId === familyId);
    if (!group) return;
    if (group.variants.length === 1) {
      // Single variant with data — add directly, no second step.
      addVariant(group.variants[0]!.variantId);
      closePicker();
      return;
    }
    setPickerFamilyId(familyId);
    setPickerStep('variant');
  };

  const closePicker = () => {
    setPickerStep('closed');
    setPickerFamilyId(null);
  };

  const variantsForCurrentFamily = pickerFamilyId
    ? (families.find((g) => g.familyId === pickerFamilyId)?.variants ?? [])
    : [];

  return (
    <Box
      component="main"
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
      }}
    >
      {/* Fixed header */}
      <Box
        sx={{
          flexShrink: 0,
          px: 3,
          pt: 3,
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack spacing={0.5}>
          <Typography variant="h1">Progress</Typography>
          <Typography variant="body2" color="text.secondary">
            Top set per session. Weight on the left axis, bodyweight reps on the right.
          </Typography>
        </Stack>
      </Box>

      {/* Scrollable body */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          px: 3,
          py: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        <ProgressChart data={data} />

        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            Exercises on the chart
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {effectiveSelection.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No exercises selected.
              </Typography>
            )}
            {effectiveSelection.map((id) => {
              const v = variantById.get(id);
              const label = v
                ? `${v.liftFamilyName} · ${v.variantName}${v.isBodyweight ? ' (reps)' : ''}`
                : id;
              return <Chip key={id} label={label} onDelete={() => remove(id)} size="small" />;
            })}
          </Stack>
          <Button
            variant="text"
            onClick={() => setPickerStep('family')}
            sx={{ alignSelf: 'flex-start' }}
          >
            + Add exercise
          </Button>
          {all && all.length === 0 && (
            <Typography variant="caption" color="text.secondary">
              Log a workout to start populating the chart.
            </Typography>
          )}
        </Stack>
      </Box>

      <BottomListDrawer
        open={pickerStep === 'family'}
        title="Add exercise to chart"
        onClose={closePicker}
      >
        <Stack>
          {families.map((g) => {
            const allOn = g.variants.every((v) => effectiveSelection.includes(v.variantId));
            const someOn = g.variants.some((v) => effectiveSelection.includes(v.variantId));
            return (
              <Box
                key={g.familyId}
                component="button"
                type="button"
                onClick={() => onPickFamily(g.familyId)}
                sx={{
                  all: 'unset',
                  cursor: 'pointer',
                  py: 1.5,
                  px: 1,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  minHeight: 56,
                  '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: 'primary.main',
                    outlineOffset: 2,
                  },
                }}
              >
                <Stack>
                  <Typography variant="body1">{g.familyName}</Typography>
                  {g.variants.length > 1 && (
                    <Typography variant="caption" color="text.secondary">
                      {g.variants.length} variants with data
                    </Typography>
                  )}
                </Stack>
                {allOn ? (
                  <Typography variant="caption" color="primary.main">
                    on chart
                  </Typography>
                ) : someOn ? (
                  <Typography variant="caption" color="text.secondary">
                    partly on chart
                  </Typography>
                ) : null}
              </Box>
            );
          })}
        </Stack>
      </BottomListDrawer>

      <BottomListDrawer
        open={pickerStep === 'variant'}
        title="Choose variant"
        onBack={() => setPickerStep('family')}
        onClose={closePicker}
      >
        <Stack>
          {variantsForCurrentFamily.map((v) => {
            const on = effectiveSelection.includes(v.variantId);
            return (
              <Box
                key={v.variantId}
                component="button"
                type="button"
                onClick={() => {
                  if (on) {
                    remove(v.variantId);
                  } else {
                    addVariant(v.variantId);
                  }
                }}
                sx={{
                  all: 'unset',
                  cursor: 'pointer',
                  py: 1.5,
                  px: 1,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  minHeight: 56,
                }}
              >
                <Stack>
                  <Typography variant="body1">{v.variantName}</Typography>
                  {v.isBodyweight && (
                    <Typography variant="caption" color="text.secondary">
                      plots reps on the right axis
                    </Typography>
                  )}
                </Stack>
                {on && (
                  <Typography variant="caption" color="primary.main">
                    on chart
                  </Typography>
                )}
              </Box>
            );
          })}
        </Stack>
      </BottomListDrawer>
    </Box>
  );
}
