/**
 * Soft-delete + tombstone-filter helpers used everywhere the app would
 * otherwise call Dexie's `.delete()` or read mergeable-table rows.
 *
 * Rationale: with multi-device Drive sync the app needs to be able to
 * propagate deletes across devices without an older push silently
 * resurrecting the deleted row. Marking the row with a `deletedAt`
 * timestamp solves both problems — the merge function picks the row with
 * the higher `updatedAt` regardless of whether the winning row is a
 * tombstone, so deletes win the same way edits do.
 *
 * `wipeAllData()` (Settings → Reset all data) deliberately stays a hard
 * clear — that's the explicit "destroy local state" path.
 */

import type { SyncFields } from '@/data/types';
import { nowIso } from '@/data/ids';

// The Dexie generics for EntityTable/Table reject our `id: string`
// SyncFields constraint because InsertType makes `id` optional. We give
// up on tight typing for these helpers and accept anything that looks
// like a table — call sites pass real EntityTables, so runtime is safe.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyTable = {
  get(id: string): Promise<unknown>;
  put(row: any): Promise<unknown>;
  bulkGet(ids: string[]): Promise<Array<unknown>>;
  bulkPut(rows: any[]): Promise<unknown>;
};
type AnyCollection = { toArray(): Promise<unknown[]> };

/** Mark a row as deleted. Idempotent; missing-row is a no-op. */
export async function softDelete(table: AnyTable, id: string): Promise<void> {
  const row = (await table.get(id)) as (Record<string, unknown> & SyncFields) | undefined;
  if (!row) return;
  const ts = nowIso();
  await table.put({ ...row, deletedAt: ts, updatedAt: ts });
}

/** Bulk variant of `softDelete`. */
export async function softDeleteMany(table: AnyTable, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const rows = (await table.bulkGet(ids)) as Array<
    (Record<string, unknown> & SyncFields) | undefined
  >;
  const ts = nowIso();
  const updated = rows
    .filter((r): r is Record<string, unknown> & SyncFields => Boolean(r))
    .map((r) => ({ ...r, deletedAt: ts, updatedAt: ts }));
  if (updated.length) await table.bulkPut(updated);
}

/**
 * Soft-delete every row in a Dexie Collection (the result of a where()
 * chain). Replaces `.where(...).delete()` callsites.
 */
export async function softDeleteCollection(
  table: AnyTable,
  collection: AnyCollection,
): Promise<void> {
  const rows = (await collection.toArray()) as Array<Record<string, unknown> & SyncFields>;
  if (rows.length === 0) return;
  const ts = nowIso();
  await table.bulkPut(rows.map((r) => ({ ...r, deletedAt: ts, updatedAt: ts })));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Strip tombstones from a result set. */
export function livingRows<T extends SyncFields>(rows: T[]): T[] {
  return rows.filter((r) => !r.deletedAt);
}

/** Return `row` only if it isn't a tombstone. */
export function livingRow<T extends SyncFields>(row: T | undefined): T | undefined {
  if (!row) return undefined;
  if (row.deletedAt) return undefined;
  return row;
}
