import { useRef, useState } from 'react';
import { Box, IconButton, TextField } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';

export interface ComposerProps {
  disabled: boolean;
  onSubmit: (text: string) => void;
}

/**
 * Bottom-pinned chat input. Multi-line, send-on-tap (no enter-to-send so
 * mobile keyboards don't punt the user out of a half-typed message).
 * Stays above the safe-area inset so the iOS home-bar doesn't eat the
 * send button.
 */
export function Composer({ disabled, onSubmit }: ComposerProps) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const submit = () => {
    const t = value.trim();
    if (!t || disabled) return;
    onSubmit(t);
    setValue('');
    // Keep focus so the user can keep chatting without re-tapping.
    setTimeout(() => ref.current?.focus(), 0);
  };

  return (
    <Box
      sx={{
        position: 'sticky',
        bottom: 0,
        bgcolor: 'background.paper',
        borderTop: '1px solid',
        borderColor: 'divider',
        px: 1.5,
        py: 1,
        pb: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 1,
      }}
    >
      <TextField
        inputRef={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask about your training…"
        multiline
        maxRows={4}
        fullWidth
        size="small"
        slotProps={{
          htmlInput: {
            inputMode: 'text',
            enterKeyHint: 'send',
          },
        }}
        sx={{
          '& .MuiOutlinedInput-root': { borderRadius: 3 },
        }}
      />
      <IconButton
        color="primary"
        onClick={submit}
        disabled={disabled || value.trim().length === 0}
        aria-label="Send"
        sx={{ width: 48, height: 48 }}
      >
        <SendIcon />
      </IconButton>
    </Box>
  );
}
