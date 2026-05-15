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

export async function runExport(opts: ExportInvocation): Promise<ExportResult | ExportError> {
  let destination: ExportDestination;
  try {
    destination = await getDestination();
  } catch (err: unknown) {
    return failure('AUTH_EXPIRED', err);
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

  const record: ExportRecord = {
    timestamp: payload.exportedAt,
    filename: jsonFile.name,
    byteSize: json.length,
    // 'memory' is a test-only kind; map it to local-directory in the
    // persisted record so production readers (status line, history view)
    // never see it.
    destinationKind: destination.kind === 'memory' ? 'local-directory' : destination.kind,
  };
  await getDb().meta.put({ key: META_LAST_OK, value: { ...record, trigger: opts.trigger } });
  await getDb().meta.delete(META_LAST_FAIL);

  return { ok: true, record, payload };
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
