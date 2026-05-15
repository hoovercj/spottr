/**
 * Restore from an export JSON file.
 *
 * Used by:
 *   - FR52: app-start detects missing IndexedDB stores; offers automatic restore.
 *   - FR54: fresh-device restore.
 *   - Sprint 7 (future): Drive auto-restore.
 *
 * The restore is **destructive** of the current local state: every store the
 * payload covers is cleared and bulk-rewritten inside a single Dexie
 * transaction. The caller is responsible for the user-confirmation surface.
 */

import { getDb } from '@/data/db';
import { logMigration, takeSnapshot } from '@/data/snapshot';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, type ExportPayload } from '@/features/export/types';
import { withWorkoutWriteLock } from '@/data/locks';

export class RestoreFormatError extends Error {}

export function parseExportPayload(raw: string): ExportPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    throw new RestoreFormatError(
      `Not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return assertExportPayload(parsed);
}

export function assertExportPayload(value: unknown): ExportPayload {
  if (!value || typeof value !== 'object') {
    throw new RestoreFormatError('Export payload must be an object');
  }
  const obj = value as Partial<ExportPayload>;
  if (obj.format !== EXPORT_FORMAT) {
    throw new RestoreFormatError(`Unexpected format tag: ${String(obj.format)}`);
  }
  if (obj.formatVersion !== EXPORT_FORMAT_VERSION) {
    throw new RestoreFormatError(`Unsupported format version: ${String(obj.formatVersion)}`);
  }
  if (!obj.stores || typeof obj.stores !== 'object') {
    throw new RestoreFormatError('Missing `stores`');
  }
  return obj as ExportPayload;
}

export async function restoreFromPayload(payload: ExportPayload): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    // Snapshot whatever local state exists before clobbering it, so the user
    // has an undo if the restore was a mistake. We pass the payload's schema
    // version so the recovery surface can match snapshot ↔ source.
    await takeSnapshot(payload.schemaVersion);
    await logMigration(
      payload.schemaVersion,
      payload.schemaVersion,
      'restore-from-file',
      'started',
    );

    await db.transaction(
      'rw',
      [
        db.liftFamily,
        db.variant,
        db.location,
        db.program,
        db.splitDayType,
        db.scheduleSlot,
        db.slotPlan,
        db.slotPlanSupersetGroup,
        db.locationSupersetMemory,
        db.session,
        db.sessionLift,
        db.sessionSet,
        db.cardioEntry,
        db.stretchEntry,
        db.migrationLog,
      ],
      async () => {
        await Promise.all([
          db.liftFamily.clear(),
          db.variant.clear(),
          db.location.clear(),
          db.program.clear(),
          db.splitDayType.clear(),
          db.scheduleSlot.clear(),
          db.slotPlan.clear(),
          db.slotPlanSupersetGroup.clear(),
          db.locationSupersetMemory.clear(),
          db.session.clear(),
          db.sessionLift.clear(),
          db.sessionSet.clear(),
          db.cardioEntry.clear(),
          db.stretchEntry.clear(),
        ]);
        await Promise.all([
          db.liftFamily.bulkPut(payload.stores.liftFamily),
          db.variant.bulkPut(payload.stores.variant),
          db.location.bulkPut(payload.stores.location),
          db.program.bulkPut(payload.stores.program),
          db.splitDayType.bulkPut(payload.stores.splitDayType),
          db.scheduleSlot.bulkPut(payload.stores.scheduleSlot),
          db.slotPlan.bulkPut(payload.stores.slotPlan),
          db.slotPlanSupersetGroup.bulkPut(payload.stores.slotPlanSupersetGroup),
          db.locationSupersetMemory.bulkPut(payload.stores.locationSupersetMemory),
          db.session.bulkPut(payload.stores.session),
          db.sessionLift.bulkPut(payload.stores.sessionLift),
          db.sessionSet.bulkPut(payload.stores.sessionSet),
          db.cardioEntry.bulkPut(payload.stores.cardioEntry),
          db.stretchEntry.bulkPut(payload.stores.stretchEntry),
          db.migrationLog.bulkPut(payload.stores.migrationLog),
        ]);
      },
    );

    await logMigration(
      payload.schemaVersion,
      payload.schemaVersion,
      'restore-from-file',
      'completed',
      `Restored ${countRows(payload)} rows`,
    );
  });
}

function countRows(payload: ExportPayload): number {
  return Object.values(payload.stores).reduce<number>((acc, arr) => acc + arr.length, 0);
}
