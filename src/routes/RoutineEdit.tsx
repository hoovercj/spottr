/**
 * Full-screen routine editor.
 *
 * Lifecycle:
 *  - On mount we snapshot the program's current rows so Discard can roll
 *    them back exactly. Edits are applied live to the DB (so the on-screen
 *    preview reflects them immediately); the snapshot is what makes those
 *    edits cancellable.
 *  - "Create new routine" lands here with `programId === 'new'`. We create a
 *    blank Program with default content right away and swap the URL so the
 *    editor renders normally. The store remembers it's newly-created so
 *    Discard deletes the program entirely.
 *  - The navbar is hidden while the editor is open (the back button stands
 *    in for it).
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { useProgramDetail } from '@/features/programs/detail';
import { useActiveProgram } from '@/features/programs/hooks';
import {
  addProgramSlot,
  addSlotPlan,
  createProgram,
  deleteProgram,
  deleteProgramSlot,
  duplicateProgram,
  duplicateProgramSlot,
  moveProgramSlot,
  removeSlotPlan,
  renameProgram,
  renameSplitDayType,
  restoreProgramSnapshot,
  setProgramAnchorDate,
  setSplitDayTypeIsRest,
  snapshotProgram,
  updateSlotPlanSets,
} from '@/features/programs/actions';
import { BottomListDrawer } from '@/components/BottomListDrawer';
import { useLiftFamilies, useVariantsForFamily } from '@/features/session/pickerData';
import type { PlannedSet } from '@/data/types';
import { addDays, parseLocalDate, toLocalDateString } from '@/data/calendarDate';
import { useChromeStore } from '@/features/ui/chromeStore';
import { useRoutineEditStore } from '@/features/programs/editStore';

const WEEKDAYS_LONG = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export function RoutineEdit() {
  const params = useParams<{ programId?: string }>();
  const navigate = useNavigate();
  const setHideNavbar = useChromeStore((s) => s.setHideNavbar);
  const enterEdit = useRoutineEditStore((s) => s.enterEdit);
  const clearEdit = useRoutineEditStore((s) => s.clear);
  const editingProgramId = useRoutineEditStore((s) => s.editingProgramId);

  const isNew = !params.programId || params.programId === 'new';
  const [bootstrappedId, setBootstrappedId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const creatingRef = useRef(false);

  // Hide the bottom navbar while the editor is open — the back button is the
  // user's way out, the nav would be redundant chrome.
  useEffect(() => {
    setHideNavbar(true);
    return () => setHideNavbar(false);
  }, [setHideNavbar]);

  // For `programId === 'new'`, eagerly create a blank program and swap the
  // URL to the real ID. The editStore remembers it's newly-created so the
  // editor's Discard knows to remove the program instead of restoring its
  // (empty) snapshot.
  useEffect(() => {
    if (!isNew || bootstrappedId || creatingRef.current) return;
    creatingRef.current = true;
    void (async () => {
      try {
        const { programId } = await createProgram({ name: 'New routine' });
        // Capture the (empty) snapshot for completeness, but Discard will
        // bypass it via isNewlyCreated.
        const snap = await snapshotProgram(programId);
        enterEdit(programId, snap, true);
        setBootstrappedId(programId);
        void navigate(`/routine/edit/${programId}`, { replace: true });
      } catch (err: unknown) {
        setBootError(err instanceof Error ? err.message : 'Could not create routine');
      } finally {
        creatingRef.current = false;
      }
    })();
  }, [isNew, bootstrappedId, enterEdit, navigate]);

  // For existing routines, snapshot once on mount.
  const explicitId = !isNew ? (params.programId ?? null) : null;
  useEffect(() => {
    if (!explicitId) return;
    if (editingProgramId === explicitId) return; // already entered for this routine
    void (async () => {
      const snap = await snapshotProgram(explicitId);
      enterEdit(explicitId, snap, false);
    })();
  }, [explicitId, editingProgramId, enterEdit]);

  // Clear the editStore when the editor unmounts.
  useEffect(() => {
    return () => clearEdit();
  }, [clearEdit]);

  const effectiveId = bootstrappedId ?? explicitId;
  const detail = useProgramDetail(effectiveId);

  if (isNew && !bootstrappedId) {
    return (
      <Box sx={{ p: 3 }}>
        {bootError ? (
          <Stack spacing={1}>
            <Typography variant="body2" color="error.main">
              {bootError}
            </Typography>
            <Button variant="text" onClick={() => void navigate(-1)}>
              ← Back
            </Button>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Creating routine…
          </Typography>
        )}
      </Box>
    );
  }

  if (detail === undefined) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Loading…
        </Typography>
      </Box>
    );
  }
  if (detail === null) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Routine not found.</Typography>
        <Button variant="text" onClick={() => void navigate('/')}>
          ← Home
        </Button>
      </Box>
    );
  }

  return <RoutineEditor detail={detail} />;
}

interface RoutineEditorProps {
  detail: NonNullable<ReturnType<typeof useProgramDetail>>;
}

function RoutineEditor({ detail }: RoutineEditorProps) {
  const navigate = useNavigate();
  const active = useActiveProgram();
  const snapshot = useRoutineEditStore((s) => s.snapshot);
  const isNewlyCreated = useRoutineEditStore((s) => s.isNewlyCreated);
  const clearEdit = useRoutineEditStore((s) => s.clear);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(detail.program.name);
  const [addToSlotId, setAddToSlotId] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isActive = active?.id === detail.program.id;
  const slotCount = detail.slots.length;

  const anchorIso = (mondayIndex: number) => {
    // Translate "Monday=0..Sunday=6" UI index to a local date that lands on
    // the chosen weekday. Uses the current anchor as a base so the date
    // stays close to "today".
    const base = detail.program.anchorDate
      ? parseLocalDate(detail.program.anchorDate)
      : new Date();
    const targetJs = (mondayIndex + 1) % 7;
    const offset = (targetJs - base.getDay() + 7) % 7;
    return addDays(toLocalDateString(base), offset);
  };
  const anchorWeekdayJs = detail.program.anchorDate
    ? parseLocalDate(detail.program.anchorDate).getDay()
    : 1;
  const currentAnchorIdx = anchorWeekdayJs === 0 ? 6 : anchorWeekdayJs - 1;

  const onDiscard = async () => {
    setActionError(null);
    try {
      if (isNewlyCreated) {
        await deleteProgram(detail.program.id);
      } else if (snapshot) {
        await restoreProgramSnapshot(snapshot);
      }
      clearEdit();
      void navigate(-1);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not discard changes');
    }
  };

  const onSave = () => {
    clearEdit();
    void navigate(-1);
  };

  const onDelete = async () => {
    setActionError(null);
    try {
      await deleteProgram(detail.program.id);
      clearEdit();
      void navigate(-1);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not delete');
    }
  };

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
          pt: 2,
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box>
          <Button size="small" variant="text" onClick={() => void navigate(-1)} sx={{ ml: -1 }}>
            ← Back
          </Button>
        </Box>
        {editingName ? (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            <TextField
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              size="small"
              fullWidth
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void renameProgram(detail.program.id, nameDraft);
                  setEditingName(false);
                } else if (e.key === 'Escape') {
                  setNameDraft(detail.program.name);
                  setEditingName(false);
                }
              }}
            />
            <IconButton
              aria-label="Save name"
              onClick={() => {
                void renameProgram(detail.program.id, nameDraft);
                setEditingName(false);
              }}
              size="small"
            >
              <CheckIcon fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="Cancel rename"
              onClick={() => {
                setNameDraft(detail.program.name);
                setEditingName(false);
              }}
              size="small"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        ) : (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
            <Typography variant="h1" sx={{ lineHeight: 1.2 }}>
              {detail.program.name}
            </Typography>
            <IconButton
              aria-label="Rename routine"
              onClick={() => {
                setNameDraft(detail.program.name);
                setEditingName(true);
              }}
              size="small"
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="Duplicate routine"
              size="small"
              onClick={() => {
                void (async () => {
                  setActionError(null);
                  try {
                    const { programId } = await duplicateProgram(detail.program.id);
                    clearEdit();
                    void navigate(`/routine/edit/${programId}`, { replace: true });
                  } catch (err: unknown) {
                    setActionError(err instanceof Error ? err.message : 'Could not duplicate');
                  }
                })();
              }}
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
            {isActive && (
              <Typography variant="caption" color="primary.main" sx={{ ml: 'auto' }}>
                active
              </Typography>
            )}
          </Stack>
        )}
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
        <AnchorPicker
          programId={detail.program.id}
          slotCount={slotCount}
          anchorDate={detail.program.anchorDate}
          currentAnchorIdx={currentAnchorIdx}
          anchorIso={anchorIso}
        />

        <Stack spacing={2}>
          {detail.slots.map((slot, idx) => (
            <SlotCard
              key={slot.slot.id}
              slot={slot}
              dayNumber={idx + 1}
              canDelete={slotCount > 1}
              canMoveUp={idx > 0}
              canMoveDown={idx < slotCount - 1}
              onAddExercise={() => setAddToSlotId(slot.slot.id)}
              onDelete={() => void deleteProgramSlot(slot.slot.id)}
              onDuplicate={() => void duplicateProgramSlot(slot.slot.id)}
              onMoveUp={() => void moveProgramSlot(slot.slot.id, 'up')}
              onMoveDown={() => void moveProgramSlot(slot.slot.id, 'down')}
            />
          ))}
          <Button
            variant="outlined"
            onClick={() => void addProgramSlot(detail.program.id)}
            sx={{ alignSelf: 'flex-start' }}
          >
            + Add day
          </Button>
        </Stack>

        {actionError && (
          <Box role="alert" sx={{ color: 'error.main' }}>
            <Typography variant="body2">{actionError}</Typography>
          </Box>
        )}
      </Box>

      {/* Fixed footer */}
      <Stack
        direction="row"
        spacing={1}
        sx={{
          flexShrink: 0,
          px: 3,
          py: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          alignItems: 'center',
        }}
      >
        <Button
          variant="text"
          color="error"
          onClick={() => setDeleteConfirmOpen(true)}
          disabled={isActive}
          title={isActive ? 'Switch to a different active routine first' : undefined}
        >
          Delete
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="text" onClick={() => setDiscardConfirmOpen(true)}>
          Discard
        </Button>
        <Button variant="contained" onClick={onSave}>
          Save
        </Button>
      </Stack>

      <AddExerciseFlow
        originSlotId={addToSlotId}
        slots={detail.slots.map((s) => ({
          slotId: s.slot.id,
          dayNumber: detail.slots.findIndex((d) => d.slot.id === s.slot.id) + 1,
          name: s.splitDayType.name,
          isRest: s.splitDayType.isRest,
        }))}
        onClose={() => setAddToSlotId(null)}
        onConfirm={(payload) => {
          void (async () => {
            for (const slotId of payload.slotIds) {
              await addSlotPlan({
                scheduleSlotId: slotId,
                liftFamilyId: payload.liftFamilyId,
                variantId: payload.variantId,
              });
            }
          })();
          setAddToSlotId(null);
        }}
      />

      <Dialog
        open={discardConfirmOpen}
        onClose={() => setDiscardConfirmOpen(false)}
        aria-labelledby="discard-routine-title"
      >
        <DialogTitle id="discard-routine-title">
          {isNewlyCreated ? 'Discard this new routine?' : 'Discard changes?'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {isNewlyCreated
              ? "You haven't saved this routine yet. Closing will throw it away."
              : 'Your edits will be rolled back to the version you had when you opened the editor.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscardConfirmOpen(false)} variant="text" autoFocus>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setDiscardConfirmOpen(false);
              void onDiscard();
            }}
            color="error"
            variant="contained"
          >
            {isNewlyCreated ? 'Discard' : 'Discard changes'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        aria-labelledby="delete-routine-title"
      >
        <DialogTitle id="delete-routine-title">Delete routine?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This removes the routine and its planned days. History tied to it is not affected.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)} variant="text" autoFocus>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setDeleteConfirmOpen(false);
              void onDelete();
            }}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

interface AnchorPickerProps {
  programId: string;
  slotCount: number;
  anchorDate: string | undefined;
  currentAnchorIdx: number;
  anchorIso: (mondayIndex: number) => string;
}

function AnchorPicker({
  programId,
  slotCount,
  anchorDate,
  currentAnchorIdx,
  anchorIso,
}: AnchorPickerProps) {
  if (slotCount === 7) {
    return (
      <Stack spacing={1}>
        <Typography variant="body2" color="text.secondary">
          Day 1 lands on
        </Typography>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          {WEEKDAYS_LONG.map((label, idx) => (
            <Chip
              key={label}
              label={label.slice(0, 3)}
              color={idx === currentAnchorIdx ? 'primary' : 'default'}
              onClick={() => void setProgramAnchorDate(programId, anchorIso(idx))}
              size="small"
            />
          ))}
        </Stack>
      </Stack>
    );
  }

  // Non-7 length: day-based rotation that doesn't align to the week.
  // Day 1 falls on a specific calendar date and the cycle repeats every
  // `slotCount` days.
  return (
    <Stack spacing={1}>
      <Typography variant="body2" color="text.secondary">
        Day 1 lands on (the rotation repeats every {slotCount} days)
      </Typography>
      <TextField
        type="date"
        size="small"
        value={anchorDate ?? ''}
        onChange={(e) => {
          const next = e.target.value;
          if (next) void setProgramAnchorDate(programId, next);
        }}
        slotProps={{ htmlInput: { 'aria-label': 'Routine anchor date' } }}
        sx={{ maxWidth: 200 }}
      />
    </Stack>
  );
}

interface SlotCardProps {
  slot: NonNullable<ReturnType<typeof useProgramDetail>>['slots'][number];
  dayNumber: number;
  canDelete: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onAddExercise: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function SlotCard({
  slot,
  dayNumber,
  canDelete,
  canMoveUp,
  canMoveDown,
  onAddExercise,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: SlotCardProps) {
  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState(slot.splitDayType.name);

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 1 }}
      >
        <Stack direction="row" alignItems="baseline" spacing={1} sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">
            Day {dayNumber}
          </Typography>
          {editingName ? (
            <TextField
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              size="small"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void renameSplitDayType(slot.splitDayType.id, draft);
                  setEditingName(false);
                } else if (e.key === 'Escape') {
                  setDraft(slot.splitDayType.name);
                  setEditingName(false);
                }
              }}
              onBlur={() => {
                if (draft !== slot.splitDayType.name)
                  void renameSplitDayType(slot.splitDayType.id, draft);
                setEditingName(false);
              }}
            />
          ) : (
            <Stack direction="row" alignItems="baseline" spacing={0.5} sx={{ minWidth: 0 }}>
              <Typography variant="body1" noWrap>
                {slot.splitDayType.name}
              </Typography>
              <IconButton
                aria-label="Rename day"
                size="small"
                onClick={() => {
                  setDraft(slot.splitDayType.name);
                  setEditingName(true);
                }}
                sx={{ width: 32, height: 32 }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Stack>
          )}
        </Stack>
        <FormControlLabel
          label="Rest"
          control={
            <Checkbox
              checked={slot.splitDayType.isRest}
              onChange={(e) => void setSplitDayTypeIsRest(slot.splitDayType.id, e.target.checked)}
            />
          }
          sx={{ ml: 0 }}
        />
      </Stack>

      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
        <IconButton
          aria-label="Move day up"
          size="small"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          sx={{ width: 32, height: 32 }}
        >
          <ArrowUpwardIcon fontSize="small" />
        </IconButton>
        <IconButton
          aria-label="Move day down"
          size="small"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          sx={{ width: 32, height: 32 }}
        >
          <ArrowDownwardIcon fontSize="small" />
        </IconButton>
        <IconButton
          aria-label="Duplicate day"
          size="small"
          onClick={onDuplicate}
          sx={{ width: 32, height: 32 }}
        >
          <ContentCopyIcon fontSize="small" />
        </IconButton>
        <Box sx={{ flex: 1 }} />
        <IconButton
          aria-label="Delete day"
          size="small"
          onClick={onDelete}
          disabled={!canDelete}
          sx={{ width: 32, height: 32 }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Stack>

      {slot.splitDayType.isRest ? (
        <Typography variant="body2" color="text.secondary">
          Rest day — no exercises.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {slot.plans.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No exercises yet.
            </Typography>
          )}
          {slot.plans.map((plan) => (
            <SlotPlanRow key={plan.slotPlan.id} row={plan} />
          ))}
          <Button
            variant="text"
            size="small"
            onClick={onAddExercise}
            sx={{ alignSelf: 'flex-start' }}
          >
            + Add exercise
          </Button>
        </Stack>
      )}
    </Box>
  );
}

interface SlotPlanRowProps {
  row: NonNullable<ReturnType<typeof useProgramDetail>>['slots'][number]['plans'][number];
}

function SlotPlanRow({ row }: SlotPlanRowProps) {
  const [editing, setEditing] = useState(false);
  const setsCount = row.slotPlan.plannedSets.length;
  const firstSet = row.slotPlan.plannedSets[0];
  const repRange = firstSet
    ? firstSet.plannedRepsMin === firstSet.plannedRepsMax
      ? `${firstSet.plannedRepsMin}`
      : `${firstSet.plannedRepsMin}-${firstSet.plannedRepsMax}`
    : '8';

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Stack sx={{ flex: 1 }}>
          <Typography variant="body2">{row.liftFamilyName}</Typography>
          <Typography variant="caption" color="text.secondary">
            {setsCount}×{repRange}
            {row.variant ? ` · ${row.variant.name}` : ''}
          </Typography>
        </Stack>
        <IconButton
          aria-label="Edit scheme"
          size="small"
          onClick={() => setEditing((v) => !v)}
          sx={{ width: 32, height: 32 }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton
          aria-label="Remove exercise"
          size="small"
          onClick={() => void removeSlotPlan(row.slotPlan.id)}
          sx={{ width: 32, height: 32 }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Stack>
      {editing && (
        <SetSchemeEditor
          plannedSets={row.slotPlan.plannedSets}
          onSave={(sets) => {
            void updateSlotPlanSets(row.slotPlan.id, sets);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </Box>
  );
}

interface SetSchemeEditorProps {
  plannedSets: PlannedSet[];
  onSave: (sets: PlannedSet[]) => void;
  onCancel: () => void;
}

function SetSchemeEditor({ plannedSets, onSave, onCancel }: SetSchemeEditorProps) {
  const first = plannedSets[0];
  const [sets, setSets] = useState(plannedSets.length);
  const [min, setMin] = useState(first?.plannedRepsMin ?? 8);
  const [max, setMax] = useState(first?.plannedRepsMax ?? 8);

  return (
    <Box sx={{ mt: 1, p: 1, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          label="Sets"
          type="number"
          size="small"
          value={sets}
          onChange={(e) => setSets(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
          sx={{ width: 80 }}
        />
        <TextField
          label="Reps min"
          type="number"
          size="small"
          value={min}
          onChange={(e) => setMin(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
          sx={{ width: 100 }}
        />
        <TextField
          label="Reps max"
          type="number"
          size="small"
          value={max}
          onChange={(e) => setMax(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
          sx={{ width: 100 }}
        />
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button size="small" variant="text" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="small"
          variant="contained"
          onClick={() => {
            const lo = Math.min(min, max);
            const hi = Math.max(min, max);
            const next: PlannedSet[] = Array.from({ length: sets }, (_v, i) => ({
              orderIndex: i,
              plannedRepsMin: lo,
              plannedRepsMax: hi,
            }));
            onSave(next);
          }}
        >
          Save
        </Button>
      </Stack>
    </Box>
  );
}

interface SlotInfo {
  slotId: string;
  dayNumber: number;
  name: string;
  isRest: boolean;
}

interface AddExerciseFlowProps {
  originSlotId: string | null;
  slots: SlotInfo[];
  onClose: () => void;
  onConfirm: (input: { slotIds: string[]; liftFamilyId: string; variantId: string }) => void;
}

/**
 * Three-step picker: pick the family → pick the variant → pick which days
 * to add it to. The day-picker step is what makes "add Dips to all my push
 * days" a one-pass action instead of repeating the flow per day. The
 * originating slot is pre-selected; users can tick siblings before
 * confirming.
 */
function AddExerciseFlow({ originSlotId, slots, onClose, onConfirm }: AddExerciseFlowProps) {
  const [step, setStep] = useState<'family' | 'variant' | 'days'>('family');
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [targetSlotIds, setTargetSlotIds] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const families = useLiftFamilies();
  const variants = useVariantsForFamily(familyId);

  useEffect(() => {
    if (originSlotId === null) {
      setStep('family');
      setFamilyId(null);
      setVariantId(null);
      setTargetSlotIds([]);
      setFilter('');
    } else {
      setTargetSlotIds([originSlotId]);
    }
  }, [originSlotId]);

  // When the user lands on the variant step and the family only has one
  // canonical variant, auto-advance to the day picker.
  useEffect(() => {
    if (step !== 'variant' || !originSlotId || !familyId) return;
    if (variants === undefined) return;
    if (variants.length === 1) {
      setVariantId(variants[0]!.variant.id);
      setStep('days');
    }
  }, [step, originSlotId, familyId, variants]);

  const filtered = (families ?? []).filter((f) =>
    f.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  const toggleSlot = (id: string) => {
    setTargetSlotIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  return (
    <>
      <BottomListDrawer
        open={originSlotId !== null && step === 'family'}
        title="Add exercise"
        onClose={onClose}
      >
        <Stack spacing={1}>
          <TextField
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search exercises"
            size="small"
            autoFocus
            fullWidth
          />
          <Stack>
            {filtered.map((f) => (
              <Box
                key={f.id}
                component="button"
                type="button"
                onClick={() => {
                  setFamilyId(f.id);
                  setStep('variant');
                }}
                sx={{
                  all: 'unset',
                  cursor: 'pointer',
                  py: 1.5,
                  px: 1,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  minHeight: 48,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Typography variant="body1">{f.name}</Typography>
              </Box>
            ))}
          </Stack>
        </Stack>
      </BottomListDrawer>

      <BottomListDrawer
        open={originSlotId !== null && step === 'variant'}
        title="Choose variant"
        onBack={() => setStep('family')}
        onClose={onClose}
      >
        <Stack>
          {(variants ?? []).map((v) => (
            <Box
              key={v.variant.id}
              component="button"
              type="button"
              onClick={() => {
                setVariantId(v.variant.id);
                setStep('days');
              }}
              sx={{
                all: 'unset',
                cursor: 'pointer',
                py: 1.5,
                px: 1,
                borderTop: '1px solid',
                borderColor: 'divider',
                minHeight: 48,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Typography variant="body1">{v.variant.name}</Typography>
            </Box>
          ))}
        </Stack>
      </BottomListDrawer>

      <BottomListDrawer
        open={originSlotId !== null && step === 'days'}
        title="Add to which days?"
        onBack={() => setStep('variant')}
        onClose={onClose}
        footer={
          <Button
            variant="contained"
            fullWidth
            disabled={targetSlotIds.length === 0 || !familyId || !variantId}
            onClick={() => {
              if (!familyId || !variantId) return;
              onConfirm({ slotIds: targetSlotIds, liftFamilyId: familyId, variantId });
            }}
          >
            {`Add to ${targetSlotIds.length} ${targetSlotIds.length === 1 ? 'day' : 'days'}`}
          </Button>
        }
      >
        <Stack>
          {slots.map((s) => {
            const checked = targetSlotIds.includes(s.slotId);
            return (
              <Box
                key={s.slotId}
                component="button"
                type="button"
                onClick={() => toggleSlot(s.slotId)}
                aria-pressed={checked}
                sx={{
                  all: 'unset',
                  cursor: 'pointer',
                  py: 1.25,
                  px: 1,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: 48,
                  opacity: s.isRest ? 0.5 : 1,
                }}
              >
                <Stack>
                  <Typography variant="body1">
                    Day {s.dayNumber} · {s.name}
                  </Typography>
                  {s.isRest && (
                    <Typography variant="caption" color="text.secondary">
                      rest day
                    </Typography>
                  )}
                </Stack>
                <Checkbox checked={checked} disabled={s.isRest} tabIndex={-1} />
              </Box>
            );
          })}
        </Stack>
      </BottomListDrawer>
    </>
  );
}
