import { useEffect, useState } from 'react';
import {
  Link as RouterLink,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { useWorkoutWakeLock } from '@/features/lifecycle/hooks';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { useActiveSession, useSessionView } from '@/features/session/hooks';
import { completeSession, discardSession } from '@/features/session/actions';
import {
  addSessionLift,
  dissolveSessionSuperset,
  removeSessionLift,
  validRemovalTiersForScope,
} from '@/features/session/amendments';
import type { SessionLift } from '@/data/types';
import { BottomListDrawer } from '@/components/BottomListDrawer';
import { NewExerciseDialog } from '@/components/NewExerciseDialog';
import { ScopeModal, type Scope } from '@/components/ScopeModal';
import { useLiftFamilies, useVariantsForFamily } from '@/features/session/pickerData';
import { StretchCardioRow } from '@/components/StretchCardioRow';
import { useCardioForSession, useStretchForSession } from '@/features/sundries/hooks';
import { useSessionMode } from '@/features/session/sessionHooks';
import { useSessionEditStore } from '@/features/session/editStore';
import type { SessionMode } from '@/features/session/editStore';
import { useChromeStore } from '@/features/ui/chromeStore';

/** Route element for /workout — resolves the active session and live mode. */
export function Workout() {
  const active = useActiveSession();
  useWorkoutWakeLock();
  if (active === undefined) return <LoadingShell />;
  if (!active) return <Navigate to="/" replace />;
  return <SessionWorkout sessionId={active.id} mode="live" />;
}

/** Route element for /session/:sessionId — resolves any session + mode from store. */
export function SessionWorkoutRoute() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId ?? null;
  const mode = useSessionMode(sessionId);
  useWorkoutWakeLock();
  if (!sessionId) return <Navigate to="/history" replace />;
  return <SessionWorkout sessionId={sessionId} mode={mode} />;
}

function LoadingShell() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="body2" color="text.secondary">
        Loading…
      </Typography>
    </Box>
  );
}

interface SessionWorkoutProps {
  sessionId: string;
  mode: SessionMode;
}

function SessionWorkout({ sessionId, mode }: SessionWorkoutProps) {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const view = useSessionView(sessionId);
  const stretch = useStretchForSession(sessionId);
  const cardio = useCardioForSession(sessionId);
  const stretchDone = stretch?.done ?? false;
  const cardioLogged = cardio != null && !cardio.skipped;
  const enterEdit = useSessionEditStore((s) => s.enterEdit);
  const saveEdit = useSessionEditStore((s) => s.saveEdit);
  const discardEdit = useSessionEditStore((s) => s.discardEdit);
  const setHideNavbar = useChromeStore((s) => s.setHideNavbar);

  // The detail view tracks which tab the user came from (Workout vs History
  // vs Progress) so Delete/Save returns them there instead of dumping them
  // on the History tab by default.
  const navState = (routerLocation.state as { origin?: string } | null) ?? null;
  const origin = navState?.origin ?? '/';

  // Hide the bottom navbar in view/edit mode — the detail view is meant to
  // feel like a focused stack pushed over the originating tab.
  useEffect(() => {
    if (mode !== 'live') {
      setHideNavbar(true);
      return () => setHideNavbar(false);
    }
    return undefined;
  }, [mode, setHideNavbar]);

  const [busy, setBusy] = useState(false);
  const [addStep, setAddStep] = useState<
    | { kind: 'closed' }
    | { kind: 'family' }
    | { kind: 'variant'; liftFamilyId: string }
    | { kind: 'scope'; liftFamilyId: string; variantId: string }
  >({ kind: 'closed' });
  const [removeTarget, setRemoveTarget] = useState<SessionLift | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  if (view === undefined) return <LoadingShell />;
  if (view === null) {
    return <Navigate to={mode === 'live' ? '/' : '/history'} replace />;
  }

  const loggedSetCount = view.lifts.reduce(
    (acc, l) => acc + l.sets.filter((s) => s.loggedAt).length,
    0,
  );
  // Any logged set OR a completed stretch OR a non-skipped cardio entry
  // counts as "progress" for the Complete button — a rest-day or warmup-
  // only workout shouldn't be stuck on disabled.
  const hasAnyProgress = loggedSetCount > 0 || (stretchDone ?? false) || (cardioLogged ?? false);

  const onRemoveLift = (lift: SessionLift) => {
    const tiers = validRemovalTiersForScope(lift.scope);
    if (tiers.length === 0) {
      void removeSessionLift({ sessionLiftId: lift.id, scope: 'session' });
      return;
    }
    setRemoveTarget(lift);
  };

  const completeLive = async () => {
    setBusy(true);
    try {
      await completeSession(sessionId);
      void navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const runDiscardLive = async () => {
    setBusy(true);
    try {
      await discardSession(sessionId);
      void navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const onDiscardLiveTap = () => {
    if (loggedSetCount > 0) {
      setDiscardConfirmOpen(true);
    } else {
      void runDiscardLive();
    }
  };

  const runDeleteCompleted = async () => {
    setBusy(true);
    try {
      await discardSession(sessionId);
      void navigate(origin, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const enterEditMode = () => {
    void enterEdit(sessionId);
  };

  const saveEditMode = () => {
    saveEdit();
  };

  const discardEditMode = async () => {
    setBusy(true);
    try {
      await discardEdit();
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <Stack>
      <Typography variant="caption" color="text.secondary">
        {view.location?.name ?? 'Home Gym'}
        {view.session.calendarDate && ` · ${formatDate(view.session.calendarDate)}`}
      </Typography>
      <Typography variant="h2">
        {view.splitDayType?.name ?? (view.session.scheduleSlotId ? 'Workout' : 'Ad-hoc workout')}
        {mode === 'live' && ' in progress'}
        {mode === 'edit' && ' — editing'}
      </Typography>
    </Stack>
  );

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
          pt: mode === 'live' ? 3 : 2,
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {mode !== 'live' && (
          <Box sx={{ mb: 1 }}>
            <Button
              size="small"
              variant="text"
              onClick={() => void navigate(origin)}
              sx={{ ml: -1, color: 'text.secondary' }}
            >
              ← Back
            </Button>
          </Box>
        )}
        <Stack direction="row" alignItems="baseline" justifyContent="space-between">
          {header}
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
        <LiftList
          view={view}
          sessionId={sessionId}
          showRemove={mode === 'live'}
          onRemoveLift={onRemoveLift}
        />

        {mode === 'live' && (
          <Button
            variant="text"
            color="secondary"
            onClick={() => setAddStep({ kind: 'family' })}
            sx={{ alignSelf: 'flex-start' }}
          >
            + Add exercise
          </Button>
        )}

        <AddLiftFlow sessionId={sessionId} step={addStep} setStep={setAddStep} />

        {removeTarget && (
          <ScopeModal
            open
            tiers={validRemovalTiersForScope(removeTarget.scope)}
            titleVerb="Remove exercise"
            onCancel={() => setRemoveTarget(null)}
            onConfirm={(scope) => {
              void removeSessionLift({ sessionLiftId: removeTarget.id, scope });
              setRemoveTarget(null);
            }}
          />
        )}

        {mode === 'live' && <StretchCardioRow sessionId={sessionId} />}
      </Box>

      <Stack
        direction="row"
        spacing={1}
        sx={{
          px: 3,
          pt: 1.5,
          pb: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
          backgroundColor: 'background.default',
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        {mode === 'live' && (
          <>
            <Button
              variant="outlined"
              color="error"
              onClick={onDiscardLiveTap}
              disabled={busy}
              sx={{ minHeight: 56, flex: 1 }}
            >
              Discard
            </Button>
            <Button
              variant="contained"
              onClick={() => void completeLive()}
              disabled={busy || !hasAnyProgress}
              sx={{ minHeight: 56, flex: 1 }}
            >
              Complete
            </Button>
          </>
        )}
        {mode === 'view' && (
          <>
            <Button
              variant="outlined"
              color="error"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={busy}
              sx={{ minHeight: 56, flex: 1 }}
            >
              Delete
            </Button>
            <Button
              variant="contained"
              onClick={enterEditMode}
              disabled={busy}
              sx={{ minHeight: 56, flex: 1 }}
            >
              Edit
            </Button>
          </>
        )}
        {mode === 'edit' && (
          <>
            <Button
              variant="outlined"
              color="error"
              onClick={() => void discardEditMode()}
              disabled={busy}
              sx={{ minHeight: 56, flex: 1 }}
            >
              Discard
            </Button>
            <Button
              variant="contained"
              onClick={saveEditMode}
              disabled={busy}
              sx={{ minHeight: 56, flex: 1 }}
            >
              Save
            </Button>
          </>
        )}
      </Stack>

      <Dialog
        open={discardConfirmOpen}
        onClose={() => setDiscardConfirmOpen(false)}
        aria-labelledby="discard-confirm-title"
      >
        <DialogTitle id="discard-confirm-title">Discard this workout?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {loggedSetCount} {loggedSetCount === 1 ? 'set is' : 'sets are'} logged in this session.
            Discarding deletes the session entirely — it will not appear in history.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDiscardConfirmOpen(false)}
            variant="text"
            autoFocus
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              setDiscardConfirmOpen(false);
              void runDiscardLive();
            }}
            color="error"
            variant="contained"
            disabled={busy}
          >
            Discard
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        aria-labelledby="delete-confirm-title"
      >
        <DialogTitle id="delete-confirm-title">Delete this workout?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This permanently removes the workout from your history. There is no undo.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteConfirmOpen(false)}
            variant="text"
            autoFocus
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              setDeleteConfirmOpen(false);
              void runDeleteCompleted();
            }}
            color="error"
            variant="contained"
            disabled={busy}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function formatDate(iso: string): string {
  try {
    const [yearStr, monthStr, dayStr] = iso.split('-');
    const d = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
  } catch {
    return iso;
  }
}

interface LiftListProps {
  view: NonNullable<ReturnType<typeof useSessionView>>;
  sessionId: string;
  showRemove: boolean;
  onRemoveLift: (lift: SessionLift) => void;
}

function LiftList({ view, sessionId, showRemove, onRemoveLift }: LiftListProps) {
  // Group adjacent lifts that share a supersetGroupId (FR16 / FR33).
  const groups: Array<{ supersetGroupId?: string; lifts: typeof view.lifts }> = [];
  for (const lift of view.lifts) {
    const last = groups[groups.length - 1];
    if (lift.lift.supersetGroupId && last?.supersetGroupId === lift.lift.supersetGroupId) {
      last.lifts.push(lift);
    } else {
      groups.push({
        ...(lift.lift.supersetGroupId ? { supersetGroupId: lift.lift.supersetGroupId } : {}),
        lifts: [lift],
      });
    }
  }

  return (
    <Stack spacing={1}>
      {groups.map((g, gIdx) => {
        const isSuperset = !!g.supersetGroupId;
        // The whole superset routes to a single page that shows all of its
        // lifts; tapping any constituent lift goes there.
        const supersetLink = isSuperset
          ? `/session/${sessionId}/lift/${g.lifts[0]!.lift.id}`
          : null;
        return (
          <Box
            key={g.supersetGroupId ?? `solo-${gIdx}`}
            sx={
              isSuperset
                ? {
                    border: '1px solid',
                    borderColor: 'plates.blue',
                    borderLeft: '4px solid',
                    borderLeftColor: 'plates.blue',
                    backgroundColor: 'var(--mui-palette-plateTint-blue)',
                    borderRadius: 1,
                  }
                : {
                    border: '1px solid',
                    borderColor: 'divider',
                    backgroundColor: 'background.paper',
                    borderRadius: 1,
                  }
            }
          >
            {isSuperset && (
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{
                  px: 1.5,
                  py: 0.25,
                  minHeight: 36,
                  borderBottom: '1px solid',
                  borderColor: 'plates.blue',
                }}
              >
                <Typography
                  variant="caption"
                  color="plates.blue"
                  sx={{
                    fontWeight: 600,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                  }}
                >
                  Superset
                </Typography>
                {showRemove && g.supersetGroupId && (
                  <IconButton
                    size="small"
                    aria-label="Unlink superset for this session"
                    onClick={() =>
                      void dissolveSessionSuperset({
                        sessionId,
                        groupId: g.supersetGroupId!,
                      })
                    }
                    sx={{ width: 28, height: 28, color: 'plates.blue' }}
                  >
                    <LinkOffIcon fontSize="small" />
                  </IconButton>
                )}
              </Stack>
            )}
            {g.lifts.map((l, liftIdx) => {
              const logged = l.sets.filter((s) => s.loggedAt).length;
              const total = l.sets.length;
              const counterColor =
                logged === 0 ? 'text.secondary' : logged < total ? 'warning.main' : 'primary.main';
              const liftHref = isSuperset
                ? (supersetLink as string)
                : `/session/${sessionId}/lift/${l.lift.id}`;
              return (
                <Box
                  key={l.lift.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: 56,
                    ...(liftIdx > 0 && {
                      borderTop: '1px solid',
                      borderColor: isSuperset ? 'var(--mui-palette-plates-blue)' : 'divider',
                    }),
                  }}
                >
                  <Box
                    component={RouterLink}
                    to={liftHref}
                    sx={{
                      flex: 1,
                      py: 1.5,
                      px: 1.5,
                      color: 'inherit',
                      textDecoration: 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      minHeight: 56,
                    }}
                  >
                    <Stack>
                      <Typography variant="body1">{l.familyName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {l.variant?.name ?? ''} · {total} sets
                      </Typography>
                    </Stack>
                    <Typography
                      variant="body2"
                      color={counterColor}
                      className="numeric-cell"
                      sx={{ fontWeight: logged > 0 ? 600 : 400 }}
                    >
                      {logged}/{total}
                    </Typography>
                  </Box>
                  {showRemove && (
                    <IconButton
                      size="small"
                      onClick={() => onRemoveLift(l.lift)}
                      aria-label={`Remove ${l.familyName}`}
                      sx={{ width: 40, height: 40, mr: 0.5, color: 'text.secondary' }}
                    >
                      ✕
                    </IconButton>
                  )}
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Stack>
  );
}

type AddStep =
  | { kind: 'closed' }
  | { kind: 'family' }
  | { kind: 'variant'; liftFamilyId: string }
  | { kind: 'scope'; liftFamilyId: string; variantId: string };

interface AddLiftFlowProps {
  sessionId: string;
  step: AddStep;
  setStep: (s: AddStep) => void;
}

function AddLiftFlow({ sessionId, step, setStep }: AddLiftFlowProps) {
  const families = useLiftFamilies();
  const variantStepFamilyId =
    step.kind === 'variant' || step.kind === 'scope' ? step.liftFamilyId : null;
  const variants = useVariantsForFamily(variantStepFamilyId);
  const [filter, setFilter] = useState('');
  const [builder, setBuilder] = useState<
    { kind: 'family' } | { kind: 'variant'; liftFamilyId: string; familyName: string } | null
  >(null);

  // Reset filter when (re)entering the family step.
  useEffect(() => {
    if (step.kind === 'family') setFilter('');
  }, [step.kind]);

  // If the family has exactly one canonical variant, skip the variant step.
  useEffect(() => {
    if (step.kind !== 'variant') return;
    if (variants === undefined) return; // still loading
    if (variants.length === 1) {
      setStep({
        kind: 'scope',
        liftFamilyId: step.liftFamilyId,
        variantId: variants[0]!.variant.id,
      });
    }
  }, [step, variants, setStep]);

  const close = () => setStep({ kind: 'closed' });

  const confirm = (scope: Scope) => {
    if (step.kind !== 'scope') return;
    void addSessionLift({
      sessionId,
      liftFamilyId: step.liftFamilyId,
      variantId: step.variantId,
      scope,
    }).then(close);
  };

  const filteredFamilies = (families ?? []).filter((f) =>
    f.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  const currentFamily =
    step.kind === 'variant' || step.kind === 'scope'
      ? (families ?? []).find((f) => f.id === step.liftFamilyId)
      : null;

  return (
    <>
      <BottomListDrawer open={step.kind === 'family'} title="Add exercise" onClose={close}>
        <Stack spacing={1}>
          <TextField
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search exercises"
            size="small"
            autoFocus
            fullWidth
            slotProps={{ htmlInput: { 'aria-label': 'Search exercises' } }}
          />
          <Stack>
            <PickerRow
              label="+ Create new exercise"
              accent="secondary"
              onClick={() => setBuilder({ kind: 'family' })}
            />
            {filteredFamilies.map((f) => (
              <PickerRow
                key={f.id}
                label={f.name}
                onClick={() => setStep({ kind: 'variant', liftFamilyId: f.id })}
              />
            ))}
            {filteredFamilies.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                No exercises match.
              </Typography>
            )}
          </Stack>
        </Stack>
      </BottomListDrawer>

      <BottomListDrawer
        open={step.kind === 'variant'}
        title="Choose variant"
        onBack={() => setStep({ kind: 'family' })}
        onClose={close}
      >
        <Stack>
          {currentFamily && (
            <PickerRow
              label={`+ New ${currentFamily.name} variant`}
              accent="secondary"
              onClick={() =>
                setBuilder({
                  kind: 'variant',
                  liftFamilyId: currentFamily.id,
                  familyName: currentFamily.name,
                })
              }
            />
          )}
          {(variants ?? []).map((v) => (
            <PickerRow
              key={v.variant.id}
              label={v.variant.name}
              onClick={() =>
                setStep({
                  kind: 'scope',
                  liftFamilyId:
                    step.kind === 'variant' || step.kind === 'scope' ? step.liftFamilyId : '',
                  variantId: v.variant.id,
                })
              }
            />
          ))}
        </Stack>
      </BottomListDrawer>

      <ScopeModal
        open={step.kind === 'scope'}
        onCancel={() => {
          if (step.kind !== 'scope') return;
          if (variants && variants.length <= 1) {
            setStep({ kind: 'family' });
          } else {
            setStep({ kind: 'variant', liftFamilyId: step.liftFamilyId });
          }
        }}
        onConfirm={confirm}
      />

      {builder && (
        <NewExerciseDialog
          open
          mode={builder}
          onCancel={() => setBuilder(null)}
          onCreated={({ liftFamilyId, variantId }) => {
            setBuilder(null);
            setStep({ kind: 'scope', liftFamilyId, variantId });
          }}
        />
      )}
    </>
  );
}

interface PickerRowProps {
  label: string;
  onClick: () => void;
  /** Optional accent — used to make "+ Create new exercise" stand out. */
  accent?: 'secondary';
}

function PickerRow({ label, onClick, accent }: PickerRowProps) {
  const accentColor = accent === 'secondary' ? 'secondary.main' : 'inherit';
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        all: 'unset',
        cursor: 'pointer',
        py: 1.5,
        px: 1,
        borderTop: '1px solid',
        borderColor: 'divider',
        color: accentColor,
        display: 'flex',
        alignItems: 'center',
        minHeight: 56,
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: accent === 'secondary' ? 'secondary.main' : 'primary.main',
          outlineOffset: 2,
        },
      }}
    >
      <Typography variant="body1" sx={{ color: 'inherit' }}>
        {label}
      </Typography>
    </Box>
  );
}
