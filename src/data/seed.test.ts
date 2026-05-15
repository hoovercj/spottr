import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import { NO_LOCATION_NAME, seedIfNeeded, runSeed } from '@/data/seed';

describe('seedIfNeeded()', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await getDb().delete();
  });

  it('seeds the lift library, Home Gym location, and the default routines on first call', async () => {
    const summary = await seedIfNeeded();
    expect(summary).not.toBeNull();
    expect(summary!.liftFamilyCount).toBeGreaterThanOrEqual(18);
    expect(summary!.variantCount).toBeGreaterThan(summary!.liftFamilyCount);
    // PPL (7) + Upper/Lower (4) + nSuns (4) + Stronglifts (2) + Starting Strength (2) = 19
    expect(summary!.scheduleSlotCount).toBe(19);
  });

  it('seeds multiple popular routines so users can pick from familiar templates', async () => {
    await runSeed();
    const db = getDb();
    const names = (await db.program.toArray()).map((p) => p.name).sort();
    expect(names).toContain('PPL (6-day)');
    expect(names).toContain('Upper/Lower (4-day)');
    expect(names).toContain('Stronglifts 5x5');
    expect(names).toContain('Starting Strength');
    expect(names).toContain('nSuns 5/3/1 (4-day)');
    const actives = (await db.program.toArray()).filter((p) => p.isActive);
    expect(actives).toHaveLength(1);
    expect(actives[0]!.name).toBe('PPL (6-day)');
  });

  it('is idempotent — second call is a no-op', async () => {
    await runSeed();
    const second = await seedIfNeeded();
    expect(second).toBeNull();
  });

  it('marks home location, the active PPL program, and Tuesday Push slot correctly', async () => {
    await runSeed();
    const db = getDb();

    const home = await db.location.where('name').equals('Home Gym').first();
    expect(home).toBeDefined();

    const programs = await db.program.toArray();
    const ppl = programs.find((p) => p.name === 'PPL (6-day)');
    expect(ppl).toBeDefined();
    expect(ppl!.isActive).toBe(true);

    const slots = await db.scheduleSlot.where('programId').equals(ppl!.id).sortBy('orderIndex');
    expect(slots).toHaveLength(7);
    // Day 2 (orderIndex 1) is Push.
    const pushSlot = slots[1];
    const sdt = await db.splitDayType.get(pushSlot!.splitDayTypeId);
    expect(sdt?.name).toBe('Push');
  });

  it('seeds the "No location" built-in alongside Home Gym', async () => {
    await runSeed();
    const db = getDb();
    const names = (await db.location.toArray()).map((l) => l.name).sort();
    expect(names).toContain('Home Gym');
    expect(names).toContain(NO_LOCATION_NAME);
  });

  it('creates the Push supersets (tricep pushdown + lateral raise; overhead extension + lateral raise) on Day 2', async () => {
    await runSeed();
    const db = getDb();

    const programs = await db.program.toArray();
    const ppl = programs.find((p) => p.name === 'PPL (6-day)');
    const slots = await db.scheduleSlot.where('programId').equals(ppl!.id).sortBy('orderIndex');
    const pushSlot = slots[1]!;

    const supersets = await db.slotPlanSupersetGroup
      .where('scheduleSlotId')
      .equals(pushSlot.id)
      .toArray();
    expect(supersets).toHaveLength(2);
    expect(supersets.every((g) => g.slotPlanIds.length === 2)).toBe(true);

    const flatNames = new Set<string>();
    for (const g of supersets) {
      for (const id of g.slotPlanIds) {
        const plan = await db.slotPlan.get(id);
        const fam = plan && (await db.liftFamily.get(plan.liftFamilyId));
        if (fam) flatNames.add(fam.name);
      }
    }
    expect(flatNames.has('Tricep Pushdown')).toBe(true);
    expect(flatNames.has('Lateral Raise')).toBe(true);
    expect(flatNames.has('Overhead Tricep Extension')).toBe(true);
  });
});
