import { Stack, Typography } from '@mui/material';
import type { ExportStatusView } from '@/features/export/hooks';

export interface ExportStatusLineProps {
  status: ExportStatusView | undefined;
}

export function ExportStatusLine({ status }: ExportStatusLineProps) {
  if (!status) {
    return (
      <Typography variant="body2" color="text.secondary">
        Loading export status…
      </Typography>
    );
  }

  if (!status.destinationKind) {
    return (
      <Typography variant="body2" color="text.secondary">
        No backup destination configured.
      </Typography>
    );
  }

  return (
    <Stack spacing={0.5}>
      {status.lastOk ? (
        <Typography variant="body2" color="text.secondary">
          Last export: {formatRelative(status.lastOk.timestamp)} (
          {destinationLabel(status.lastOk.destinationKind)}).
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No export run yet.
        </Typography>
      )}
      {status.lastFail && (
        <Typography variant="body2" color="error.main">
          Last attempt failed: {status.lastFail.reason}. {status.lastFail.message}
        </Typography>
      )}
    </Stack>
  );
}

function destinationLabel(kind: 'local-directory' | 'download' | 'google-drive'): string {
  switch (kind) {
    case 'local-directory':
      return 'folder';
    case 'download':
      return 'downloads';
    case 'google-drive':
      return 'Google Drive';
  }
}

function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
