import { useNavigate } from 'react-router-dom';
import { Box, Button, IconButton, Stack } from '@mui/material';
import EditIcon from '@mui/icons-material/Tune';
import { BottomListDrawer } from '@/components/BottomListDrawer';
import { InlineRenameRow } from '@/components/InlineRenameRow';
import { useActiveProgram, useAllPrograms } from '@/features/programs/hooks';
import { renameProgram, setActiveProgram } from '@/features/programs/actions';

export interface RoutinePickerProps {
  open: boolean;
  onClose: () => void;
}

export function RoutinePicker({ open, onClose }: RoutinePickerProps) {
  const programs = useAllPrograms();
  const active = useActiveProgram();
  const navigate = useNavigate();

  return (
    <BottomListDrawer
      open={open}
      title="Routine"
      onClose={onClose}
      footer={
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            fullWidth
            onClick={() => {
              onClose();
              void navigate('/routine/edit/new');
            }}
          >
            Create new routine
          </Button>
        </Stack>
      }
    >
      <Box>
        {sortedWithCurrentFirst(programs ?? [], active?.id).map((p) => (
          <InlineRenameRow
            key={p.id}
            label={p.name}
            isCurrent={active?.id === p.id}
            canEdit
            extraActions={
              active?.id === p.id ? (
                <IconButton
                  aria-label={`Open editor for ${p.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                    void navigate(`/routine/edit/${p.id}`);
                  }}
                  size="small"
                  sx={{ width: 40, height: 40 }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              ) : null
            }
            onSelect={() => {
              void setActiveProgram(p.id);
              onClose();
            }}
            onRename={async (next) => {
              await renameProgram(p.id, next);
            }}
          />
        ))}
      </Box>
    </BottomListDrawer>
  );
}

function sortedWithCurrentFirst<T extends { id: string }>(items: T[], currentId?: string): T[] {
  if (!currentId) return items;
  const idx = items.findIndex((x) => x.id === currentId);
  if (idx < 0) return items;
  const cur = items[idx]!;
  return [cur, ...items.slice(0, idx), ...items.slice(idx + 1)];
}
