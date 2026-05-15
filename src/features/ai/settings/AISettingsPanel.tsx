/**
 * AI provider settings — just Gemini + API key for MVP. Keys are stored
 * locally on this device (in the `meta` table, deliberately excluded
 * from Drive sync) and never appear in export payloads.
 *
 * "Test connection" hits a 1-token request so the user gets immediate
 * feedback that the key is valid rather than discovering it lazily on
 * their first chat send.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import {
  clearApiKey,
  getAISettings,
  setApiKey,
  setProvider,
} from '@/features/ai/settings/apiKeyStore';
import { GeminiProvider } from '@/features/ai/providers/gemini';
import { UserProfileForm } from '@/features/ai/settings/UserProfileForm';

type Status =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; model: string }
  | { kind: 'error'; message: string };

export function AISettingsPanel() {
  const [draftKey, setDraftKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const [storedKey, setStoredKey] = useState<string | null>(null);
  const [model, setModel] = useState('gemini-2.5-flash');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const refresh = useCallback(async () => {
    const s = await getAISettings();
    setStoredKey(s.apiKey);
    setModel(s.model);
    setDraftKey('');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    if (!draftKey.trim()) return;
    await setProvider('gemini');
    await setApiKey('gemini', draftKey.trim());
    setStatus({ kind: 'idle' });
    await refresh();
  };

  const clear = async () => {
    await clearApiKey('gemini');
    setStatus({ kind: 'idle' });
    await refresh();
  };

  const test = async () => {
    const key = (draftKey.trim() || storedKey) ?? '';
    if (!key) {
      setStatus({ kind: 'error', message: 'Enter a key first.' });
      return;
    }
    setStatus({ kind: 'testing' });
    try {
      const provider = new GeminiProvider({ apiKey: key, model });
      const res = await provider.send({
        messages: [{ role: 'user', content: 'Reply with the single word "ok".' }],
        tools: [],
      });
      const text = res.messages
        .map((m) => m.content)
        .join('')
        .trim()
        .toLowerCase();
      if (!text) {
        setStatus({
          kind: 'error',
          message:
            'Empty response from Gemini — the key probably works but the model returned nothing.',
        });
        return;
      }
      setStatus({ kind: 'ok', model });
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message ?? 'Test failed' });
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h2">AI coach</Typography>
      <Typography variant="body2" color="text.secondary">
        Bring your own Google AI Studio key. Free tier on Gemini 2.5 Flash is generous enough for
        normal personal use. Get a key at{' '}
        <Box component="span" sx={{ fontFamily: 'monospace' }}>
          aistudio.google.com/apikey
        </Box>
        .
      </Typography>

      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'action.hover',
          borderRadius: 1,
          p: 1.5,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Your key is stored on this device only. It never syncs to Drive and is never included in
          export payloads. Anyone with access to this device's browser data can read it.
        </Typography>
      </Box>

      <Stack spacing={1}>
        <TextField
          label="Gemini API key"
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          placeholder={
            storedKey ? `(saved — ${storedKey.slice(0, 4)}…${storedKey.slice(-4)})` : 'AIza…'
          }
          type={reveal ? 'text' : 'password'}
          fullWidth
          autoComplete="off"
          spellCheck={false}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setReveal((r) => !r)}
                    edge="end"
                    aria-label={reveal ? 'Hide key' : 'Reveal key'}
                  >
                    {reveal ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          label="Model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          fullWidth
          helperText="Default: gemini-2.5-flash. Use gemini-2.5-pro for harder questions."
        />
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button variant="contained" onClick={save} disabled={!draftKey.trim()}>
          Save key
        </Button>
        <Button variant="outlined" onClick={test} disabled={status.kind === 'testing'}>
          Test connection
        </Button>
        {storedKey && (
          <Button color="warning" onClick={clear}>
            Clear key
          </Button>
        )}
      </Stack>

      {status.kind === 'testing' && (
        <Typography variant="body2" color="text.secondary">
          Testing…
        </Typography>
      )}
      {status.kind === 'ok' && (
        <Box
          role="status"
          sx={{
            border: '1px solid',
            borderColor: 'primary.main',
            backgroundColor: 'var(--mui-palette-plateTint-green)',
            borderRadius: 1,
            p: 1.5,
          }}
        >
          <Typography variant="body2">Connected — model {status.model} responded.</Typography>
        </Box>
      )}
      {status.kind === 'error' && (
        <Box
          role="alert"
          sx={{
            border: '1px solid',
            borderColor: 'error.main',
            backgroundColor: 'var(--mui-palette-plateTint-red)',
            borderRadius: 1,
            p: 1.5,
          }}
        >
          <Typography variant="body2">{status.message}</Typography>
        </Box>
      )}

      <UserProfileForm />
    </Stack>
  );
}
