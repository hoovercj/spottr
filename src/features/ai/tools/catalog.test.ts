import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import { runSeed } from '@/data/seed';
import { seedFakeHistory } from '@/data/fakeHistory';
import { newId } from '@/data/ids';
import { setUserUnits } from '@/features/settings/actions';
import { TOOLS, getToolByName } from '@/features/ai/tools/catalog';
import type { Session, SessionLift, SessionSet } from '@/data/types';

const ctx = { now: new Date('2026-05-15T12:00:00Z').toISOString() };

describe('AI tool catalog (read-only)', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
  });
  afterEach(async () => {
    await getDb().delete();
  });

  it('every tool is read-only and risk=read', () => {
    for (const t of TOOLS) {
      expect(t.mutates).toBe(false);
      expect(t.risk).toBe('read');
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(t.jsonSchema.type).toBe('object');
    }
  });

  it('list_chartable_buckets returns buckets after fake history seed', async () => {
    await runSeed();
    await setUserUnits('lb');
    await seedFakeHistory(4);
    const tool = getToolByName('list_chartable_buckets');
    expect(tool).toBeDefined();
    const out = (await tool!.run({}, ctx)) as { buckets: unknown[] };
    expect(Array.isArray(out.buckets)).toBe(true);
    expect(out.buckets.length).toBeGreaterThan(0);
  });

  it('list_recent_sessions returns at least one row after fake history seed', async () => {
    await runSeed();
    await setUserUnits('lb');
    await seedFakeHistory(4);
    const tool = getToolByName('list_recent_sessions');
    const out = (await tool!.run({ limit: 5 }, ctx)) as {
      sessions: Array<{ sessionId: string; date: string }>;
    };
    expect(out.sessions.length).toBeGreaterThan(0);
    // Sorted newest-first.
    for (let i = 1; i < out.sessions.length; i++) {
      expect(out.sessions[i - 1]!.date >= out.sessions[i]!.date).toBe(true);
    }
  });

  it('get_session_detail returns error shape for unknown id and full detail for a known one', async () => {
    await runSeed();
    await setUserUnits('lb');
    await seedFakeHistory(4);
    const list = getToolByName('list_recent_sessions');
    const listed = (await list!.run({ limit: 1 }, ctx)) as {
      sessions: Array<{ sessionId: string }>;
    };
    const sessionId = listed.sessions[0]!.sessionId;

    const detail = getToolByName('get_session_detail');
    const ok = (await detail!.run({ sessionId }, ctx)) as { sessionId?: string; error?: string };
    expect(ok.sessionId).toBe(sessionId);
    expect(ok.error).toBeUndefined();

    const bad = (await detail!.run({ sessionId: 'nope' }, ctx)) as { error?: string };
    expect(bad.error).toContain('Unknown');
  });

  it('get_active_routine returns the seeded program', async () => {
    await runSeed();
    const tool = getToolByName('get_active_routine');
    const out = (await tool!.run({}, ctx)) as {
      programName: string | null;
      splitDays: Array<{ dayName: string; lifts: unknown[] }>;
    };
    expect(out.programName).toBeTruthy();
    expect(out.splitDays.length).toBeGreaterThan(0);
  });

  describe('get_prs', () => {
    it('returns the heaviest logged set per (variant, rep range)', async () => {
      await runSeed();
      await setUserUnits('lb');
      const db = getDb();
      const variant = (await db.variant.toArray()).find((v) => v.equipmentKind === 'barbell')!;
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
          liftFamilyId: variant.liftFamilyId,
          variantId: variant.id,
          orderIndex: 0,
          scope: 'session-only',
        };
        await db.sessionLift.put(lift);
        const sets: SessionSet[] = weights.map((w, idx) => ({
          id: newId(),
          sessionLiftId: lift.id,
          variantId: variant.id,
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

      // 5×5: heaviest ever 235 on 04-08
      await logRange('2026-04-01T10:00:00Z', 5, 5, [225, 230]);
      await logRange('2026-04-08T10:00:00Z', 5, 5, [230, 235]);
      // 8-12: heaviest 160 on 04-15
      await logRange('2026-04-10T10:00:00Z', 8, 12, [150, 155]);
      await logRange('2026-04-15T10:00:00Z', 8, 12, [155, 160]);

      const tool = getToolByName('get_prs')!;
      const out = (await tool.run({ variantId: variant.id }, ctx)) as {
        prs: Array<{
          plannedRepsMin: number;
          plannedRepsMax: number;
          bestSet: { date: string; loggedWeight: number; loggedReps: number };
        }>;
      };
      expect(out.prs).toHaveLength(2);
      const heavy = out.prs.find((p) => p.plannedRepsMin === 5)!;
      const hyper = out.prs.find((p) => p.plannedRepsMin === 8)!;
      expect(heavy.bestSet.loggedWeight).toBe(235);
      expect(heavy.bestSet.date).toBe('2026-04-08');
      expect(heavy.bestSet.loggedReps).toBe(5);
      expect(hyper.bestSet.loggedWeight).toBe(160);
      expect(hyper.bestSet.date).toBe('2026-04-15');
    });

    it('returns an empty array when filtering to a variant with no logged data', async () => {
      await runSeed();
      const variant = (await getDb().variant.toArray())[0]!;
      const tool = getToolByName('get_prs')!;
      const out = (await tool.run({ variantId: variant.id }, ctx)) as { prs: unknown[] };
      expect(out.prs).toEqual([]);
    });
  });

  describe('get_weekly_volume', () => {
    it('aggregates tonnage per ISO week and per family', async () => {
      await runSeed();
      await setUserUnits('lb');
      const db = getDb();
      const variant = (await db.variant.toArray()).find((v) => v.equipmentKind === 'barbell')!;
      const family = await db.liftFamily.get(variant.liftFamilyId);
      const location = (await db.location.toArray())[0]!;

      async function logSet(dateIso: string, weight: number, reps: number): Promise<void> {
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
          liftFamilyId: variant.liftFamilyId,
          variantId: variant.id,
          orderIndex: 0,
          scope: 'session-only',
        };
        await db.sessionLift.put(lift);
        const set: SessionSet = {
          id: newId(),
          sessionLiftId: lift.id,
          variantId: variant.id,
          plannedRepsMin: reps,
          plannedRepsMax: reps,
          plannedReps: reps,
          orderIndex: 0,
          loggedWeight: weight,
          loggedReps: reps,
          loggedAt: dateIso,
        };
        await db.sessionSet.put(set);
      }

      // Two sets in the week of 2026-05-11 (Mon-Sun: 05-11 through 05-17)
      await logSet('2026-05-12T10:00:00Z', 200, 5); // tonnage 1000
      await logSet('2026-05-14T10:00:00Z', 220, 3); // tonnage 660
      // One set the prior week (05-04 to 05-10)
      await logSet('2026-05-05T10:00:00Z', 180, 5); // tonnage 900

      const tool = getToolByName('get_weekly_volume')!;
      const out = (await tool.run({ weeks: 4 }, ctx)) as {
        units: string;
        weeks: Array<{
          weekStart: string;
          totalSets: number;
          totalReps: number;
          totalTonnage: number;
          byFamily: Record<string, { sets: number; reps: number; tonnage: number }>;
        }>;
      };

      const weekOfTwelfth = out.weeks.find((w) => w.weekStart === '2026-05-11');
      const weekOfFifth = out.weeks.find((w) => w.weekStart === '2026-05-04');
      expect(weekOfTwelfth).toBeDefined();
      expect(weekOfFifth).toBeDefined();
      expect(weekOfTwelfth!.totalSets).toBe(2);
      expect(weekOfTwelfth!.totalReps).toBe(8);
      expect(weekOfTwelfth!.totalTonnage).toBe(1660);
      expect(weekOfFifth!.totalSets).toBe(1);
      expect(weekOfFifth!.totalTonnage).toBe(900);
      // Family breakdown lines up with totals when only one family is logged.
      expect(weekOfTwelfth!.byFamily[family!.name]).toEqual({
        sets: 2,
        reps: 8,
        tonnage: 1660,
      });
    });
  });
});
