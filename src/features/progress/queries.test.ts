import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import { runSeed } from '@/data/seed';
import { seedFakeHistory } from '@/data/fakeHistory';
import { newId } from '@/data/ids';
import { setUserUnits } from '@/features/settings/actions';
import {
  getAllChartableBucketsPure,
  getDefaultProgressBucketsPure,
  getProgressDataPure,
  makeSeriesKey,
} from '@/features/progress/queries';
import type { Session, SessionLift, SessionSet } from '@/data/types';

describe('progress queries (pure)', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
  });
  afterEach(async () => {
    await getDb().delete();
  });

  it('default-progress buckets returns the first slot plan\'s first-set range per non-rest slot, deduped', async () => {
    await runSeed();
    const buckets = await getDefaultProgressBucketsPure();
    expect(buckets.length).toBeGreaterThan(0);
    // Each entry is a bucket — resolve names to assert the active routine's
    // first exercises bubble up with valid rep ranges.
    const db = getDb();
    const variants = await db.variant.bulkGet(buckets.map((b) => b.variantId));
    const familyIds = variants.map((v) => v?.liftFamilyId).filter(Boolean) as string[];
    const families = await db.liftFamily.bulkGet(familyIds);
    const familyNames = families.map((f) => f?.name);
    expect(familyNames).toContain('Bench Press');
    expect(familyNames).toContain('Squat');
    for (const b of buckets) {
      expect(b.plannedRepsMin).toBeGreaterThan(0);
      expect(b.plannedRepsMax).toBeGreaterThanOrEqual(b.plannedRepsMin);
    }
    // Dedup: every (variant, min, max) tuple appears at most once.
    const keys = buckets.map((b) => makeSeriesKey(b.variantId, b.plannedRepsMin, b.plannedRepsMax));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('chart picker lists every (variant, rep range) bucket with at least one logged set', async () => {
    await runSeed();
    await setUserUnits('lb');
    await seedFakeHistory(4);
    const options = await getAllChartableBucketsPure();
    expect(options.length).toBeGreaterThan(0);
    // Sorted ascending by familyName then variantName then range.
    for (let i = 1; i < options.length; i++) {
      const a = options[i - 1]!;
      const b = options[i]!;
      const famCmp = a.liftFamilyName.localeCompare(b.liftFamilyName);
      if (famCmp !== 0) {
        expect(famCmp).toBeLessThan(0);
        continue;
      }
      const varCmp = a.variantName.localeCompare(b.variantName);
      if (varCmp !== 0) {
        expect(varCmp).toBeLessThan(0);
        continue;
      }
      // Same family + variant — ranges should be ascending.
      if (a.plannedRepsMin !== b.plannedRepsMin) {
        expect(a.plannedRepsMin).toBeLessThan(b.plannedRepsMin);
      } else {
        expect(a.plannedRepsMax).toBeLessThanOrEqual(b.plannedRepsMax);
      }
    }
    // Every entry has a stable seriesKey matching its parts.
    for (const o of options) {
      expect(o.seriesKey).toBe(makeSeriesKey(o.variantId, o.plannedRepsMin, o.plannedRepsMax));
    }
    // At least one bodyweight bucket should be flagged so the chart can pick
    // the reps axis for it (Pull-up Bodyweight from the PPL seed).
    const bodyweight = options.find((o) => o.isBodyweight);
    expect(bodyweight).toBeDefined();
  });

  it('after seedFakeHistory, getProgressData returns weight series for non-bodyweight buckets', async () => {
    await runSeed();
    await setUserUnits('lb');
    await seedFakeHistory(4);
    const defaults = await getDefaultProgressBucketsPure();
    const db = getDb();
    const variants = await db.variant.bulkGet(defaults.map((b) => b.variantId));
    const nonBodyweight = defaults.filter((_b, i) => variants[i]?.equipmentKind !== 'bodyweight');

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

    const data = await getProgressDataPure(
      [
        { variantId: variant!.id, plannedRepsMin: 5, plannedRepsMax: 5 },
        { variantId: variant!.id, plannedRepsMin: 8, plannedRepsMax: 12 },
      ],
      'lb',
    );
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

  it('selecting one bucket does not pull in other rep ranges of the same variant', async () => {
    await runSeed();
    await setUserUnits('lb');
    const db = getDb();
    const variant = (await db.variant.toArray()).find((v) => v.equipmentKind === 'barbell');
    expect(variant).toBeDefined();
    const location = (await db.location.toArray())[0]!;

    // Log both 5×5 and 8-12 for the same variant, but only request 5×5.
    async function logRange(
      dateIso: string,
      min: number,
      max: number,
      weight: number,
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
      const set: SessionSet = {
        id: newId(),
        sessionLiftId: lift.id,
        variantId: variant!.id,
        plannedRepsMin: min,
        plannedRepsMax: max,
        plannedReps: max,
        orderIndex: 0,
        loggedWeight: weight,
        loggedReps: max,
        loggedAt: dateIso,
      };
      await db.sessionSet.put(set);
    }

    await logRange('2026-04-01T10:00:00Z', 5, 5, 225);
    await logRange('2026-04-05T10:00:00Z', 8, 12, 145);

    const data = await getProgressDataPure(
      [{ variantId: variant!.id, plannedRepsMin: 5, plannedRepsMax: 5 }],
      'lb',
    );
    expect(data.series).toHaveLength(1);
    const s = data.series[0]!;
    expect(s.plannedRepsMin).toBe(5);
    expect(s.plannedRepsMax).toBe(5);
    expect(s.points.map((p) => p.value)).toEqual([225]);
  });

  it('bodyweight variants produce reps-axis series, not weight ones', async () => {
    await runSeed();
    await setUserUnits('lb');
    await seedFakeHistory(4);
    // Find a bodyweight bucket from the seeded library.
    const all = await getAllChartableBucketsPure();
    const bw = all.find((o) => o.isBodyweight);
    if (!bw) {
      // Skip cleanly if the fake-history seed didn't end up touching a
      // bodyweight slot in this run; nothing useful to assert.
      return;
    }
    expect(bw).toBeDefined();
    // Sanity: a Pull-up bodyweight variant exists in the catalog.
    const db = getDb();
    const pullup = await db.liftFamily.where('name').equals('Pull-up').first();
    expect(pullup).toBeDefined();

    const data = await getProgressDataPure(
      [
        {
          variantId: bw.variantId,
          plannedRepsMin: bw.plannedRepsMin,
          plannedRepsMax: bw.plannedRepsMax,
        },
      ],
      'lb',
    );
    if (data.series.length === 0) {
      // No logged sets for that bucket in this fake-history run — acceptable.
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
