/**
 * Drive-side reconciliation primitives.
 *
 * Two flows:
 *  - `useDriveRemoteStatus()` polls Drive on app open and reports whether
 *    the remote backup is newer than what we last imported. The Home
 *    banner uses it to surface a "Drive has newer data — restore?" prompt
 *    so a user logging on a new device gets their history without manual
 *    intervention.
 *  - `restoreFromDriveBackup()` pulls the JSON file from the Spottr folder,
 *    runs it through the standard restore path, and persists the freshly
 *    imported revision id so subsequent pushes are recognized as in-sync.
 *
 * Everything is no-op when Drive isn't the active destination — we never
 * touch the network from this module otherwise.
 */

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import {
  downloadDriveBackup,
  fetchDriveBackupMeta,
  isGoogleDriveAvailable,
} from '@/features/export/googleDrive';
import { exportFilename } from '@/features/export/serialize';
import { parseExportPayload, restoreFromPayload } from '@/features/export/restore';
import type { ExportRecord } from '@/features/export/types';
import type { ExportTrigger } from '@/features/export/service';

export type DriveSyncStatus =
  | { kind: 'unavailable' } // Drive not configured for this build
  | { kind: 'disconnected' } // not the user's chosen destination
  | { kind: 'checking' }
  | { kind: 'in-sync' }
  | { kind: 'remote-newer'; remoteModifiedAt: string }
  | { kind: 'no-remote-yet' } // Drive connected but nothing pushed there
  | { kind: 'error'; message: string };

interface ExportStatusRow {
  destinationKind?: ExportRecord['destinationKind'];
  driveRevisionId?: string;
  driveFileId?: string;
}

/**
 * One-shot Drive sync check. Caller decides when to run (typically once
 * per app open). Returns a status that drives UI prompts.
 */
export async function checkDriveRemoteStatus(): Promise<DriveSyncStatus> {
  if (!isGoogleDriveAvailable()) return { kind: 'unavailable' };
  const db = getDb();
  const kindRow = await db.meta.get('export:destinationKind');
  if (kindRow?.value !== 'google-drive') return { kind: 'disconnected' };

  try {
    const filename = exportFilename('', 'json');
    const meta = await fetchDriveBackupMeta(filename);
    if (!meta) return { kind: 'no-remote-yet' };
    const lastOk = (await db.meta.get('export:lastOk'))?.value as
      | (ExportRecord & { trigger: ExportTrigger })
      | undefined;
    const localRev = lastOk?.driveRevisionId;
    if (!localRev) {
      // We have Drive connected but no record of having pushed. Treat the
      // remote as authoritative — most likely we're on a fresh device.
      return { kind: 'remote-newer', remoteModifiedAt: meta.modifiedTime };
    }
    if (meta.headRevisionId && meta.headRevisionId !== localRev) {
      return { kind: 'remote-newer', remoteModifiedAt: meta.modifiedTime };
    }
    return { kind: 'in-sync' };
  } catch (err: unknown) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * React hook for the Home banner. Returns `checking` initially; refreshes
 * whenever the export status row changes (e.g., after a manual push from
 * Settings) so the banner self-clears.
 */
export function useDriveRemoteStatus(): DriveSyncStatus {
  // Track the export-status row so re-pushing dismisses the banner.
  const exportRow = useLiveQuery(async () => {
    const db = getDb();
    const [kindRow, okRow] = await Promise.all([
      db.meta.get('export:destinationKind'),
      db.meta.get('export:lastOk'),
    ]);
    const status: ExportStatusRow = {};
    const kind = kindRow?.value as ExportRecord['destinationKind'] | undefined;
    if (kind) status.destinationKind = kind;
    const ok = okRow?.value as (ExportRecord & { trigger: ExportTrigger }) | undefined;
    if (ok?.driveRevisionId) status.driveRevisionId = ok.driveRevisionId;
    if (ok?.driveFileId) status.driveFileId = ok.driveFileId;
    return status;
  }, []);
  const [status, setStatus] = useState<DriveSyncStatus>({ kind: 'checking' });

  const destKind = exportRow?.destinationKind;
  const revId = exportRow?.driveRevisionId;
  useEffect(() => {
    let cancelled = false;
    if (destKind === undefined) return;
    if (destKind !== 'google-drive') {
      setStatus({
        kind: isGoogleDriveAvailable() ? 'disconnected' : 'unavailable',
      });
      return;
    }
    setStatus({ kind: 'checking' });
    void (async () => {
      const next = await checkDriveRemoteStatus();
      if (!cancelled) setStatus(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [destKind, revId]);

  return status;
}

/**
 * Pull the JSON backup from Drive, run it through the destructive restore
 * path, then persist the remote revision id so the next push doesn't think
 * the remote is still newer.
 */
export async function restoreFromDriveBackup(): Promise<{ filename: string }> {
  const filename = exportFilename('', 'json');
  const meta = await fetchDriveBackupMeta(filename);
  if (!meta) throw new Error('No Drive backup found in the Spottr folder');
  const text = await downloadDriveBackup(filename);
  if (!text) throw new Error('Drive backup body was empty');
  const payload = parseExportPayload(text);
  await restoreFromPayload(payload);
  // Stamp lastOk with the revision we just consumed so future pushes
  // recognize the local state as in-sync.
  const db = getDb();
  const existing = (await db.meta.get('export:lastOk'))?.value as
    | (ExportRecord & { trigger: ExportTrigger })
    | undefined;
  const record: ExportRecord & { trigger: ExportTrigger } = {
    timestamp: meta.modifiedTime || new Date().toISOString(),
    filename,
    byteSize: text.length,
    destinationKind: 'google-drive',
    driveFileId: meta.fileId,
    driveRevisionId: meta.headRevisionId,
    trigger: existing?.trigger ?? 'manual',
  };
  await db.meta.put({ key: 'export:lastOk', value: record });
  await db.meta.delete('export:lastFail');
  return { filename };
}
