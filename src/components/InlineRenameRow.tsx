/**
 * A row that flips between a label + edit pencil and an in-place TextField
 * with Save/Cancel chips. Used by the location and routine pickers for
 * inline rename on the currently-selected item.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Box, IconButton, Stack, TextField, Typography } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

export interface InlineRenameRowProps {
  label: string;
  isCurrent: boolean;
  canEdit: boolean;
  /** Extra action buttons shown next to the edit pencil (e.g. routine "edit"). */
  extraActions?: ReactNode;
  onSelect: () => void;
  onRename: (next: string) => void | Promise<void>;
}

export function InlineRenameRow({
  label,
  isCurrent,
  canEdit,
  extraActions,
  onSelect,
  onRename,
}: InlineRenameRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(label);
      // Focus on next tick so the field is mounted.
      const id = setTimeout(() => inputRef.current?.select(), 0);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [editing, label]);

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
  };

  const commit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === label) {
      setEditing(false);
      return;
    }
    await onRename(trimmed);
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <Box
        sx={{
          py: 1,
          px: 1,
          borderTop: '1px solid',
          borderColor: 'divider',
          minHeight: 56,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <TextField
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          inputRef={inputRef}
          size="small"
          fullWidth
          autoFocus
          slotProps={{ htmlInput: { 'aria-label': 'Rename' } }}
        />
        <IconButton
          aria-label="Cancel rename"
          onClick={cancel}
          size="small"
          sx={{ width: 40, height: 40 }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
        <IconButton
          aria-label="Save rename"
          onClick={() => void commit()}
          size="small"
          color="primary"
          sx={{ width: 40, height: 40 }}
        >
          <CheckIcon fontSize="small" />
        </IconButton>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        borderTop: '1px solid',
        borderColor: 'divider',
        minHeight: 56,
        '&:first-of-type': { borderTop: 'none' },
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={onSelect}
        sx={{
          all: 'unset',
          cursor: 'pointer',
          flex: 1,
          py: 1.5,
          px: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 56,
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
          },
        }}
      >
        <Typography variant="body1">{label}</Typography>
        {isCurrent && (
          <Typography variant="caption" color="primary.main">
            current
          </Typography>
        )}
      </Box>
      {isCurrent && canEdit && (
        <Stack direction="row" alignItems="center" sx={{ pr: 0.5 }}>
          {extraActions}
          <IconButton
            aria-label="Rename"
            onClick={startEditing}
            size="small"
            sx={{ width: 40, height: 40 }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Stack>
      )}
    </Box>
  );
}
