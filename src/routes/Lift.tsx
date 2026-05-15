import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Chip, IconButton, Link, Stack, TextField, Typography } from '@mui/material';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { useActiveSession, useSessionLiftGroup } from '@/features/session/hooks';
import {
  addSessionSet,
  deleteSessionSet,
  editLoggedSet,
  logSet,
  setPlannedRowValues,
  unlogSet,
} from '@/features/session/actions';
import { changeSessionLiftVariant, dissolveSessionSuperset } from '@/features/session/amendments';
import { setLiftNote } from '@/features/sundries/actions';
import { SetTable, type SetRowView } from '@/components/SetTable';
import { NumericKeypad, type KeypadVariant } from '@/components/NumericKeypad';
import { BottomListDrawer } from '@/components/BottomListDrawer';
import { useVariantsForFamily } from '@/features/session/pickerData';
import { computeSuggestion } from '@/features/suggested-weight/client';
import type { Suggestion } from '@/features/suggested-weight/rule';
import { fetchMatchedHistory } from '@/features/suggested-weight/queries';
import { DEFAULT_INCREMENT, type EquipmentKind, type SessionSet } from '@/data/types';
import { useUserSettings } from '@/features/settings/hooks';
import { useSessionMode } from '@/features/session/sessionHooks';
import type { SessionMode } from '@/features/session/editStore';
import type { SessionLiftDetail } from '@/features/session/hooks';

/** Route element for /workout/lift/:liftId — active session, live mode. */
export function Lift() {
  const active = useActiveSession();
  if (active === undefined) return <LoadingShell />;
  if (!active) return <NoSessionFallback to="/" />;
  return <LiftScreen sessionId={active.id} mode="live" />;
}

/** Route element for /session/:sessionId/lift/:liftId — any session + mode. */
export function SessionLiftRoute() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId ?? null;
  const mode = useSessionMode(sessionId);
  if (!sessionId) return <NoSessionFallback to="/history" />;
  return <LiftScreen sessionId={sessionId} mode={mode} />;
}

function LoadingShell() {
  return <Box sx={{ p: 3 }}>Loading…</Box>;
}

function NoSessionFallback({ to }: { to: string }) {
  return (
    <Box sx={{ p: 3 }}>
      <Typography>This workout is no longer available.</Typography>
      <Link component={RouterLink} to={to}>
        Back
      </Link>
    </Box>
  );
}

interface LiftScreenProps {
  sessionId: string;
  mode: SessionMode;
}

function LiftScreen({ sessionId, mode }: LiftScreenProps) {
  const params = useParams<{ liftId: string }>();
  const details = useSessionLiftGroup(sessionId, params.liftId);
  const navigate = useNavigate();

  if (details === undefined) {
    return <LoadingShell />;
  }
  if (!details || details.length === 0) {
    return <NoSessionFallback to={mode === 'live' ? '/' : `/session/${sessionId}`} />;
  }

  const isSuperset = details.length > 1;
  const supersetGroupId = isSuperset ? details[0]!.sessionLift.supersetGroupId : null;
  const backTo = mode === 'live' ? '/workout' : `/session/${sessionId}`;
  const canUnlink = isSuperset && supersetGroupId && mode === 'live';

  const onUnlink = () => {
    if (!supersetGroupId) return;
    void dissolveSessionSuperset({ sessionId, groupId: supersetGroupId }).then(() => {
      // After dissolving, the requested lift becomes standalone — navigate
      // to its own page so the screen no longer renders a group view.
      if (params.liftId) {
        const path =
          mode === 'live'
            ? `/workout/lift/${params.liftId}`
            : `/session/${sessionId}/lift/${params.liftId}`;
        void navigate(path, { replace: true });
      }
    });
  };

  return (
    <Box
      component="main"
      sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', p: 3, gap: 2.5 }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ minHeight: 48 }}
      >
        <Link
          component={RouterLink}
          to={backTo}
          underline="hover"
          variant="body2"
          aria-label="Back to workout"
          sx={{
            minHeight: 48,
            display: 'inline-flex',
            alignItems: 'center',
            color: 'text.secondary',
          }}
        >
          ← Workout
        </Link>
        {isSuperset && (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Chip
              label="Superset"
              size="small"
              sx={{
                backgroundColor: 'var(--mui-palette-plateTint-blue)',
                color: 'plates.blue',
                fontWeight: 600,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                borderRadius: 1,
              }}
            />
            {canUnlink && (
              <IconButton
                aria-label="Unlink superset for this session"
                size="small"
                onClick={onUnlink}
                sx={{ width: 32, height: 32, color: 'plates.blue' }}
              >
                <LinkOffIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>
        )}
      </Stack>

      <Stack spacing={2.5}>
        {details.map((d) => (
          <LiftSection key={d.liftId} detail={d} mode={mode} inSuperset={isSuperset} />
        ))}
      </Stack>
    </Box>
  );
}

interface LiftSectionProps {
  detail: SessionLiftDetail;
  mode: SessionMode;
  inSuperset: boolean;
}

function LiftSection({ detail, mode, inSuperset }: LiftSectionProps) {
  const [keypad, setKeypad] = useState<null | {
    rowId: string;
    variant: KeypadVariant;
    initialValue: number;
  }>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [historyText, setHistoryText] = useState<string | null>(null);
  const [variantPickerOpen, setVariantPickerOpen] = useState(false);
  const [reattributeConfirm, setReattributeConfirm] = useState<{
    newVariantId: string;
    loggedCount: number;
  } | null>(null);
  const variants = useVariantsForFamily(detail.sessionLift.liftFamilyId);
  const userSettings = useUserSettings();

  const unitLabel = detail.location?.units ?? userSettings?.units ?? 'lb';
  const weightStep = DEFAULT_INCREMENT[unitLabel];
  const interactive = mode === 'live' || mode === 'edit';
  const structural = mode === 'live';

  useEffect(() => {
    const firstSet = detail.sets[0];
    if (!firstSet) return;
    let cancelled = false;
    (async () => {
      const repRange = { min: firstSet.plannedRepsMin, max: firstSet.plannedRepsMax };
      const [sugg, history] = await Promise.all([
        computeSuggestion({
          variantId: detail.variantId,
          plannedRepRange: repRange,
          increment: weightStep,
        }),
        fetchMatchedHistory(detail.variantId, repRange),
      ]);
      if (cancelled) return;
      setSuggestion(sugg);
      setHistoryText(formatHistoryLine(history, repRange));
    })().catch((err) => {
      // History/suggestion failures degrade gracefully in the UI, but they
      // shouldn't be invisible — log so a user-reported "no suggestion"
      // can be diagnosed.
      console.error('[Lift] history/suggestion fetch failed', err);
      if (!cancelled) {
        setSuggestion({ weight: null, reasoning: 'History query failed.' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [detail, weightStep]);

  const rows: SetRowView[] = detail.sets.map((s) => ({
    id: s.id,
    setNumber: s.orderIndex + 1,
    plannedWeight: s.plannedWeight ?? suggestion?.weight ?? null,
    plannedReps: s.plannedReps,
    plannedRepsMin: s.plannedRepsMin,
    plannedRepsMax: s.plannedRepsMax,
    loggedWeight: s.loggedWeight ?? null,
    loggedReps: s.loggedReps ?? null,
    state: s.loggedAt ? 'logged' : 'unlogged',
  }));

  const onToggleLog = (rowId: string) => {
    if (!interactive) return;
    const row = detail.sets.find((s) => s.id === rowId);
    if (!row) return;
    if (row.loggedAt) {
      void unlogSet(rowId);
      return;
    }
    const weight = row.plannedWeight ?? suggestion?.weight ?? 0;
    const reps = row.plannedReps;
    void logSet({ sessionSetId: rowId, loggedWeight: weight, loggedReps: reps });
  };

  const onEditWeight = (rowId: string) => {
    if (!interactive) return;
    const row = detail.sets.find((s) => s.id === rowId);
    if (!row) return;
    setKeypad({
      rowId,
      variant: 'weight',
      initialValue: row.plannedWeight ?? suggestion?.weight ?? 0,
    });
  };

  const onEditReps = (rowId: string) => {
    if (!interactive) return;
    const row = detail.sets.find((s) => s.id === rowId);
    if (!row) return;
    setKeypad({
      rowId,
      variant: 'reps',
      initialValue: row.plannedReps,
    });
  };

  const onKeypadConfirm = (value: number) => {
    if (!keypad) return;
    if (mode === 'edit') {
      const row = detail.sets.find((s) => s.id === keypad.rowId);
      if (row?.loggedAt) {
        if (keypad.variant === 'weight') {
          void editLoggedSet({ sessionSetId: keypad.rowId, loggedWeight: value });
        } else {
          void editLoggedSet({ sessionSetId: keypad.rowId, loggedReps: value });
        }
        setKeypad(null);
        return;
      }
    }
    // Live mode: editing a logged set's weight should update the logged
    // values (correction) rather than the plan — same intent as edit mode.
    const row = detail.sets.find((s) => s.id === keypad.rowId);
    if (row?.loggedAt) {
      if (keypad.variant === 'weight') {
        void editLoggedSet({ sessionSetId: keypad.rowId, loggedWeight: value });
      } else {
        void editLoggedSet({ sessionSetId: keypad.rowId, loggedReps: value });
      }
    } else if (keypad.variant === 'weight') {
      void setPlannedRowValues({ sessionSetId: keypad.rowId, plannedWeight: value });
    } else {
      void setPlannedRowValues({ sessionSetId: keypad.rowId, plannedReps: value });
    }
    setKeypad(null);
  };

  const onAdjustReps = (rowId: string, delta: number) => {
    if (!interactive) return;
    const row = detail.sets.find((s) => s.id === rowId);
    if (!row) return;
    if (row.loggedAt) {
      const next = Math.max(0, (row.loggedReps ?? row.plannedReps) + delta);
      void editLoggedSet({ sessionSetId: rowId, loggedReps: next });
    } else {
      const next = Math.max(0, row.plannedReps + delta);
      void setPlannedRowValues({ sessionSetId: rowId, plannedReps: next });
    }
  };

  return (
    <Box
      sx={{
        backgroundColor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 2,
        position: 'relative',
        ...(inSuperset && {
          borderLeft: '4px solid',
          borderLeftColor: 'plates.blue',
        }),
      }}
    >
      <Stack spacing={0.5}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="h2">{detail.familyName}</Typography>
          {structural ? (
            <Chip
              label={detail.variantName}
              onClick={() => setVariantPickerOpen(true)}
              clickable
              size="small"
              color={chipColorForEquipment(detail.equipmentKind)}
            />
          ) : (
            <Chip
              label={detail.variantName}
              size="small"
              color={chipColorForEquipment(detail.equipmentKind)}
            />
          )}
        </Stack>
        <Typography
          variant="body2"
          color="text.secondary"
          className="numeric-cell"
          aria-label="Target scheme"
        >
          Target: {formatScheme(detail.sets)}
        </Typography>
        {mode === 'live' && (
          <Typography
            variant="body1"
            className="numeric-cell"
            color="text.primary"
            aria-live="polite"
          >
            {historyText ?? 'Loading history…'}
          </Typography>
        )}
        {mode === 'live' && suggestion && suggestion.weight != null && (
          <Typography variant="body2" color="text.secondary">
            Suggested {suggestion.weight} {unitLabel} — {suggestion.reasoning}
          </Typography>
        )}
      </Stack>

      <Box sx={{ mt: 2 }}>
        <SetTable
          rows={rows}
          unitLabel={unitLabel}
          readOnly={!interactive}
          onToggleLog={onToggleLog}
          onEditWeight={onEditWeight}
          onEditReps={onEditReps}
          onAdjustReps={onAdjustReps}
          onDeleteRow={(id) => {
            if (!structural) return;
            void deleteSessionSet(id);
          }}
        />
      </Box>

      {structural && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
          <Button
            variant="text"
            color="secondary"
            size="small"
            onClick={() => void addSessionSet(detail.liftId)}
          >
            + Add set
          </Button>
        </Stack>
      )}

      <Box sx={{ mt: 1.5 }}>
        {interactive ? (
          <InlineNoteEditor
            initialValue={detail.sessionLift.note ?? ''}
            onSave={(note) => void setLiftNote(detail.liftId, note)}
          />
        ) : detail.sessionLift.note ? (
          <Box sx={{ borderLeft: '3px solid', borderColor: 'divider', pl: 1.5, py: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
              {detail.sessionLift.note}
            </Typography>
          </Box>
        ) : null}
      </Box>

      <NumericKeypad
        open={keypad !== null}
        variant={keypad?.variant ?? 'weight'}
        initialValue={keypad?.initialValue ?? 0}
        unitLabel={unitLabel}
        step={weightStep}
        onCancel={() => setKeypad(null)}
        onConfirm={onKeypadConfirm}
      />

      {structural && (
        <BottomListDrawer
          open={variantPickerOpen}
          title="Change variant"
          onClose={() => setVariantPickerOpen(false)}
        >
          <Stack>
            {(variants ?? []).map((v) => (
              <Box
                key={v.variant.id}
                component="button"
                type="button"
                onClick={() => {
                  setVariantPickerOpen(false);
                  if (v.variant.id === detail.variantId) return;
                  const loggedCount = detail.sets.filter((s) => s.loggedAt).length;
                  if (loggedCount > 0) {
                    setReattributeConfirm({ newVariantId: v.variant.id, loggedCount });
                  } else {
                    void changeSessionLiftVariant({
                      sessionLiftId: detail.liftId,
                      newVariantId: v.variant.id,
                      reattributeLoggedSets: false,
                    });
                  }
                }}
                sx={{
                  all: 'unset',
                  cursor: 'pointer',
                  py: 1.5,
                  px: 1,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  color: 'inherit',
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
                <Typography variant="body1">{v.variant.name}</Typography>
                {v.variant.id === detail.variantId && (
                  <Typography variant="caption" color="primary.main">
                    current
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        </BottomListDrawer>
      )}

      {reattributeConfirm && (
        <Box
          role="dialog"
          aria-modal
          sx={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'flex-end',
            background: 'rgba(0,0,0,0.5)',
            zIndex: 10,
          }}
          onClick={() => setReattributeConfirm(null)}
        >
          <Box
            sx={{
              width: '100%',
              backgroundColor: 'background.paper',
              p: 3,
              pb: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Stack spacing={2}>
              <Typography variant="body1">
                Move {reattributeConfirm.loggedCount} already-logged{' '}
                {reattributeConfirm.loggedCount === 1 ? 'set' : 'sets'} to the new variant?
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  variant="text"
                  fullWidth
                  onClick={() => {
                    void changeSessionLiftVariant({
                      sessionLiftId: detail.liftId,
                      newVariantId: reattributeConfirm.newVariantId,
                      reattributeLoggedSets: false,
                    });
                    setReattributeConfirm(null);
                  }}
                >
                  Keep historical
                </Button>
                <Button
                  variant="contained"
                  fullWidth
                  onClick={() => {
                    void changeSessionLiftVariant({
                      sessionLiftId: detail.liftId,
                      newVariantId: reattributeConfirm.newVariantId,
                      reattributeLoggedSets: true,
                    });
                    setReattributeConfirm(null);
                  }}
                >
                  Move them
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Box>
      )}
    </Box>
  );
}

/**
 * Inline note for the current exercise. Visible whenever the user can edit
 * (live or edit mode): empty state shows a "+ Add note" button, populated
 * state shows the note text on a tinted card. Tapping either swaps to a
 * multi-line text input that autosaves on blur.
 */
function InlineNoteEditor({
  initialValue,
  onSave,
}: {
  initialValue: string;
  onSave: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialValue);

  // Keep the draft synced with the persisted value when not editing — covers
  // external updates (e.g., switching to another lift and back).
  useEffect(() => {
    if (!editing) setDraft(initialValue);
  }, [initialValue, editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== initialValue) onSave(draft);
  };

  if (editing) {
    return (
      <TextField
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        multiline
        minRows={2}
        autoFocus
        fullWidth
        placeholder="Note about this exercise — form cues, pin settings, etc."
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(initialValue);
            setEditing(false);
          }
        }}
        aria-label="Exercise note"
      />
    );
  }

  if (!initialValue) {
    return (
      <Button
        variant="text"
        color="secondary"
        size="small"
        onClick={() => setEditing(true)}
        sx={{ alignSelf: 'flex-start', ml: -1 }}
      >
        + Add note
      </Button>
    );
  }

  return (
    <Box
      component="button"
      type="button"
      onClick={() => setEditing(true)}
      aria-label="Edit exercise note"
      sx={{
        all: 'unset',
        cursor: 'text',
        display: 'block',
        width: '100%',
        boxSizing: 'border-box',
        borderLeft: '3px solid',
        borderColor: 'warning.main',
        backgroundColor: 'var(--mui-palette-plateTint-yellow)',
        borderRadius: 1,
        px: 1.5,
        py: 1,
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'warning.main',
          outlineOffset: 2,
        },
      }}
    >
      <Typography
        variant="body2"
        component="div"
        color="text.primary"
        sx={{ whiteSpace: 'pre-wrap' }}
      >
        {initialValue}
      </Typography>
    </Box>
  );
}

// Variant-chip color follows the Olympic bumper-plate metaphor: barbell
// (the headline gym tool) gets the 25 kg red, dumbbell the 20 kg blue,
// machines the 15 kg yellow, cables the 10 kg green. The "exotic" kinds
// (smith-machine, bodyweight, custom) stay neutral so users don't have
// to memorize an over-large palette.
function chipColorForEquipment(
  kind: EquipmentKind | null,
): 'default' | 'error' | 'secondary' | 'warning' | 'primary' {
  switch (kind) {
    case 'barbell':
      return 'error';
    case 'dumbbell':
      return 'secondary';
    case 'machine':
      return 'warning';
    case 'cable':
      return 'primary';
    default:
      return 'default';
  }
}

function formatHistoryLine(history: SessionSet[], range: { min: number; max: number }): string {
  if (history.length === 0) return 'No previous data for this variant + rep range.';
  const sorted = [...history].sort((a, b) => a.orderIndex - b.orderIndex);
  const weights = sorted.map((s) => s.loggedWeight).filter((w): w is number => w != null);
  const repsTexts = sorted.map((s) => (s.loggedReps != null ? String(s.loggedReps) : '—'));
  const weight = weights[0];
  const rangeLabel = range.min === range.max ? `${range.min}` : `${range.min}-${range.max}`;
  const ago = sorted[0]?.loggedAt ? relativeDays(sorted[0].loggedAt) : '';
  return `Last ${sorted.length}×${rangeLabel}: ${weight ?? '—'} × (${repsTexts.join(', ')})${ago ? ` — ${ago}` : ''}`;
}

function formatScheme(sets: SessionSet[]): string {
  if (sets.length === 0) return '—';
  const first = sets[0]!;
  const allSame = sets.every(
    (s) => s.plannedRepsMin === first.plannedRepsMin && s.plannedRepsMax === first.plannedRepsMax,
  );
  const rangeText =
    first.plannedRepsMin === first.plannedRepsMax
      ? `${first.plannedRepsMin}`
      : `${first.plannedRepsMin}-${first.plannedRepsMax}`;
  if (allSame) return `${sets.length}×${rangeText} reps`;
  return `${sets.length} sets, mixed reps`;
}

function relativeDays(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const days = Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}
