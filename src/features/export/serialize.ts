import { getDb, SCHEMA_VERSION } from '@/data/db';
import { nowIso } from '@/data/ids';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, type ExportPayload } from '@/features/export/types';

export async function buildExportPayload(): Promise<ExportPayload> {
  const db = getDb();
  const [
    liftFamily,
    variant,
    location,
    program,
    splitDayType,
    scheduleSlot,
    slotPlan,
    slotPlanSupersetGroup,
    locationSupersetMemory,
    session,
    sessionLift,
    sessionSet,
    cardioEntry,
    stretchEntry,
    migrationLog,
  ] = await Promise.all([
    db.liftFamily.toArray(),
    db.variant.toArray(),
    db.location.toArray(),
    db.program.toArray(),
    db.splitDayType.toArray(),
    db.scheduleSlot.toArray(),
    db.slotPlan.toArray(),
    db.slotPlanSupersetGroup.toArray(),
    db.locationSupersetMemory.toArray(),
    db.session.toArray(),
    db.sessionLift.toArray(),
    db.sessionSet.toArray(),
    db.cardioEntry.toArray(),
    db.stretchEntry.toArray(),
    db.migrationLog.toArray(),
  ]);

  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    stores: {
      liftFamily,
      variant,
      location,
      program,
      splitDayType,
      scheduleSlot,
      slotPlan,
      slotPlanSupersetGroup,
      locationSupersetMemory,
      session,
      sessionLift,
      sessionSet,
      cardioEntry,
      stretchEntry,
      migrationLog,
    },
  };
}

export function serializeJson(payload: ExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * Canonical backup filename — always the same, so the local-directory
 * destination overwrites the prior file rather than accumulating one per
 * export.
 */
export function exportFilename(_exportedAt: string, ext: 'json' | 'csv'): string {
  return `workoutbuddy-backup.${ext}`;
}
