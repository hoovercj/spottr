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
  loggedWeight: number | null;
  loggedReps: number | null;
  state: SetRowState;
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
  // In read-only mode, weight cell is non-interactive even if "unlogged".
  const weightCellDisabled = readOnly || logged;
  const repsCellDisabled = readOnly || logged;

  return (
    <Box
      role="row"
      sx={{
        display: 'grid',
        gridTemplateColumns: gridTemplate,
        alignItems: 'center',
        minHeight: 56,
        columnGap: 0.5,
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

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ pr: 0.5 }}>
        {!readOnly && (
          <IconButton
            size="small"
            onClick={() => onAdjustReps(row.id, -1)}
            aria-label={`Decrease reps on set ${row.setNumber}`}
            disabled={displayReps <= 0}
            sx={{ width: 44, height: 44, fontSize: '1.25rem' }}
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
            sx={{ width: 44, height: 44, fontSize: '1.25rem' }}
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

function CellButton({ children, onClick, disabled, ariaLabel }: CellButtonProps) {
  if (disabled) {
    return <Box sx={{ px: 0.5, py: 1, color: 'text.primary' }}>{children}</Box>;
  }
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      sx={{
        all: 'unset',
        px: 0.5,
        py: 1,
        cursor: 'pointer',
        color: 'text.primary',
        textAlign: 'left',
        minHeight: 56,
        display: 'flex',
        alignItems: 'center',
        flex: 1,
        '&:focus-visible': {
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
