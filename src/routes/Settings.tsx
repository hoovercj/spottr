import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { Units } from '@/data/types';
import { useUserSettings } from '@/features/settings/hooks';
import { setUserUnits } from '@/features/settings/actions';
import { useExportStatus } from '@/features/export/hooks';
import { runExport } from '@/features/export/service';
import {
  chooseDownloadFallback,
  chooseLocalDirectory,
  supportsFileSystemAccess,
} from '@/features/export/destination';
import { ExportStatusLine } from '@/features/export/ExportStatusLine';
import { parseExportPayload, restoreFromPayload } from '@/features/export/restore';
import {
  connectGoogleDrive,
  disconnectGoogleDrive,
  isGoogleDriveAvailable,
} from '@/features/export/googleDrive';
import { wipeAllData } from '@/data/reset';
import { seedFakeHistory } from '@/data/fakeHistory';

export function Settings() {
  const status = useExportStatus();
  const userSettings = useUserSettings();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conflictOpen, setConflictOpen] = useState(false);

  const exportNow = async (force = false) => {
    setBusy(true);
    setError(null);
    const result = await runExport({ trigger: 'manual', force });
    setBusy(false);
    if (!result.ok) {
      if (result.failure.reason === 'REMOTE_NEWER') {
        setConflictOpen(true);
        return;
      }
      setError(result.failure.message);
    }
  };

  const switchToFolder = async () => {
    setBusy(true);
    setError(null);
    try {
      await chooseLocalDirectory();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not change folder');
    } finally {
      setBusy(false);
    }
  };

  const switchToDownload = async () => {
    setBusy(true);
    setError(null);
    try {
      await chooseDownloadFallback();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not change destination');
    } finally {
      setBusy(false);
    }
  };

  const driveAvailable = isGoogleDriveAvailable();
  const switchToGoogleDrive = async () => {
    setBusy(true);
    setError(null);
    try {
      await connectGoogleDrive();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not connect Google Drive');
    } finally {
      setBusy(false);
    }
  };

  const disconnectDrive = async () => {
    setBusy(true);
    setError(null);
    try {
      await disconnectGoogleDrive();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not disconnect');
    } finally {
      setBusy(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [restoreInfo, setRestoreInfo] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [fakeInfo, setFakeInfo] = useState<string | null>(null);

  const onSeedFakeHistory = async () => {
    setBusy(true);
    setError(null);
    setFakeInfo(null);
    try {
      const result = await seedFakeHistory(8);
      setFakeInfo(
        `Created ${result.sessionsCreated} sessions (${result.setsCreated} sets) across ${result.weeksGenerated} weeks.`,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not seed fake history');
    } finally {
      setBusy(false);
    }
  };

  const onResetAll = async () => {
    setBusy(true);
    setError(null);
    try {
      await wipeAllData();
      // Hard reload so the React tree, route state, and seed loader all
      // re-initialize from a blank slate.
      window.location.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not reset data');
      setBusy(false);
    }
  };

  const onRestoreFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setRestoreInfo(null);
    try {
      const text = await file.text();
      const payload = parseExportPayload(text);
      await restoreFromPayload(payload);
      setRestoreInfo(`Restored from ${file.name}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not restore from file');
    } finally {
      setBusy(false);
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
          pt: 3,
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="h1">Settings</Typography>
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
        }}
      >
        <Stack spacing={2}>
          <Typography variant="h2">Default units</Typography>
          <Typography variant="body2" color="text.secondary">
            The weight unit used everywhere a location doesn't have its own override.
          </Typography>
          <ToggleButtonGroup
            value={userSettings?.units ?? 'lb'}
            exclusive
            onChange={(_e, next: Units | null) => {
              if (next) void setUserUnits(next);
            }}
            aria-label="Default unit system"
          >
            <ToggleButton value="lb" sx={{ px: 3 }}>
              Pounds (lb)
            </ToggleButton>
            <ToggleButton value="kg" sx={{ px: 3 }}>
              Kilograms (kg)
            </ToggleButton>
          </ToggleButtonGroup>

          <Divider sx={{ my: 1 }} />

          <Typography variant="h2">Backups</Typography>
          <ExportStatusLine status={status} />

          {error && (
            <Box role="alert" sx={{ color: 'error.main' }}>
              <Typography variant="body2">Export failed. {error}</Typography>
            </Box>
          )}

          <Button
            onClick={() => void exportNow(false)}
            disabled={busy}
            variant="contained"
            fullWidth
          >
            Export now
          </Button>

          <Divider sx={{ my: 1 }} />

          <Typography variant="body2" color="text.secondary">
            Current destination: {destinationDisplayName(status?.destinationKind)}
          </Typography>
          <Button
            onClick={() => void switchToFolder()}
            disabled={busy || !supportsFileSystemAccess()}
            variant="text"
          >
            Change folder
          </Button>
          <Button onClick={() => void switchToDownload()} disabled={busy} variant="text">
            Use downloads folder
          </Button>
          {driveAvailable && (
            <Button
              onClick={() => void switchToGoogleDrive()}
              disabled={busy}
              variant={status?.destinationKind === 'google-drive' ? 'text' : 'text'}
            >
              {status?.destinationKind === 'google-drive'
                ? 'Reconnect Google Drive'
                : 'Connect Google Drive'}
            </Button>
          )}
          {driveAvailable && status?.destinationKind === 'google-drive' && (
            <Button onClick={() => void disconnectDrive()} disabled={busy} variant="text">
              Disconnect Google Drive
            </Button>
          )}

          <Divider sx={{ my: 1 }} />

          <Typography variant="h2">Restore</Typography>
          <Typography variant="body2" color="text.secondary">
            Pick a previously exported `.json` file to replace local data.
          </Typography>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onRestoreFile(f);
              if (e.target) e.target.value = '';
            }}
          />
          <Button variant="text" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            Restore from file…
          </Button>
          {restoreInfo && (
            <Typography variant="body2" color="primary.main">
              {restoreInfo}
            </Typography>
          )}

          <Divider sx={{ my: 1 }} />

          <Typography variant="h2">Developer</Typography>
          <Typography variant="body2" color="text.secondary">
            Populate the database with 8 weeks of fake completed sessions so the history, calendar,
            and progress views have something to render.
          </Typography>
          <Button variant="text" onClick={() => void onSeedFakeHistory()} disabled={busy}>
            Generate fake history
          </Button>
          {fakeInfo && (
            <Typography variant="body2" color="primary.main">
              {fakeInfo}
            </Typography>
          )}

          <Divider sx={{ my: 1 }} />

          <Typography variant="h2">Legal</Typography>
          <Stack direction="row" spacing={2}>
            <Button
              variant="text"
              size="small"
              onClick={() => void navigate('/privacy')}
              sx={{ ml: -1 }}
            >
              Privacy Policy
            </Button>
            <Button variant="text" size="small" onClick={() => void navigate('/terms')}>
              Terms of Service
            </Button>
          </Stack>

          <Divider sx={{ my: 1 }} />

          <Typography variant="h2">Danger zone</Typography>
          <Typography variant="body2" color="text.secondary">
            Deletes every workout, variant, location, and the export destination on this device.
            Export first if you want to keep any of it.
          </Typography>
          <Button
            variant="text"
            color="error"
            onClick={() => setResetConfirmOpen(true)}
            disabled={busy}
          >
            Reset all data
          </Button>
        </Stack>
      </Box>

      <Dialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        aria-labelledby="reset-confirm-title"
      >
        <DialogTitle id="reset-confirm-title">Reset all data?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This deletes every workout, variant, location, schedule, and the export destination on
            this device. The app will reload and start fresh.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetConfirmOpen(false)} variant="text" autoFocus>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setResetConfirmOpen(false);
              void onResetAll();
            }}
            color="error"
            variant="contained"
          >
            Reset
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={conflictOpen}
        onClose={() => setConflictOpen(false)}
        aria-labelledby="drive-conflict-title"
      >
        <DialogTitle id="drive-conflict-title">Drive has newer data</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Another device wrote to the Spottr backup on Google Drive after this device's last push.
            Overwriting now would replace those changes with what's on this device.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Restore from Drive first to pull the newer data in, or force an overwrite if you're sure
            this device is the authoritative copy.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConflictOpen(false)} variant="text">
            Cancel
          </Button>
          <Button
            onClick={() => {
              setConflictOpen(false);
              void exportNow(true);
            }}
            color="error"
            variant="text"
            disabled={busy}
          >
            Overwrite anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function destinationDisplayName(
  kind: 'local-directory' | 'download' | 'google-drive' | 'memory' | null | undefined,
): string {
  switch (kind) {
    case 'local-directory':
      return 'local folder';
    case 'download':
      return 'downloads folder';
    case 'google-drive':
      return 'Google Drive (Spottr folder)';
    case 'memory':
    case null:
    case undefined:
    default:
      return 'unknown';
  }
}
