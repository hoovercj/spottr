/**
 * Export orchestrator.
 *
 * Public entry points:
 *   - `runExport({ trigger })` — used by manual export buttons + the
 *     before-/after-workout hooks from Sprint 3.
 *   - `getLastExportStatus()` — surfaced in app chrome (FR51).
 *
 * Writes are intentionally not blocking: the caller awaits if it cares;
 * fire-and-forget is the recommended path from start-/complete-workout.
 */

import { getDb } from '@/data/db';
import { nowIso } from '@/data/ids';
import { exportFilename, serializeJson, buildExportPayload } from '@/features/export/serialize';
import { serializeCsv } from '@/features/export/csv';
import { getDestination, type ExportDestination } from '@/features/export/destination';
import type { ExportFailure, ExportPayload, ExportRecord } from '@/features/export/types';
import type { DriveWriteResult } from '@/features/export/googleDrive';

const META_LAST_OK = 'export:lastOk';
const META_LAST_FAIL = 'export:lastFail';

export type ExportTrigger = 'manual' | 'workout-start' | 'workout-complete' | 'restore-precaution';

export interface ExportInvocation {
  trigger: ExportTrigger;
}

export interface ExportResult {
  ok: true;
  record: ExportRecord;
  payload: ExportPayload;
}

export interface ExportError {
  ok: false;
  failure: ExportFailure;
}

export interface RunExportOptions extends ExportInvocation {
  /**
   * Drive-only: skip the "remote-is-newer" guard. Used by the
   * "overwrite anyway" path after the user has reviewed the conflict
   * banner and decided their local copy is authoritative.
   */
  force?: boolean;
}

export async function runExport(opts: RunExportOptions): Promise<ExportResult | ExportError> {
  let destination: ExportDestination;
  try {
    destination = await getDestination();
  } catch (err: unknown) {
    return failure('AUTH_EXPIRED', err);
  }

  // Drive precondition: refuse to upload if the remote head revision has
  // changed since we last wrote — another device pushed in between, and
  // overwriting would silently clobber that work.
  if (destination.kind === 'google-drive' && !opts.force) {
    try {
      const conflict = await checkDriveConflict();
      if (conflict) {
        return failure(
          'REMOTE_NEWER',
          new Error(
            `Drive backup has been written by another device (revision ${conflict.remote}) since this device's last push (revision ${conflict.local}). Restore from Drive before overwriting.`,
          ),
        );
      }
    } catch (err: unknown) {
      return failure('NETWORK_ERROR', err);
    }
  }

  let payload: ExportPayload;
  try {
    payload = await buildExportPayload();
  } catch (err: unknown) {
    return failure('WRITE_FAILED', err);
  }

  const json = serializeJson(payload);
  const csv = serializeCsv(payload);
  const jsonFile = {
    name: exportFilename(payload.exportedAt, 'json'),
    contents: json,
    contentType: 'application/json' as const,
  };
  const csvFile = {
    name: exportFilename(payload.exportedAt, 'csv'),
    contents: csv,
    contentType: 'text/csv' as const,
  };

  try {
    await destination.write(jsonFile);
    await destination.write(csvFile);
  } catch (err: unknown) {
    return failure(destinationFailureReason(destination, err), err);
  }

  // Drive write returns the new head revision id via the destination's
  // `lastWrite` slot; persist it so the next push can detect concurrent
  // writes from another device.
  const driveWrite =
    destination.kind === 'google-drive'
      ? (destination as ExportDestination & { lastWrite: DriveWriteResult | null }).lastWrite
      : null;

  const record: ExportRecord = {
    timestamp: payload.exportedAt,
    filename: jsonFile.name,
    byteSize: json.length,
    // 'memory' is a test-only kind; map it to local-directory in the
    // persisted record so production readers (status line, history view)
    // never see it.
    destinationKind: destination.kind === 'memory' ? 'local-directory' : destination.kind,
    ...(driveWrite?.fileId ? { driveFileId: driveWrite.fileId } : {}),
    ...(driveWrite?.headRevisionId ? { driveRevisionId: driveWrite.headRevisionId } : {}),
  };
  await getDb().meta.put({ key: META_LAST_OK, value: { ...record, trigger: opts.trigger } });
  await getDb().meta.delete(META_LAST_FAIL);

  return { ok: true, record, payload };
}

/**
 * Look up the current Drive head revision and compare it with the one we
 * persisted on our last successful push. Returns null when there's nothing
 * to compare against (Drive file doesn't exist yet, or we've never pushed)
 * — in either case the upload should proceed.
 */
async function checkDriveConflict(): Promise<{ local: string; remote: string } | null> {
  const { fetchDriveBackupMeta } = await import('@/features/export/googleDrive');
  const lastOk = (await getDb().meta.get(META_LAST_OK))?.value as
    | (ExportRecord & { trigger: ExportTrigger })
    | undefined;
  const filename = exportFilename('', 'json');
  const meta = await fetchDriveBackupMeta(filename);
  if (!meta) return null; // no file yet → first push
  const localRev = lastOk?.driveRevisionId;
  if (!localRev) return null; // never pushed → no baseline to compare
  if (meta.headRevisionId && meta.headRevisionId !== localRev) {
    return { local: localRev, remote: meta.headRevisionId };
  }
  return null;
}

export interface LastExportStatus {
  lastOk: (ExportRecord & { trigger: ExportTrigger }) | null;
  lastFail: ExportFailure | null;
}

export async function getLastExportStatus(): Promise<LastExportStatus> {
  const [okRow, failRow] = await Promise.all([
    getDb().meta.get(META_LAST_OK),
    getDb().meta.get(META_LAST_FAIL),
  ]);
  return {
    lastOk: (okRow?.value as (ExportRecord & { trigger: ExportTrigger }) | undefined) ?? null,
    lastFail: (failRow?.value as ExportFailure | undefined) ?? null,
  };
}

function failure(reason: ExportFailure['reason'], err: unknown): ExportError {
  const message = err instanceof Error ? err.message : String(err);
  const fail: ExportFailure = { timestamp: nowIso(), reason, message };
  getDb()
    .meta.put({ key: META_LAST_FAIL, value: fail })
    .catch(() => undefined);
  return { ok: false, failure: fail };
}

function destinationFailureReason(
  destination: ExportDestination,
  err: unknown,
): ExportFailure['reason'] {
  const msg = err instanceof Error ? err.message : String(err);
  if (/permission/i.test(msg)) return 'PERMISSION_REVOKED';
  if (destination.kind === 'download') return 'WRITE_FAILED';
  return 'WRITE_FAILED';
}
