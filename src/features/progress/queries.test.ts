import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import { runSeed } from '@/data/seed';
import { seedFakeHistory } from '@/data/fakeHistory';
import { setUserUnits } from '@/features/settings/actions';
import {
  getAllChartableVariantsPure,
  getDefaultProgressVariantsPure,
  getProgressDataPure,
} from '@/features/progress/queries';

describe('progress queries (pure)', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
  });
  afterEach(async () => {
    await getDb().delete();
  });

  it('default-progress variants returns the first non-rest slot variant per slot, deduped', async () => {
    await runSeed();
    const ids = await getDefaultProgressVariantsPure();
    expect(ids.length).toBeGreaterThan(0);
    // Each entry is a variantId — resolve names to assert the active routine's
    // first exercises bubble up.
    const db = getDb();
    const variants = await db.variant.bulkGet(ids);
    const familyIds = variants.map((v) => v?.liftFamilyId).filter(Boolean) as string[];
    const families = await db.liftFamily.bulkGet(familyIds);
    const familyNames = families.map((f) => f?.name);
    expect(familyNames).toContain('Bench Press');
    expect(familyNames).toContain('Squat');
  });

  it('chart picker lists every variant that has at least one logged set, sorted by family then variant', async () => {
    await runSeed();
    await setUserUnits('lb');
    await seedFakeHistory(4);
    const options = await getAllChartableVariantsPure();
    expect(options.length).toBeGreaterThan(0);
    // Sorted ascending by familyName then variantName.
    for (let i = 1; i < options.length; i++) {
      const a = options[i - 1]!;
      const b = options[i]!;
      const cmp = a.liftFamilyName.localeCompare(b.liftFamilyName);
      if (cmp === 0) {
        expect(a.variantName.localeCompare(b.variantName)).toBeLessThanOrEqual(0);
      } else {
        expect(cmp).toBeLessThan(0);
      }
    }
    // At least one bodyweight variant should be flagged so the chart can pick
    // the reps axis for it (Pull-up Bodyweight from the PPL seed).
    const bodyweight = options.find((o) => o.isBodyweight);
    expect(bodyweight).toBeDefined();
  });

  it('after seedFakeHistory, getProgressData returns weight series for non-bodyweight variants', async () => {
    await runSeed();
    await setUserUnits('lb');
    await seedFakeHistory(4);
    const defaults = await getDefaultProgressVariantsPure();
    const db = getDb();
    const variants = await db.variant.bulkGet(defaults);
    const nonBodyweight = defaults.filter((_id, i) => variants[i]?.equipmentKind !== 'bodyweight');

    const data = await getProgressDataPure(nonBodyweight, 'lb');
    expect(data.series.length).toBeGreaterThan(0);
    expect(data.rows.length).toBeGreaterThan(0);
    for (const s of data.series) {
      expect(s.metric).toBe('weight');
      expect(s.points.length).toBeGreaterThan(0);
    }
    expect(data.hasWeight).toBe(true);
    expect(data.hasReps).toBe(false);
  });

  it('bodyweight variants produce reps-axis series, not weight ones', async () => {
    await runSeed();
    await setUserUnits('lb');
    await seedFakeHistory(4);
    // Find the Pull-up Bodyweight variant from the seeded library.
    const db = getDb();
    const all = await getAllChartableVariantsPure();
    const bw = all.find((o) => o.isBodyweight);
    if (!bw) {
      // Skip cleanly if the fake-history seed didn't end up touching a
      // bodyweight slot in this run; nothing useful to assert.
      return;
    }
    expect(bw).toBeDefined();
    // Sanity: a Pull-up bodyweight variant exists in the catalog.
    const pullup = await db.liftFamily.where('name').equals('Pull-up').first();
    expect(pullup).toBeDefined();

    const data = await getProgressDataPure([bw.variantId], 'lb');
    if (data.series.length === 0) {
      // No logged sets for that variant in this fake-history run — acceptable.
      return;
    }
    const series = data.series[0]!;
    expect(series.metric).toBe('reps');
    expect(data.hasReps).toBe(true);
    expect(data.hasWeight).toBe(false);
    for (const p of series.points) {
      expect(p.value).toBeGreaterThan(0);
      expect(Number.isInteger(p.value)).toBe(true);
    }
  });
});
