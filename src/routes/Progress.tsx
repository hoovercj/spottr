import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { ProgressChart } from '@/components/ProgressChart';
import { BottomListDrawer } from '@/components/BottomListDrawer';
import {
  makeSeriesKey,
  parseSeriesKey,
  repRangeLabel,
  useAllChartableBuckets,
  useDefaultProgressBuckets,
  useProgressData,
} from '@/features/progress/queries';
import type { ChartableBucket, ProgressBucket } from '@/features/progress/queries';

interface FamilyGroup {
  familyId: string;
  familyName: string;
  buckets: ChartableBucket[];
}

function groupByFamily(all: ChartableBucket[]): FamilyGroup[] {
  const map = new Map<string, FamilyGroup>();
  for (const b of all) {
    let group = map.get(b.liftFamilyId);
    if (!group) {
      group = { familyId: b.liftFamilyId, familyName: b.liftFamilyName, buckets: [] };
      map.set(b.liftFamilyId, group);
    }
    group.buckets.push(b);
  }
  return [...map.values()].sort((a, b) => a.familyName.localeCompare(b.familyName));
}

function bucketLabel(b: ChartableBucket): string {
  const range = repRangeLabel(b.plannedRepsMin, b.plannedRepsMax);
  const reps = b.isBodyweight ? ' reps' : '';
  return `${b.liftFamilyName} (${b.variantName}) · ${range}${reps}`;
}

export function Progress() {
  const defaults = useDefaultProgressBuckets();
  const all = useAllChartableBuckets();
  const [selectedKeys, setSelectedKeys] = useState<string[] | null>(null);
  const [pickerStep, setPickerStep] = useState<'closed' | 'family' | 'bucket'>('closed');
  const [pickerFamilyId, setPickerFamilyId] = useState<string | null>(null);

  // Seed the selection with the active routine's first-lift buckets once
  // both queries have resolved. Only include defaults that actually have
  // logged data in that exact (variant, rep range) — otherwise the chart
  // sits empty even though the picker has other usable buckets.
  useEffect(() => {
    if (selectedKeys !== null) return;
    if (!defaults || !all) return;
    if (defaults.length === 0) return;
    const chartableKeys = new Set(all.map((b) => b.seriesKey));
    const seedKeys = defaults
      .map((b) => makeSeriesKey(b.variantId, b.plannedRepsMin, b.plannedRepsMax))
      .filter((k) => chartableKeys.has(k));
    if (seedKeys.length === 0) return;
    setSelectedKeys(seedKeys);
  }, [defaults, all, selectedKeys]);

  const effectiveSelection: string[] = useMemo(() => selectedKeys ?? [], [selectedKeys]);
  const buckets: ProgressBucket[] = useMemo(
    () =>
      effectiveSelection
        .map((k) => parseSeriesKey(k))
        .filter((b): b is ProgressBucket => b !== null),
    [effectiveSelection],
  );
  const data = useProgressData(buckets);
  const bucketByKey = useMemo(() => {
    const m = new Map<string, ChartableBucket>();
    for (const b of all ?? []) m.set(b.seriesKey, b);
    return m;
  }, [all]);
  const families = useMemo(() => groupByFamily(all ?? []), [all]);

  const remove = (seriesKey: string) => {
    setSelectedKeys((cur) => (cur ?? []).filter((x) => x !== seriesKey));
  };

  const toggle = (seriesKey: string) => {
    setSelectedKeys((cur) => {
      const base = cur ?? [];
      if (base.includes(seriesKey)) return base.filter((x) => x !== seriesKey);
      return [...base, seriesKey];
    });
  };

  const onPickFamily = (familyId: string) => {
    const group = families.find((g) => g.familyId === familyId);
    if (!group) return;
    if (group.buckets.length === 1) {
      // Family has exactly one bucket logged — add directly, no second step.
      toggle(group.buckets[0]!.seriesKey);
      closePicker();
      return;
    }
    setPickerFamilyId(familyId);
    setPickerStep('bucket');
  };

  const closePicker = () => {
    setPickerStep('closed');
    setPickerFamilyId(null);
  };

  const bucketsForCurrentFamily = pickerFamilyId
    ? (families.find((g) => g.familyId === pickerFamilyId)?.buckets ?? [])
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
            Top set per session within each rep range. Weight on the left, bodyweight reps on the
            right.
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
            {effectiveSelection.map((key) => {
              const b = bucketByKey.get(key);
              const label = b ? bucketLabel(b) : key;
              return <Chip key={key} label={label} onDelete={() => remove(key)} size="small" />;
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
            const allOn = g.buckets.every((b) => effectiveSelection.includes(b.seriesKey));
            const someOn = g.buckets.some((b) => effectiveSelection.includes(b.seriesKey));
            const subtitle =
              g.buckets.length === 1
                ? repRangeLabel(g.buckets[0]!.plannedRepsMin, g.buckets[0]!.plannedRepsMax) +
                  ' reps'
                : `${g.buckets.length} buckets logged`;
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
                  <Typography variant="caption" color="text.secondary">
                    {subtitle}
                  </Typography>
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
        open={pickerStep === 'bucket'}
        title="Choose variant + rep range"
        onBack={() => setPickerStep('family')}
        onClose={closePicker}
      >
        <Stack>
          {bucketsForCurrentFamily.map((b) => {
            const on = effectiveSelection.includes(b.seriesKey);
            const range = repRangeLabel(b.plannedRepsMin, b.plannedRepsMax);
            return (
              <Box
                key={b.seriesKey}
                component="button"
                type="button"
                onClick={() => toggle(b.seriesKey)}
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
                  <Typography variant="body1">
                    {b.variantName} · {range}
                    {b.isBodyweight ? ' reps' : ''}
                  </Typography>
                  {b.isBodyweight && (
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
