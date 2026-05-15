import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import { listSnapshots, logMigration, takeSnapshot } from '@/data/snapshot';
import { newId, nowIso } from '@/data/ids';

describe('snapshot + migration log', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await getDb().delete();
  });

  it('writes a snapshot containing every non-meta store', async () => {
    const db = getDb();
    await db.liftFamily.put({
      id: newId(),
      name: 'Bench',
      isCustom: false,
      createdAt: nowIso(),
    });
    const snap = await takeSnapshot(2);
    expect(snap.versionAtTime).toBe(1);
    expect(snap.stores.liftFamily).toHaveLength(1);
    expect(Object.keys(snap.stores)).not.toContain('meta');
    expect(Object.keys(snap.stores)).not.toContain('migrationLog');
  });

  it('keeps at most two snapshots; older ones are pruned', async () => {
    for (let v = 2; v <= 5; v++) {
      await new Promise((r) => setTimeout(r, 5));
      await takeSnapshot(v);
    }
    const snaps = await listSnapshots();
    expect(snaps).toHaveLength(2);
    // Most recent first
    expect(snaps[0]!.snap.versionAtTime).toBeGreaterThanOrEqual(snaps[1]!.snap.versionAtTime);
  });

  it('appends migration log entries with status', async () => {
    await logMigration(1, 2, 'add-foo', 'started');
    await logMigration(1, 2, 'add-foo', 'completed', 'Added 0 rows');
    const all = await getDb().migrationLog.orderBy('timestamp').toArray();
    expect(all).toHaveLength(2);
    expect(all[0]!.status).toBe('started');
    expect(all[1]!.status).toBe('completed');
  });
});
