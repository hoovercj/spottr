import { useEffect, useState } from 'react';
import { Stack, TextField, Button } from '@mui/material';
import { BottomListDrawer } from '@/components/BottomListDrawer';

export interface NoteDrawerProps {
  open: boolean;
  initialValue: string;
  onClose: () => void;
  onSave: (note: string) => void;
}

export function NoteDrawer({ open, initialValue, onClose, onSave }: NoteDrawerProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  return (
    <BottomListDrawer
      open={open}
      title="Note for this lift"
      onClose={() => {
        onSave(value);
        onClose();
      }}
      footer={
        <Stack direction="row" spacing={1}>
          <Button variant="text" onClick={onClose} fullWidth>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              onSave(value);
              onClose();
            }}
            fullWidth
          >
            Save
          </Button>
        </Stack>
      }
    >
      <TextField
        value={value}
        onChange={(e) => setValue(e.target.value)}
        multiline
        minRows={4}
        fullWidth
        placeholder=""
        aria-label="Note text"
      />
    </BottomListDrawer>
  );
}
