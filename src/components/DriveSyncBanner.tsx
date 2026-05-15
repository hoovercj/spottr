/**
 * Pull-on-open banner.
 *
 * Renders only when (a) Drive is the active backup destination and
 * (b) the remote head revision has moved past the one we last pushed.
 * The prompt offers to restore-from-Drive in place. Until the user
 * resolves the conflict, the export-now button in Settings will also
 * refuse to push (REMOTE_NEWER) so they can't accidentally clobber
 * the newer remote with stale local state.
 *
 * Dismissed once per app open via local component state — if the user
 * waves it away and then a new export lands on Drive, the next mount
 * will re-poll and show it again.
 */

import { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { syncWithDriveBackup, useDriveRemoteStatus } from '@/features/export/driveSync';

export function DriveSyncBanner() {
  const status = useDriveRemoteStatus();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showRestorePrompt = status.kind === 'remote-newer' || status.kind === 'no-remote-yet';
  if (!showRestorePrompt || dismissed) return null;

  const onSync = async () => {
    setBusy(true);
    setError(null);
    try {
      await syncWithDriveBackup();
      setDismissed(true);
      // Hard reload so the React tree picks up the freshly merged DB.
      window.location.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not sync with Drive');
    } finally {
      setBusy(false);
    }
  };

  const headline =
    status.kind === 'remote-newer' ? 'Drive has changes from another device' : 'Drive backup found';
  const body =
    status.kind === 'remote-newer'
      ? "Sync will merge the other device's changes with this one. Edits made on either side are preserved, deletes propagate, and the result is pushed back to Drive."
      : 'Pull your existing data onto this device. Future changes here will sync back to Drive.';

  return (
    <Box
      role="alert"
      sx={{
        border: '1px solid',
        borderColor: 'warning.main',
        backgroundColor: 'var(--mui-palette-plateTint-yellow)',
        borderRadius: 1,
        p: 2,
      }}
    >
      <Stack spacing={1}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {headline}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {body}
        </Typography>
        {error && (
          <Typography variant="body2" color="error.main">
            {error}
          </Typography>
        )}
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="small" variant="text" onClick={() => setDismissed(true)} disabled={busy}>
            Not now
          </Button>
          <Button size="small" variant="contained" onClick={() => void onSync()} disabled={busy}>
            Sync with Drive
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
