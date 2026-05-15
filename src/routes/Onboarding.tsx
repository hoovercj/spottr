import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import {
  chooseDownloadFallback,
  chooseLocalDirectory,
  supportsFileSystemAccess,
} from '@/features/export/destination';

export function Onboarding() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fsaSupported = supportsFileSystemAccess();

  const pickFolder = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await chooseLocalDirectory();
      if (!result) {
        setError('Your browser does not support choosing a folder. Use downloads instead.');
        return;
      }
      void navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not set the folder';
      // AbortError is what FSA throws when the user dismisses the picker.
      if (/abort/i.test(msg)) {
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const pickDownload = async () => {
    setBusy(true);
    setError(null);
    try {
      await chooseDownloadFallback();
      void navigate('/', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not switch to download backups');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        p: 3,
        gap: 3,
      }}
    >
      <Stack spacing={1.5}>
        <Typography variant="h1">Set up backups</Typography>
        <Typography variant="body2" color="text.secondary">
          Your workouts are stored only on this device. Choose where to back them up before you
          start logging.
        </Typography>
      </Stack>

      <Stack spacing={2} sx={{ mt: 'auto' }}>
        {error && (
          <Box role="alert" sx={{ color: 'error.main' }}>
            <Typography variant="body2">{error}</Typography>
          </Box>
        )}

        <Button
          onClick={() => void pickFolder()}
          disabled={busy || !fsaSupported}
          fullWidth
          variant="contained"
        >
          Choose a folder on this device
        </Button>
        {!fsaSupported && (
          <Typography variant="caption" color="text.secondary">
            Folder access is unavailable in this browser. Use downloads instead.
          </Typography>
        )}

        <Button onClick={() => void pickDownload()} disabled={busy} fullWidth variant="text">
          Save backups to my downloads folder
        </Button>
      </Stack>
    </Box>
  );
}
