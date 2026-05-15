import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import { newId, nowIso } from '@/data/ids';
import { runSeed } from '@/data/seed';
import { renameProgram, setActiveProgram } from '@/features/programs/actions';

describe('program actions', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
  });
  afterEach(async () => {
    await getDb().delete();
  });

  it('renameProgram trims and persists the new name', async () => {
    await runSeed();
    const db = getDb();
    const program = (await db.program.toArray()).find((p) => p.isActive)!;
    await renameProgram(program.id, '  PPL — Mondays  ');
    const refreshed = await db.program.get(program.id);
    expect(refreshed?.name).toBe('PPL — Mondays');
  });

  it('renameProgram rejects empty input', async () => {
    await runSeed();
    const db = getDb();
    const program = (await db.program.toArray()).find((p) => p.isActive)!;
    await expect(renameProgram(program.id, '   ')).rejects.toThrow(/required/i);
  });

  it('setActiveProgram leaves exactly one program with isActive=true', async () => {
    await runSeed();
    const db = getDb();
    // Add a second program manually to exercise the flip.
    const newProgramId = newId();
    await db.program.put({
      id: newProgramId,
      name: 'Upper / Lower',
      isActive: false,
      anchorDate: '2026-05-04',
      createdAt: nowIso(),
    });

    await setActiveProgram(newProgramId);

    const all = await db.program.toArray();
    const activeIds = all.filter((p) => p.isActive).map((p) => p.id);
    expect(activeIds).toEqual([newProgramId]);
  });
});
