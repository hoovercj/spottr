import { useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Box, Chip, Link, Stack, Typography } from '@mui/material';
import { useVariantHistory } from '@/features/history/queries';

export function HistoryVariant() {
  const params = useParams<{ variantId: string }>();
  const [repRange, setRepRange] = useState<{ min: number; max: number } | null>(null);
  const result = useVariantHistory(params.variantId ?? null, repRange ?? undefined);

  const ranges = useMemo(() => {
    if (!result) return [] as Array<{ min: number; max: number }>;
    const seen = new Set<string>();
    const out: Array<{ min: number; max: number }> = [];
    for (const row of result.rows) {
      for (const s of row.sets) {
        const k = `${s.plannedRepsMin}-${s.plannedRepsMax}`;
        if (!seen.has(k)) {
          seen.add(k);
          out.push({ min: s.plannedRepsMin, max: s.plannedRepsMax });
        }
      }
    }
    return out;
  }, [result]);

  if (result === undefined) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Loading…
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      component="main"
      sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', p: 3, gap: 3 }}
    >
      <Stack spacing={1}>
        <Link component={RouterLink} to="/history" underline="hover" variant="body2">
          ← History
        </Link>
        <Typography variant="h1">{result.variant?.name ?? 'Variant'}</Typography>
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip
          label="All ranges"
          onClick={() => setRepRange(null)}
          color={repRange === null ? 'primary' : 'default'}
          clickable
          size="small"
        />
        {ranges.map((r) => {
          const k = `${r.min}-${r.max}`;
          const display = r.min === r.max ? `${r.min}` : k;
          const active = repRange?.min === r.min && repRange.max === r.max;
          return (
            <Chip
              key={k}
              label={display}
              clickable
              onClick={() => setRepRange(r)}
              color={active ? 'primary' : 'default'}
              size="small"
            />
          );
        })}
      </Stack>

      {result.rows.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No previous data for this variant + rep range.
        </Typography>
      )}

      <Stack spacing={2}>
        {result.rows.map((row) => (
          <Box key={row.sessionLift.id}>
            <Link
              component={RouterLink}
              to={`/session/${row.session.id}`}
              state={{ origin: '/history' }}
              underline="hover"
              variant="body1"
              color="inherit"
            >
              {row.splitDayTypeName} · {formatDate(row.session.startedAt)} · {row.locationName}
            </Link>
            <Stack sx={{ mt: 0.5 }}>
              {row.sets.map((s) => (
                <Box
                  key={s.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '40px 1fr 1fr',
                    gap: 1,
                    py: 0.5,
                    alignItems: 'baseline',
                  }}
                >
                  <Typography variant="caption" color="text.secondary" className="numeric-cell">
                    {s.orderIndex + 1}
                  </Typography>
                  <Typography variant="body2" className="numeric-cell">
                    {s.loggedWeight != null ? `${s.loggedWeight} lb` : '—'}
                  </Typography>
                  <Typography variant="body2" className="numeric-cell">
                    {s.loggedReps != null ? `${s.loggedReps} reps` : '—'}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
  } catch {
    return iso;
  }
}
