/**
 * Pre-migration snapshot helper (PRD NFR21 / NFR29).
 *
 * Each migration that touches user data MUST call `takeSnapshot()` before
 * applying changes. Snapshots are written as a single meta row under
 * `snapshot:v<version>:<isoTimestamp>` so the recovery surface can pick the
 * most recent one.
 *
 * Snapshots are not exposed to user code outside migrations. Sprint 6 polish
 * extends this to a user-facing "restore from snapshot" path.
 */

import { getDb } from '@/data/db';
import { newId, nowIso } from '@/data/ids';
import type { MigrationLogEntry, MigrationStatus } from '@/data/types';

export interface Snapshot {
  takenAt: string;
  versionAtTime: number;
  stores: Record<string, unknown[]>;
}

const KEY_PREFIX = 'snapshot:';
const MAX_KEPT = 2;

export async function takeSnapshot(targetVersion: number): Promise<Snapshot> {
  const db = getDb();
  const stores: Record<string, unknown[]> = {};

  for (const table of db.tables) {
    if (table.name === 'meta' || table.name === 'migrationLog') continue;
    stores[table.name] = await table.toArray();
  }

  const snap: Snapshot = {
    takenAt: nowIso(),
    versionAtTime: targetVersion - 1,
    stores,
  };

  const key = `${KEY_PREFIX}v${targetVersion}:${snap.takenAt}`;
  await db.meta.put({ key, value: snap });
  await pruneOldSnapshots();
  return snap;
}

export async function listSnapshots(): Promise<Array<{ key: string; snap: Snapshot }>> {
  const db = getDb();
  const all = await db.meta.toArray();
  return all
    .filter((r) => r.key.startsWith(KEY_PREFIX))
    .map((r) => ({ key: r.key, snap: r.value as Snapshot }))
    .sort((a, b) => (a.snap.takenAt < b.snap.takenAt ? 1 : -1));
}

async function pruneOldSnapshots(): Promise<void> {
  const db = getDb();
  const sorted = await listSnapshots();
  if (sorted.length <= MAX_KEPT) return;
  const toDelete = sorted.slice(MAX_KEPT).map((s) => s.key);
  await db.meta.bulkDelete(toDelete);
}

export async function logMigration(
  versionFrom: number,
  versionTo: number,
  action: string,
  status: MigrationStatus,
  message = '',
): Promise<void> {
  const db = getDb();
  const entry: MigrationLogEntry = {
    id: newId(),
    timestamp: nowIso(),
    versionFrom,
    versionTo,
    action,
    status,
    message,
  };
  await db.migrationLog.put(entry);
}
