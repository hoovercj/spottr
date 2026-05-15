/**
 * Single-session detail view — read + edit. Used both as the body of the
 * `/history/session/:id` route and inline inside the History feed card
 * expansion and the calendar tap-detail drawer.
 *
 * Reads the session via `useSessionDetail`; reads + edits logged sets
 * via `editLoggedSet`. Units come from the session's location override
 * with user-default fallback.
 */

import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, IconButton, Link, Stack, Typography } from '@mui/material';
import { DEFAULT_INCREMENT } from '@/data/types';
import { editLoggedSet } from '@/features/session/actions';
import { useSessionDetail } from '@/features/history/queries';
import { useUserSettings } from '@/features/settings/hooks';
import { NumericKeypad, type KeypadVariant } from '@/components/NumericKeypad';

export interface SessionSummaryProps {
  sessionId: string;
  /** When true, render the per-lift name as a link to its variant history. */
  linkLiftFamilies?: boolean;
}

export function SessionSummary({ sessionId, linkLiftFamilies = true }: SessionSummaryProps) {
  const detail = useSessionDetail(sessionId);
  const userSettings = useUserSettings();
  const [keypad, setKeypad] = useState<null | {
    setId: string;
    variant: KeypadVariant;
    initialValue: number;
  }>(null);

  if (detail === undefined) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
        Loading…
      </Typography>
    );
  }
  if (detail === null) {
    return (
      <Typography variant="body2" sx={{ p: 1 }}>
        Session not found.
      </Typography>
    );
  }

  const unitLabel = detail.locationUnits ?? userSettings?.units ?? 'lb';
  const weightStep = DEFAULT_INCREMENT[unitLabel];

  const onAdjustReps = (setId: string, currentReps: number | null, delta: number) => {
    const next = Math.max(0, (currentReps ?? 0) + delta);
    void editLoggedSet({ sessionSetId: setId, loggedReps: next });
  };

  const onConfirmKeypad = (value: number) => {
    if (!keypad) return;
    if (keypad.variant === 'weight') {
      void editLoggedSet({ sessionSetId: keypad.setId, loggedWeight: value });
    } else {
      void editLoggedSet({ sessionSetId: keypad.setId, loggedReps: value });
    }
    setKeypad(null);
  };

  return (
    <Stack spacing={2}>
      {detail.lifts.map((l) => {
        const logged = l.sets.filter((s) => s.loggedAt);
        return (
          <Box key={l.lift.id}>
            <Stack direction="row" alignItems="baseline" justifyContent="space-between">
              {linkLiftFamilies ? (
                <Link
                  component={RouterLink}
                  to={`/history/variant/${l.variant?.id ?? ''}`}
                  underline="hover"
                  variant="body1"
                  color="inherit"
                >
                  {l.familyName} · {l.variant?.name ?? '—'}
                </Link>
              ) : (
                <Typography variant="body1">
                  {l.familyName} · {l.variant?.name ?? '—'}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                {logged.length}/{l.sets.length}
              </Typography>
            </Stack>
            {l.lift.note && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {l.lift.note}
              </Typography>
            )}
            <Stack sx={{ mt: 0.5 }}>
              {l.sets.map((s) => {
                const weight = s.loggedWeight ?? null;
                const reps = s.loggedReps ?? null;
                return (
                  <Box
                    key={s.id}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '32px 1fr 1.3fr 24px',
                      columnGap: 0.5,
                      py: 0.5,
                      alignItems: 'center',
                      minHeight: 48,
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      className="numeric-cell"
                      sx={{ pl: 1 }}
                    >
                      {s.orderIndex + 1}
                    </Typography>
                    <Box
                      component="button"
                      type="button"
                      onClick={() =>
                        setKeypad({
                          setId: s.id,
                          variant: 'weight',
                          initialValue: weight ?? 0,
                        })
                      }
                      aria-label={`Edit weight for set ${s.orderIndex + 1}, currently ${weight ?? '—'} ${unitLabel}`}
                      sx={{
                        all: 'unset',
                        cursor: 'pointer',
                        py: 0.5,
                        px: 0.5,
                        minHeight: 44,
                        display: 'flex',
                        alignItems: 'center',
                        '&:focus-visible': {
                          outline: '2px solid',
                          outlineColor: 'primary.main',
                          outlineOffset: 2,
                        },
                      }}
                    >
                      <Typography variant="body2" className="numeric-cell">
                        {weight != null ? `${weight} ${unitLabel}` : '—'}
                      </Typography>
                    </Box>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <IconButton
                        size="small"
                        onClick={() => onAdjustReps(s.id, reps, -1)}
                        aria-label={`Decrease reps on set ${s.orderIndex + 1}`}
                        disabled={(reps ?? 0) <= 0}
                        sx={{ width: 40, height: 40, fontSize: '1.1rem' }}
                      >
                        −
                      </IconButton>
                      <Box
                        component="button"
                        type="button"
                        onClick={() =>
                          setKeypad({
                            setId: s.id,
                            variant: 'reps',
                            initialValue: reps ?? 0,
                          })
                        }
                        aria-label={`Edit reps for set ${s.orderIndex + 1}, currently ${reps ?? '—'} reps`}
                        sx={{
                          all: 'unset',
                          cursor: 'pointer',
                          px: 0.5,
                          minHeight: 40,
                          display: 'flex',
                          alignItems: 'center',
                          flex: 1,
                          justifyContent: 'center',
                          '&:focus-visible': {
                            outline: '2px solid',
                            outlineColor: 'primary.main',
                            outlineOffset: 2,
                          },
                        }}
                      >
                        <Typography variant="body2" className="numeric-cell">
                          {reps != null ? `${reps} reps` : '—'}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={() => onAdjustReps(s.id, reps, 1)}
                        aria-label={`Increase reps on set ${s.orderIndex + 1}`}
                        sx={{ width: 40, height: 40, fontSize: '1.1rem' }}
                      >
                        +
                      </IconButton>
                    </Stack>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ textAlign: 'right', pr: 0.5 }}
                    >
                      {s.loggedAt ? '✓' : '·'}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          </Box>
        );
      })}

      <Stack spacing={1} sx={{ pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="body2" color="text.secondary">
          Cardio: {detail.cardio ? (detail.cardio.skipped ? 'no' : 'yes') : 'no entry'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Stretched: {detail.stretched == null ? '—' : detail.stretched ? 'yes' : 'no'}
        </Typography>
      </Stack>

      <NumericKeypad
        open={keypad !== null}
        variant={keypad?.variant ?? 'weight'}
        initialValue={keypad?.initialValue ?? 0}
        unitLabel={unitLabel}
        step={weightStep}
        onCancel={() => setKeypad(null)}
        onConfirm={onConfirmKeypad}
      />
    </Stack>
  );
}
