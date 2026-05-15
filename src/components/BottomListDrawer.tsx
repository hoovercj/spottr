/**
 * Bottom-sheet picker drawer — the generic shape used for variant pickers,
 * lift-family pickers, and the note drawer. Renders an optional back
 * affordance, header, scrollable list, and optional footer. Per UX spec
 * §Component Strategy, this is a thin helper, not a full custom component.
 */

import type { ReactNode } from 'react';
import { Box, IconButton, Stack, SwipeableDrawer, Typography } from '@mui/material';

export interface BottomListDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** When provided, renders a back arrow in the header that calls this. */
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function BottomListDrawer(props: BottomListDrawerProps) {
  return (
    <SwipeableDrawer
      anchor="bottom"
      open={props.open}
      onOpen={() => undefined}
      onClose={props.onClose}
      disableSwipeToOpen
      ModalProps={{ keepMounted: false }}
    >
      <Box
        sx={{
          p: 2,
          pb: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          maxHeight: '70vh',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          {props.onBack && (
            <IconButton
              onClick={props.onBack}
              aria-label="Back"
              size="small"
              sx={{ width: 40, height: 40 }}
            >
              ←
            </IconButton>
          )}
          <Typography variant="body1" sx={{ flex: 1 }}>
            {props.title}
          </Typography>
          <IconButton onClick={props.onClose} aria-label="Close" size="small">
            ✕
          </IconButton>
        </Stack>
        <Box sx={{ overflowY: 'auto', flex: 1 }}>{props.children}</Box>
        {props.footer && <Box>{props.footer}</Box>}
      </Box>
    </SwipeableDrawer>
  );
}
