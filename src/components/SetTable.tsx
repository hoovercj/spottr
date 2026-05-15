/**
 * Set-row table. UX spec §7 (Lift Screen Anatomy) is the source of truth:
 *
 *   set# │  weight  │  − reps +  │  ☐
 *
 * Checkbox on the right edge per the Strong/Hevy convention carve-out from
 * NFR14. Set-number cell is orientation only (not interactive). Weight cell
 * opens the NumericKeypad on tap. Reps cell has flanking +/- buttons for
 * quick adjustment; the reps number itself opens the keypad on tap.
 */

import { Box, Checkbox, IconButton, Stack, Typography } from '@mui/material';

export type SetRowState = 'unlogged' | 'logged' | 'failed';

export interface SetRowView {
  id: string;
  setNumber: number;
  plannedWeight: number | null;
  plannedReps: number;
  /** Lower bound of the target rep range — drives under-range yellow tint. */
  plannedRepsMin: number;
  /** Upper bound — exceeded gets the green tint. */
  plannedRepsMax: number;
  loggedWeight: number | null;
  loggedReps: number | null;
  state: SetRowState;
}

type RowRangeStatus = 'under' | 'in-range' | 'over';

function rangeStatusFor(row: SetRowView): RowRangeStatus | null {
  if (row.state !== 'logged' || row.loggedReps == null) return null;
  if (row.loggedReps < row.plannedRepsMin) return 'under';
  if (row.loggedReps > row.plannedRepsMax) return 'over';
  return 'in-range';
}

export interface SetTableProps {
  rows: SetRowView[];
  unitLabel: string;
  /** When true, all interactive affordances are disabled (view mode). */
  readOnly?: boolean;
  onToggleLog: (rowId: string) => void;
  onEditWeight: (rowId: string) => void;
  onEditReps: (rowId: string) => void;
  /** Adjusts the row's reps value by `delta` (typically ±1). Updates loggedReps if logged, else plannedReps. */
  onAdjustReps: (rowId: string, delta: number) => void;
  /** Removes the row entirely. Hidden in read-only mode. */
  onDeleteRow: (rowId: string) => void;
}

const COLUMN_TEMPLATE_INTERACTIVE = '28px 1fr 1.3fr 40px 28px';
const COLUMN_TEMPLATE_READONLY = '28px 1fr 1.3fr 40px';

export function SetTable(props: SetTableProps) {
  const readOnly = props.readOnly ?? false;
  return (
    <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
      {props.rows.map((row) => (
        <SetTableRow
          key={row.id}
          row={row}
          unitLabel={props.unitLabel}
          readOnly={readOnly}
          onToggleLog={props.onToggleLog}
          onEditWeight={props.onEditWeight}
          onEditReps={props.onEditReps}
          onAdjustReps={props.onAdjustReps}
          onDeleteRow={props.onDeleteRow}
        />
      ))}
    </Stack>
  );
}

interface SetTableRowProps {
  row: SetRowView;
  unitLabel: string;
  readOnly: boolean;
  onToggleLog: (rowId: string) => void;
  onEditWeight: (rowId: string) => void;
  onEditReps: (rowId: string) => void;
  onAdjustReps: (rowId: string, delta: number) => void;
  onDeleteRow: (rowId: string) => void;
}

function SetTableRow({
  row,
  unitLabel,
  readOnly,
  onToggleLog,
  onEditWeight,
  onEditReps,
  onAdjustReps,
  onDeleteRow,
}: SetTableRowProps) {
  const logged = row.state === 'logged';
  const displayWeight = logged ? (row.loggedWeight ?? row.plannedWeight) : row.plannedWeight;
  const displayReps = logged ? (row.loggedReps ?? row.plannedReps) : row.plannedReps;
  const weightText = displayWeight != null ? `${displayWeight} ${unitLabel}` : `— ${unitLabel}`;
  // In read-only view mode the trailing × column collapses so the layout
  // stays balanced with the rest of the row.
  const gridTemplate = readOnly ? COLUMN_TEMPLATE_READONLY : COLUMN_TEMPLATE_INTERACTIVE;
  // Editable in both unlogged and logged states — a user who realizes they
  // mistyped a weight after checking off the set shouldn't have to uncheck
  // and re-check. Only true read-only mode (viewing a past session) locks
  // the cells.
  const weightCellDisabled = readOnly;
  const repsCellDisabled = readOnly;

  // Highlight rows whose logged reps fall outside the planned range:
  // yellow for under-target ("missed reps") and green for over-target
  // ("beat the range"). Renders as a left-edge stripe + faint tint so
  // it picks up the same visual language as the today-card / note /
  // superset surfaces.
  const rangeStatus = rangeStatusFor(row);
  const rangeSx =
    rangeStatus === 'under'
      ? {
          backgroundColor: 'var(--mui-palette-plateTint-yellow)',
          boxShadow: 'inset 3px 0 0 var(--mui-palette-plates-yellow)',
        }
      : rangeStatus === 'over'
        ? {
            backgroundColor: 'var(--mui-palette-plateTint-green)',
            boxShadow: 'inset 3px 0 0 var(--mui-palette-plates-green)',
          }
        : null;

  return (
    <Box
      role="row"
      sx={{
        display: 'grid',
        gridTemplateColumns: gridTemplate,
        alignItems: 'center',
        minHeight: 56,
        columnGap: 0.5,
        ...(rangeSx ?? {}),
      }}
    >
      <Typography
        variant="body2"
        color="text.secondary"
        className="numeric-cell"
        sx={{ pl: 1, opacity: 0.75 }}
        aria-hidden="true"
      >
        {row.setNumber}
      </Typography>

      <CellButton
        onClick={() => onEditWeight(row.id)}
        disabled={weightCellDisabled}
        ariaLabel={`Edit weight for set ${row.setNumber}, currently ${weightText}`}
      >
        <Typography variant="body1" className="numeric-cell">
          {weightText}
        </Typography>
      </CellButton>

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="center"
        spacing={0.5}
        sx={{ pr: 0.5 }}
      >
        {!readOnly && (
          <IconButton
            size="small"
            onClick={() => onAdjustReps(row.id, -1)}
            aria-label={`Decrease reps on set ${row.setNumber}`}
            disabled={displayReps <= 0}
            sx={{ width: 44, height: 44, fontSize: '1.25rem', color: 'error.main' }}
          >
            −
          </IconButton>
        )}
        <CellButton
          onClick={() => onEditReps(row.id)}
          disabled={repsCellDisabled}
          ariaLabel={`Edit reps for set ${row.setNumber}, currently ${displayReps} reps`}
        >
          <Typography variant="body1" className="numeric-cell" sx={{ textAlign: 'center' }}>
            {displayReps} reps
          </Typography>
        </CellButton>
        {!readOnly && (
          <IconButton
            size="small"
            onClick={() => onAdjustReps(row.id, 1)}
            aria-label={`Increase reps on set ${row.setNumber}`}
            sx={{ width: 44, height: 44, fontSize: '1.25rem', color: 'secondary.main' }}
          >
            +
          </IconButton>
        )}
      </Stack>

      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Checkbox
          checked={logged}
          disabled={readOnly}
          onChange={() => onToggleLog(row.id)}
          inputProps={{
            'aria-label': `Log set ${row.setNumber}, ${weightText}, ${displayReps} reps`,
          }}
          sx={{
            color: 'text.secondary',
            '&.Mui-checked': {
              color: 'primary.main',
            },
            width: 40,
            height: 40,
            p: 0.5,
          }}
        />
      </Box>
      {!readOnly && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <IconButton
            size="small"
            onClick={() => onDeleteRow(row.id)}
            aria-label={`Delete set ${row.setNumber}`}
            sx={{ width: 32, height: 32, fontSize: '0.9rem', color: 'text.secondary' }}
          >
            ✕
          </IconButton>
        </Box>
      )}
    </Box>
  );
}

interface CellButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  ariaLabel: string;
}

// One DOM shape for both states (always <button>) so the row height never
// twitches when a set toggles between logged and unlogged. `disabled` only
// changes interactivity affordances — cursor, focus ring, click handler —
// never layout. Explicit `lineHeight` defends against `all: 'unset'`
// resetting it to `normal` (~1.2) while the matching div would inherit 1.5.
//
// No `flex: 1` here on purpose: the weight cell is already a grid item in
// a `1fr` column (stretches via default justify-self), and the reps cell
// needs to size to content so it can be centered as a − [n] + group.
const CELL_LAYOUT_SX = {
  px: 0.5,
  py: 1,
  minHeight: 56,
  display: 'flex',
  alignItems: 'center',
  color: 'text.primary',
  lineHeight: 1.5,
  fontFamily: 'inherit',
  fontSize: 'inherit',
} as const;

function CellButton({ children, onClick, disabled, ariaLabel }: CellButtonProps) {
  return (
    <Box
      component="button"
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-label={ariaLabel}
      disabled={disabled}
      sx={{
        all: 'unset',
        ...CELL_LAYOUT_SX,
        cursor: disabled ? 'default' : 'pointer',
        textAlign: 'left',
        // Active state gives a brief tactile feedback in the brand green
        // rather than the mobile-browser default tap-highlight blue.
        '&:active': disabled
          ? undefined
          : { backgroundColor: 'var(--mui-palette-plateTint-green)' },
        '&:focus-visible': disabled
          ? undefined
          : {
              outline: '2px solid',
              outlineColor: 'primary.main',
              outlineOffset: 2,
            },
      }}
    >
      {children}
    </Box>
  );
}
