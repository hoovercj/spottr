/**
 * `LiveTable` / `LiveWhereClause` / `LiveCollection` wrap Dexie's read
 * APIs to make tombstone-aware reads structural rather than something a
 * caller has to remember at every site. The "live" verbs return only
 * non-deleted rows; the asymmetric "raw" access is still available via
 * `db.<tableName>` (the underlying `EntityTable`) for the small number of
 * mutation paths that legitimately need to operate on tombstoned rows.
 *
 * Read-path guidance:
 *   - User-visible queries: `db.live.X.toArray()`, `db.live.X.get(id)`,
 *     `db.live.X.where('foo').equals(bar).toArray()`, etc.
 *   - Mutation actions that need to load a row before updating it can
 *     still use the raw table — they intentionally see tombstones so
 *     they can overwrite them. Code review for `db.<table>` (not
 *     `db.live.<table>`) is the one-stop audit.
 *
 * Soft-delete also lives here so the safe API is a single object:
 *   - `db.live.X.softDelete(id)`
 *   - `db.live.X.softDeleteMany(ids)`
 *   - `db.live.X.where(...).equals(...).softDeleteAll()`
 */

import type { Collection, Table, WhereClause } from 'dexie';
import type { SyncFields } from '@/data/types';
import { nowIso } from '@/data/ids';

type Mergeable = SyncFields & { id: string };

function isLive<T extends SyncFields>(row: T): boolean {
  return !row.deletedAt;
}
function filterLive<T extends SyncFields>(rows: T[]): T[] {
  return rows.filter(isLive);
}

export class LiveTable<T extends Mergeable> {
  constructor(public readonly raw: Table<T>) {}

  async get(id: string): Promise<T | undefined> {
    const row = await this.raw.get(id);
    return row && isLive(row) ? row : undefined;
  }

  async bulkGet(ids: string[]): Promise<Array<T | undefined>> {
    const rows = await this.raw.bulkGet(ids);
    return rows.map((r) => (r && isLive(r) ? r : undefined));
  }

  async toArray(): Promise<T[]> {
    return filterLive(await this.raw.toArray());
  }

  async count(): Promise<number> {
    return (await this.toArray()).length;
  }

  where(field: string | string[]): LiveWhereClause<T> {
    const clause = (this.raw.where as (f: string | string[]) => WhereClause<T>).call(
      this.raw,
      field,
    );
    return new LiveWhereClause(this.raw, clause);
  }

  orderBy(field: string): LiveCollection<T> {
    // orderBy on Dexie's Table returns Collection<T, IndexableType, T>; our
    // generic constraint widens to Collection<T> via cast.
    return new LiveCollection(this.raw, this.raw.orderBy(field) as Collection<T>);
  }

  /** Tombstone the row by id. Idempotent; missing-row is a no-op. */
  async softDelete(id: string): Promise<void> {
    const row = await this.raw.get(id);
    if (!row) return;
    const ts = nowIso();
    await this.raw.put({ ...row, deletedAt: ts, updatedAt: ts });
  }

  /** Tombstone multiple rows by id. */
  async softDeleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const rows = await this.raw.bulkGet(ids);
    const ts = nowIso();
    const updated: T[] = rows
      .filter((r): r is T => Boolean(r))
      .map((r) => ({ ...r, deletedAt: ts, updatedAt: ts }));
    if (updated.length) await this.raw.bulkPut(updated);
  }
}

export class LiveWhereClause<T extends Mergeable> {
  constructor(
    private readonly table: Table<T>,
    private readonly clause: WhereClause<T>,
  ) {}

  equals(key: string | number): LiveCollection<T> {
    return new LiveCollection(this.table, this.clause.equals(key));
  }

  anyOf(keys: Array<string | number>): LiveCollection<T> {
    return new LiveCollection(this.table, this.clause.anyOf(keys));
  }
}

export class LiveCollection<T extends Mergeable> {
  constructor(
    private readonly table: Table<T>,
    private readonly collection: Collection<T>,
  ) {}

  async toArray(): Promise<T[]> {
    return filterLive(await this.collection.toArray());
  }

  async first(): Promise<T | undefined> {
    // Can't call `.first()` on the raw collection because it might return
    // a tombstone — pull the whole filtered set instead.
    return (await this.toArray())[0];
  }

  async count(): Promise<number> {
    return (await this.toArray()).length;
  }

  async sortBy(field: string): Promise<T[]> {
    return filterLive(await this.collection.sortBy(field));
  }

  and(predicate: (row: T) => boolean): LiveCollection<T> {
    return new LiveCollection(this.table, this.collection.and(predicate));
  }

  /** Soft-delete every matching row in one bulk write. */
  async softDeleteAll(): Promise<void> {
    const rows = await this.collection.toArray();
    if (rows.length === 0) return;
    const ts = nowIso();
    await this.table.bulkPut(rows.map((r) => ({ ...r, deletedAt: ts, updatedAt: ts })));
  }
}
