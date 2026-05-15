/**
 * Per-row last-write-wins merge for two Spottr export payloads.
 *
 * The merge is symmetric: for every store except `meta` and `migrationLog`,
 * rows from both sides are unioned by id, and on collision the row with
 * the higher `updatedAt` wins. Tombstones (rows with `deletedAt` set) win
 * the same way regular rows do, so deletes propagate correctly across
 * devices.
 *
 * `meta` is taken from `local` verbatim — per-device settings (current
 * location, last-export status, Drive connection state, OAuth handles)
 * shouldn't follow data across devices. `migrationLog` is also local —
 * each device records its own migration history.
 *
 * Rows without an `updatedAt` (legacy v1 data, or fresh imports from
 * tools that didn't stamp the field) are treated as oldest. The schema
 * v2 upgrade backfills `updatedAt = createdAt ?? nowIso()` on every
 * existing row at migrate-time, so this fallback should only matter for
 * payloads produced by an old build that never ran the upgrade.
 */

import type { ExportPayload } from '@/features/export/types';

interface RowWithId {
  id: string;
  updatedAt?: string;
  createdAt?: string;
  deletedAt?: string;
}

const LOCAL_WINS_STORES = new Set<keyof ExportPayload['stores']>(['migrationLog']);

export interface MergeStats {
  /** Rows kept from local because local was newer (or only side). */
  localKept: number;
  /** Rows kept from remote because remote was newer (or only side). */
  remoteKept: number;
  /** Rows where both sides agreed (no-op). */
  identical: number;
  /** Tombstones in the merged output. */
  tombstones: number;
}

export interface MergeResult {
  payload: ExportPayload;
  stats: Record<string, MergeStats>;
}

/**
 * Returns a new payload representing the LWW union of `local` and
 * `remote`. Does not mutate either input.
 */
export function mergePayloads(local: ExportPayload, remote: ExportPayload): MergeResult {
  const merged: ExportPayload = {
    ...local,
    exportedAt: new Date().toISOString(),
    stores: { ...local.stores },
  };
  const stats: Record<string, MergeStats> = {};

  const storeKeys = Object.keys(local.stores) as Array<keyof ExportPayload['stores']>;
  for (const key of storeKeys) {
    if (LOCAL_WINS_STORES.has(key)) {
      merged.stores = { ...merged.stores, [key]: local.stores[key] };
      continue;
    }
    const { rows, stats: s } = mergeStore(local.stores[key], remote.stores[key] ?? []);
    merged.stores = { ...merged.stores, [key]: rows };
    stats[key as string] = s;
  }

  return { payload: merged, stats };
}

function mergeStore(local: RowWithId[], remote: RowWithId[]) {
  const out = new Map<string, RowWithId>();
  const stats: MergeStats = { localKept: 0, remoteKept: 0, identical: 0, tombstones: 0 };

  for (const r of local) out.set(r.id, r);
  for (const r of remote) {
    const existing = out.get(r.id);
    if (!existing) {
      out.set(r.id, r);
      stats.remoteKept++;
      continue;
    }
    const localUpd = stamp(existing);
    const remoteUpd = stamp(r);
    if (localUpd === remoteUpd) {
      stats.identical++;
      continue;
    }
    if (remoteUpd > localUpd) {
      out.set(r.id, r);
      stats.remoteKept++;
    } else {
      stats.localKept++;
    }
  }

  // Rows only in local don't get counted in the per-side accumulator
  // (they were the initial population) — compute that separately.
  const remoteIds = new Set(remote.map((r) => r.id));
  for (const r of local) {
    if (!remoteIds.has(r.id)) stats.localKept++;
  }

  const rows = [...out.values()];
  for (const r of rows) if (r.deletedAt) stats.tombstones++;
  return { rows, stats };
}

function stamp(row: RowWithId): string {
  return row.updatedAt ?? row.createdAt ?? '';
}
