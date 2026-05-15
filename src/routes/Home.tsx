import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { initData } from '@/data/init';
import { useExportStatus } from '@/features/export/hooks';
import { useActiveSession, useRoutineWeek } from '@/features/session/hooks';
import type { RoutineDayView } from '@/features/session/queries';
import { startAdHocSession, startSession } from '@/features/session/actions';
import { useCurrentLocation } from '@/features/locations/hooks';
import { detectEvictionState } from '@/features/lifecycle/eviction';
import { LocationPicker } from '@/components/LocationPicker';
import { RoutinePicker } from '@/components/RoutinePicker';
import { BottomListDrawer } from '@/components/BottomListDrawer';
import { DriveSyncBanner } from '@/components/DriveSyncBanner';

export function Home() {
  const status = useExportStatus();
  const active = useActiveSession();
  const week = useRoutineWeek();
  const location = useCurrentLocation();
  const navigate = useNavigate();
  const [initError, setInitError] = useState<string | null>(null);
  const [evicted, setEvicted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyDayId, setBusyDayId] = useState<string | null>(null);
  const [preview, setPreview] = useState<RoutineDayView | null>(null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [routinePickerOpen, setRoutinePickerOpen] = useState(false);
  const todayCardRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Scroll today's card into view once the week resolves.
  useEffect(() => {
    if (!week) return;
    // Defer to next tick so the card has actually mounted.
    const id = window.setTimeout(() => {
      const node = todayCardRef.current;
      const container = scrollContainerRef.current;
      if (node && container) {
        // Center today's card inside the scroll container.
        const nodeTop = node.offsetTop - container.offsetTop;
        const nodeHeight = node.offsetHeight;
        const containerHeight = container.clientHeight;
        container.scrollTop = nodeTop - containerHeight / 2 + nodeHeight / 2;
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [week]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const before = await detectEvictionState();
        if (!cancelled && before === 'evicted') setEvicted(true);
        await initData();
      } catch (err: unknown) {
        // initError surfaces in the chrome; also dump to console so dev
        // tools have the full stack when a user reports the banner.
        console.error('[Home] init failed', err);
        if (!cancelled) {
          setInitError(err instanceof Error ? err.message : 'Initialization failed');
        }
      }
    })().catch((err) => {
      // Should never fire (the inner try/catch already handles errors),
      // but if the IIFE itself throws synchronously, log it.
      console.error('[Home] init IIFE failed', err);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const startDay = async (day: RoutineDayView) => {
    if (!location) return;
    setBusyDayId(day.slot.id);
    setError(null);
    try {
      const result = await startSession({
        scheduleSlotId: day.slot.id,
        locationId: location.id,
        calendarDate: day.calendarDate,
      });
      setPreview(null);
      void navigate(`/session/${result.sessionId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not start workout');
    } finally {
      setBusyDayId(null);
    }
  };

  const routineName = week?.program.name ?? 'Spottr';
  const locationName = location?.name ?? 'No location';
  const lastExportRelative = status?.lastOk ? formatRelative(status.lastOk.timestamp) : null;

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
        <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1 }}>
          <Box
            component="button"
            type="button"
            onClick={() => setRoutinePickerOpen(true)}
            aria-label="Change routine"
            sx={{
              all: 'unset',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.25,
              color: 'primary.main',
              borderBottom: '2px solid',
              borderColor: 'primary.main',
              lineHeight: 1.1,
              '&:hover': { opacity: 0.85 },
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: 'primary.main',
                outlineOffset: 2,
              },
            }}
          >
            <Typography variant="h2" component="span" color="inherit">
              {routineName}
            </Typography>
            <ExpandMoreIcon fontSize="small" />
          </Box>
          <Typography variant="body2" color="text.secondary" component="span">
            at{' '}
            <Box
              component="button"
              type="button"
              onClick={() => setLocationPickerOpen(true)}
              aria-label="Change location"
              sx={{
                all: 'unset',
                cursor: 'pointer',
                color: 'inherit',
                textDecoration: 'underline',
                textDecorationStyle: 'dotted',
                textUnderlineOffset: 3,
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: 2,
                },
              }}
            >
              {locationName}
            </Box>
            {lastExportRelative && (
              <>
                {' · '}
                <Box component="span" sx={{ opacity: 0.7 }}>
                  last sync {lastExportRelative}
                </Box>
              </>
            )}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-start', mt: 1 }}>
          <Button
            variant="text"
            size="small"
            disabled={Boolean(active) || !location}
            onClick={() => {
              if (!location) return;
              void startAdHocSession({ locationId: location.id }).then((result) => {
                void navigate(`/session/${result.sessionId}`);
              });
            }}
            sx={{ ml: -1 }}
          >
            + Start ad-hoc workout
          </Button>
        </Box>
      </Box>

      {/* Scrollable list */}
      <Box
        ref={scrollContainerRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          px: 3,
          py: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <DriveSyncBanner />

        {active && (
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'primary.main',
              backgroundColor: 'var(--mui-palette-plateTint-green)',
              borderRadius: 1,
              p: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography variant="body2">Workout in progress.</Typography>
            <Button size="small" variant="contained" onClick={() => void navigate('/workout')}>
              Resume
            </Button>
          </Box>
        )}

        {week === undefined && (
          <Typography variant="body2" color="text.secondary">
            Loading week…
          </Typography>
        )}

        {week === null && (
          <Typography variant="body2" color="text.secondary">
            No active routine.
          </Typography>
        )}

        {week && (
          <Stack spacing={1}>
            {week.days.map((day) => {
              const inner = (
                <DayCard
                  day={day}
                  busy={busyDayId === day.slot.id}
                  disableStart={Boolean(active) || !location}
                  onOpenPreview={() => setPreview(day)}
                  onStart={() => void startDay(day)}
                  onOpenCompleted={() => {
                    if (day.completedSessionId) {
                      void navigate(`/session/${day.completedSessionId}`, {
                        state: { origin: '/' },
                      });
                    }
                  }}
                />
              );
              return day.isToday ? (
                <Box key={day.calendarDate} ref={todayCardRef}>
                  {inner}
                </Box>
              ) : (
                <Box key={day.calendarDate}>{inner}</Box>
              );
            })}
          </Stack>
        )}

        {evicted && (
          <Box role="alert" sx={{ color: 'error.main' }}>
            <Typography variant="body2">
              Local data was reset. Restore from your last backup in Settings before logging.
            </Typography>
          </Box>
        )}

        {error && (
          <Box role="alert" sx={{ color: 'error.main' }}>
            <Typography variant="body2">Could not start workout. {error}</Typography>
          </Box>
        )}

        {initError && (
          <Box role="alert" sx={{ color: 'error.main' }}>
            <Typography variant="body2">Setup error. {initError}</Typography>
          </Box>
        )}
      </Box>
      {/* end scrollable list */}

      <BottomListDrawer
        open={preview !== null}
        title={preview ? `${preview.dayLabel} — ${preview.splitDayType.name}` : ''}
        onClose={() => setPreview(null)}
        footer={
          preview && !preview.splitDayType.isRest ? (
            <Button
              variant="contained"
              fullWidth
              disabled={Boolean(active) || !location || busyDayId === preview.slot.id}
              onClick={() => void startDay(preview)}
            >
              Start workout
            </Button>
          ) : undefined
        }
      >
        {preview && (
          <Stack spacing={1}>
            {preview.plans.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Rest day — no lifts planned.
              </Typography>
            )}
            {preview.plans.map((p) => {
              const firstSet = p.plannedSets[0];
              const range = firstSet
                ? firstSet.plannedRepsMin === firstSet.plannedRepsMax
                  ? `${firstSet.plannedRepsMin}`
                  : `${firstSet.plannedRepsMin}-${firstSet.plannedRepsMax}`
                : '';
              return (
                <Box key={p.id}>
                  <Typography variant="body1">
                    {preview.liftFamilyNames.get(p.liftFamilyId) ?? '(lift)'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {p.plannedSets.length}×{range}
                    {p.defaultVariantId
                      ? ` · ${preview.variants.get(p.defaultVariantId)?.name ?? ''}`
                      : ''}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        )}
      </BottomListDrawer>

      <LocationPicker open={locationPickerOpen} onClose={() => setLocationPickerOpen(false)} />
      <RoutinePicker open={routinePickerOpen} onClose={() => setRoutinePickerOpen(false)} />
    </Box>
  );
}

interface DayCardProps {
  day: RoutineDayView;
  busy: boolean;
  disableStart: boolean;
  onOpenPreview: () => void;
  onStart: () => void;
  onOpenCompleted: () => void;
}

function DayCard({
  day,
  busy,
  disableStart,
  onOpenPreview,
  onStart,
  onOpenCompleted,
}: DayCardProps) {
  const isCompleted = day.completedSessionId !== null;
  const isRest = day.splitDayType.isRest;
  const isToday = day.isToday;

  const liftPreview = isRest
    ? 'Rest day'
    : day.plans
        .map((p) => day.liftFamilyNames.get(p.liftFamilyId) ?? '')
        .filter(Boolean)
        .slice(0, 3)
        .join(', ') + (day.plans.length > 3 ? '…' : '');

  // Long-form date for every card. The format already contains the weekday,
  // so cards don't prefix `day.dayLabel` separately — that was just the
  // short-format placeholder.
  const [yearStr, monthStr, dayNumStr] = day.calendarDate.split('-');
  const cardDate = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayNumStr));
  const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(cardDate);

  const completedBadge = (
    <Box
      aria-label="Completed"
      sx={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'primary.main',
        color: 'primary.contrastText',
        fontSize: '1rem',
        flexShrink: 0,
        ml: 1,
      }}
    >
      ✓
    </Box>
  );

  // Today wins over completed: even when today's workout is done, the row
  // stays highlighted (full-size card, primary border) so the eye still
  // lands on it. The Start button is swapped for a tap-through to the
  // completed session.
  if (isToday && !isRest) {
    return (
      <Box sx={cardSx({ today: true, dim: false })}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ width: '100%' }}
        >
          <Box
            component="button"
            type="button"
            onClick={isCompleted ? onOpenCompleted : onOpenPreview}
            aria-label={
              isCompleted ? `View ${day.dayLabel} session` : `Preview ${day.dayLabel} workout`
            }
            sx={{
              all: 'unset',
              cursor: 'pointer',
              flex: 1,
              minWidth: 0,
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: 'primary.main',
                outlineOffset: 2,
              },
            }}
          >
            <Stack>
              <Typography variant="caption" color="primary.main">
                Today · {dateLabel}
              </Typography>
              <Typography variant="h2">{day.splitDayType.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {liftPreview}
              </Typography>
            </Stack>
          </Box>
          {isCompleted && completedBadge}
        </Stack>
        {!isCompleted && (
          <Button
            variant="contained"
            fullWidth
            disabled={busy || disableStart}
            onClick={onStart}
            sx={{ mt: 2, minHeight: 48 }}
          >
            Start workout
          </Button>
        )}
      </Box>
    );
  }

  if (isCompleted) {
    return (
      <Box
        component="button"
        type="button"
        onClick={onOpenCompleted}
        aria-label={`View ${day.dayLabel} session`}
        sx={cardSx({ today: false, dim: false })}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ width: '100%' }}
        >
          <Stack sx={{ minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">
              {dateLabel}
            </Typography>
            <Typography variant="body1">{day.splitDayType.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {liftPreview}
            </Typography>
          </Stack>
          {completedBadge}
        </Stack>
      </Box>
    );
  }

  if (isRest) {
    return (
      <Box sx={{ ...cardSx({ today: false, dim: true }), cursor: 'default' }} aria-disabled>
        <Stack>
          <Typography variant="body2" color="text.secondary">
            {dateLabel}
          </Typography>
          <Typography variant="body1">Rest day</Typography>
        </Stack>
      </Box>
    );
  }

  // Past/future pending
  return (
    <Box sx={cardSx({ today: false, dim: false })}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ width: '100%' }}
      >
        <Box
          component="button"
          type="button"
          onClick={onOpenPreview}
          aria-label={`Preview ${day.dayLabel} workout`}
          sx={{
            all: 'unset',
            cursor: 'pointer',
            flex: 1,
            minWidth: 0,
            '&:focus-visible': {
              outline: '2px solid',
              outlineColor: 'primary.main',
              outlineOffset: 2,
            },
          }}
        >
          <Stack>
            <Typography variant="body2" color="text.secondary">
              {dateLabel}
              {day.isPast && ' · missed'}
            </Typography>
            <Typography variant="body1">{day.splitDayType.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {liftPreview}
            </Typography>
          </Stack>
        </Box>
        <Button
          variant="text"
          size="small"
          disabled={busy || disableStart}
          onClick={onStart}
          sx={{ minHeight: 40 }}
        >
          Start
        </Button>
      </Stack>
    </Box>
  );
}

function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function cardSx({ today, dim }: { today: boolean; dim: boolean }) {
  // Today's card: 4px blue plate stripe on the left edge (via ::before so
  // the stripe doesn't push content), plus a faint blue-tint wash over the
  // paper bg for branded depth.
  return {
    all: 'unset' as const,
    boxSizing: 'border-box' as const,
    display: 'block',
    width: '100%',
    cursor: 'pointer',
    position: 'relative' as const,
    border: '1px solid',
    borderColor: today ? 'plates.blue' : 'divider',
    borderRadius: 1,
    p: today ? 2 : 1.5,
    backgroundColor: 'background.paper',
    backgroundImage: today
      ? `linear-gradient(var(--mui-palette-plateTint-blue), var(--mui-palette-plateTint-blue))`
      : 'none',
    minHeight: today ? 120 : 64,
    opacity: dim ? 0.6 : 1,
    ...(today && {
      '&::before': {
        content: '""',
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        backgroundColor: 'var(--mui-palette-plates-blue)',
        borderRadius: '8px 0 0 8px',
      },
    }),
    '&:focus-visible': {
      outline: '2px solid',
      outlineColor: 'plates.blue',
      outlineOffset: 2,
    },
  };
}
