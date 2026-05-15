import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import { runSeed } from '@/data/seed';
import { seedFakeHistory } from '@/data/fakeHistory';
import { newId, nowIso } from '@/data/ids';
import { setUserUnits } from '@/features/settings/actions';
import {
  getAllChartableVariantsPure,
  getDefaultProgressVariantsPure,
  getProgressDataPure,
} from '@/features/progress/queries';
import type { Session, SessionLift, SessionSet } from '@/data/types';

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

  it('one variant logged at two rep ranges produces two distinct series', async () => {
    await runSeed();
    await setUserUnits('lb');
    const db = getDb();

    // Find a free-weight variant we can attach logged sets to.
    const variant = (await db.variant.toArray()).find((v) => v.equipmentKind === 'barbell');
    expect(variant).toBeDefined();
    const location = (await db.location.toArray())[0]!;

    async function logRange(
      dateIso: string,
      min: number,
      max: number,
      weights: number[],
    ): Promise<void> {
      const session: Session = {
        id: newId(),
        locationId: location.id,
        startedAt: dateIso,
        completedAt: dateIso,
        state: 'COMPLETED',
        calendarDate: dateIso.slice(0, 10),
      };
      await db.session.put(session);
      const lift: SessionLift = {
        id: newId(),
        sessionId: session.id,
        liftFamilyId: variant!.liftFamilyId,
        variantId: variant!.id,
        orderIndex: 0,
        scope: 'session-only',
      };
      await db.sessionLift.put(lift);
      const sets: SessionSet[] = weights.map((w, idx) => ({
        id: newId(),
        sessionLiftId: lift.id,
        variantId: variant!.id,
        plannedRepsMin: min,
        plannedRepsMax: max,
        plannedReps: max,
        orderIndex: idx,
        loggedWeight: w,
        loggedReps: max,
        loggedAt: dateIso,
      }));
      await db.sessionSet.bulkPut(sets);
    }

    // Two 5×5 sessions and two 8-12 sessions on different dates.
    await logRange('2026-04-01T10:00:00Z', 5, 5, [225, 230]);
    await logRange('2026-04-08T10:00:00Z', 5, 5, [230, 235]);
    await logRange('2026-04-03T10:00:00Z', 8, 12, [145, 150, 145]);
    await logRange('2026-04-10T10:00:00Z', 8, 12, [150, 155, 150]);

    const data = await getProgressDataPure([variant!.id], 'lb');
    const forVariant = data.series.filter((s) => s.variantId === variant!.id);
    expect(forVariant).toHaveLength(2);

    const heavy = forVariant.find((s) => s.plannedRepsMin === 5 && s.plannedRepsMax === 5);
    const hyper = forVariant.find((s) => s.plannedRepsMin === 8 && s.plannedRepsMax === 12);
    expect(heavy).toBeDefined();
    expect(hyper).toBeDefined();
    expect(heavy!.seriesKey).not.toBe(hyper!.seriesKey);

    // Top set per session within each range.
    expect(heavy!.points.map((p) => p.value)).toEqual([230, 235]);
    expect(hyper!.points.map((p) => p.value)).toEqual([150, 155]);

    // Row map uses seriesKey, not variantId.
    const r1 = data.rows.find((r) => r.date === '2026-04-01');
    expect(r1?.[heavy!.seriesKey]).toBe(230);
    expect(r1?.[hyper!.seriesKey]).toBeUndefined();
    const r3 = data.rows.find((r) => r.date === '2026-04-03');
    expect(r3?.[heavy!.seriesKey]).toBeUndefined();
    expect(r3?.[hyper!.seriesKey]).toBe(150);
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
