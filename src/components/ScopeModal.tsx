/**
 * The three-tier amendment scope dialog (PRD §FR14 / FR30 / FR31).
 *
 * Labels are hard-coded — the three tiers are universal across every place
 * this dialog is invoked. UX spec §Component Strategy explicitly elects this
 * "middle position": the component is a file, but the prop contract does not
 * pre-parameterize labels.
 */

import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';

export type Scope = 'session' | 'slot' | 'splitDayType';

const SCOPE_LABELS: Record<Scope, string> = {
  session: 'Today only',
  slot: 'This schedule slot permanently',
  splitDayType: 'All slots of this split-day-type permanently',
};

const ALL_TIERS: Scope[] = ['session', 'slot', 'splitDayType'];

export interface ScopeModalProps {
  open: boolean;
  /** Subset of tiers to render. Defaults to all three. */
  tiers?: Scope[];
  /** Optional verb override for the title (e.g. "Add", "Remove"). */
  titleVerb?: string;
  /** Optional FR15 conflict-warning copy. Renders inline above the actions. */
  conflictWarning?: string;
  onConfirm: (scope: Scope) => void;
  onCancel: () => void;
}

export function ScopeModal(props: ScopeModalProps) {
  const tiers = props.tiers ?? ALL_TIERS;
  const [scope, setScope] = useState<Scope>(tiers[0] ?? 'session');

  useEffect(() => {
    if (props.open) setScope(tiers[0] ?? 'session');
  }, [props.open, tiers]);

  return (
    <Dialog
      open={props.open}
      onClose={props.onCancel}
      aria-labelledby="scope-modal-title"
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle id="scope-modal-title">{props.titleVerb ?? 'Apply change to'}:</DialogTitle>
      <DialogContent>
        <FormControl component="fieldset">
          <RadioGroup
            aria-required="true"
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
          >
            {tiers.map((tier) => (
              <FormControlLabel
                key={tier}
                value={tier}
                control={<Radio />}
                label={SCOPE_LABELS[tier]}
              />
            ))}
          </RadioGroup>
        </FormControl>
        {props.conflictWarning && (
          <Typography variant="body2" color="error.main" sx={{ mt: 2 }} role="alert">
            {props.conflictWarning}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onCancel} variant="text" autoFocus>
          Cancel
        </Button>
        <Button onClick={() => props.onConfirm(scope)} variant="contained">
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}
