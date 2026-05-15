import { describe, expect, it } from 'vitest';
import { mergePayloads } from '@/features/export/merge';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, type ExportPayload } from '@/features/export/types';

function emptyPayload(): ExportPayload {
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    schemaVersion: 2,
    exportedAt: '2026-01-01T00:00:00.000Z',
    stores: {
      liftFamily: [],
      variant: [],
      location: [],
      program: [],
      splitDayType: [],
      scheduleSlot: [],
      slotPlan: [],
      slotPlanSupersetGroup: [],
      locationSupersetMemory: [],
      session: [],
      sessionLift: [],
      sessionSet: [],
      cardioEntry: [],
      stretchEntry: [],
      migrationLog: [],
    },
  };
}

function mkSession(id: string, updatedAt: string, deletedAt?: string) {
  const row = {
    id,
    locationId: 'loc',
    startedAt: '2026-01-01T18:00:00.000Z',
    state: 'COMPLETED' as const,
    updatedAt,
  };
  return deletedAt ? { ...row, deletedAt } : row;
}

describe('mergePayloads (LWW)', () => {
  it('rows only on one side are kept', () => {
    const local = emptyPayload();
    local.stores.session = [mkSession('A', '2026-01-01')];
    const remote = emptyPayload();
    remote.stores.session = [mkSession('B', '2026-01-01')];
    const { payload } = mergePayloads(local, remote);
    expect(payload.stores.session.map((s) => s.id).sort()).toEqual(['A', 'B']);
  });

  it('same-id row: newer updatedAt wins', () => {
    const local = emptyPayload();
    local.stores.session = [mkSession('A', '2026-01-01')];
    const remote = emptyPayload();
    remote.stores.session = [mkSession('A', '2026-02-01')];
    const { payload } = mergePayloads(local, remote);
    expect(payload.stores.session).toHaveLength(1);
    expect(payload.stores.session[0]!.updatedAt).toBe('2026-02-01');
  });

  it('same-id row: identical updatedAt is a no-op', () => {
    const local = emptyPayload();
    local.stores.session = [mkSession('A', '2026-01-01')];
    const remote = emptyPayload();
    remote.stores.session = [mkSession('A', '2026-01-01')];
    const { payload, stats } = mergePayloads(local, remote);
    expect(payload.stores.session).toHaveLength(1);
    expect(stats.session?.identical).toBe(1);
  });

  it('tombstones win like any other row when updatedAt is newer', () => {
    // Local has a live row; remote has a tombstone with a newer updatedAt.
    // Expected: merged row is the tombstone — delete propagates.
    const local = emptyPayload();
    local.stores.session = [mkSession('A', '2026-01-01')];
    const remote = emptyPayload();
    remote.stores.session = [mkSession('A', '2026-02-01', '2026-02-01')];
    const { payload } = mergePayloads(local, remote);
    expect(payload.stores.session).toHaveLength(1);
    expect(payload.stores.session[0]!.deletedAt).toBe('2026-02-01');
  });

  it('older tombstone loses to a newer live row (un-delete propagates)', () => {
    // Local has a tombstone; remote has a newer live row — the local
    // delete is older than the remote edit, so the row stays alive.
    const local = emptyPayload();
    local.stores.session = [mkSession('A', '2026-01-01', '2026-01-01')];
    const remote = emptyPayload();
    remote.stores.session = [mkSession('A', '2026-02-01')];
    const { payload } = mergePayloads(local, remote);
    expect(payload.stores.session).toHaveLength(1);
    expect(payload.stores.session[0]!.deletedAt).toBeUndefined();
    expect(payload.stores.session[0]!.updatedAt).toBe('2026-02-01');
  });

  it('migrationLog is taken from local (per-device journal)', () => {
    const local = emptyPayload();
    local.stores.migrationLog = [
      {
        id: 'L1',
        timestamp: '2026-01-01',
        versionFrom: 1,
        versionTo: 2,
        action: 'upgrade',
        status: 'completed',
        message: '',
      },
    ];
    const remote = emptyPayload();
    remote.stores.migrationLog = [
      {
        id: 'R1',
        timestamp: '2026-02-01',
        versionFrom: 1,
        versionTo: 2,
        action: 'upgrade',
        status: 'completed',
        message: '',
      },
    ];
    const { payload } = mergePayloads(local, remote);
    expect(payload.stores.migrationLog.map((m) => m.id)).toEqual(['L1']);
  });

  it('rows missing updatedAt are treated as oldest', () => {
    const local = emptyPayload();
    // Legacy v1-style row with no updatedAt but a createdAt — used as
    // the fallback timestamp.
    local.stores.session = [
      {
        id: 'A',
        locationId: 'loc',
        startedAt: '2026-01-01T18:00:00.000Z',
        state: 'COMPLETED',
        createdAt: '2025-01-01',
      } as unknown as ExportPayload['stores']['session'][number],
    ];
    const remote = emptyPayload();
    remote.stores.session = [mkSession('A', '2026-02-01')];
    const { payload } = mergePayloads(local, remote);
    expect(payload.stores.session).toHaveLength(1);
    expect(payload.stores.session[0]!.updatedAt).toBe('2026-02-01');
  });
});
