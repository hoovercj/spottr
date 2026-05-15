/**
 * Dev affordance: populates the database with fake completed workouts
 * across the past N weeks so the History, Progress, and home-week views
 * have something realistic to render. Idempotent at the per-(slot,date)
 * level — re-running won't duplicate existing fake sessions.
 *
 * Each generated session sets `calendarDate` to the historical date and
 * `startedAt` near 6 PM on that day. Weights progress upward toward today
 * to give the Progress chart a believable curve, with the occasional
 * stall and missed-rep set thrown in for variety.
 */

import { getDb } from '@/data/db';
import { addDays, parseLocalDate, todayLocalDateString } from '@/data/calendarDate';
import { newId } from '@/data/ids';
import { withWorkoutWriteLock } from '@/data/locks';
import type { Session, SessionLift, SessionSet, SlotPlan } from '@/data/types';
import { sessionCalendarDate } from '@/features/session/queries';

const STARTING_WEIGHTS: Record<string, number> = {
  'Bench Press': 135,
  'Incline Bench Press': 115,
  'Shoulder Press': 90,
  'Lateral Raise': 15,
  'Tricep Pushdown': 40,
  Skullcrusher: 65,
  'Pull-up': 0,
  Row: 95,
  'Lat Pulldown': 100,
  'Bicep Curl': 25,
  'Face Pull': 30,
  Squat: 185,
  'Front Squat': 135,
  'Romanian Deadlift': 135,
  Deadlift: 225,
  'Leg Press': 180,
  'Leg Curl': 70,
  'Leg Extension': 70,
  'Calf Raise': 90,
};

const DEFAULT_START = 80;
const SESSION_PROBABILITY = 0.85;

export interface SeedFakeHistoryResult {
  weeksGenerated: number;
  sessionsCreated: number;
  setsCreated: number;
}

export async function seedFakeHistory(weeks = 8): Promise<SeedFakeHistoryResult> {
  const db = getDb();
  return withWorkoutWriteLock(async () => {
    const program = (await db.program.toArray()).find((p) => p.isActive);
    if (!program?.anchorDate) {
      throw new Error('No active program with anchorDate — run seed first.');
    }
    const slots = await db.scheduleSlot.where('programId').equals(program.id).sortBy('orderIndex');
    if (slots.length === 0) throw new Error('Active program has no slots.');
    const splitDayTypes = await db.splitDayType.bulkGet(slots.map((s) => s.splitDayTypeId));
    const sdtById = new Map(
      splitDayTypes.filter((s): s is NonNullable<typeof s> => Boolean(s)).map((s) => [s.id, s]),
    );
    const homeLocation =
      (await db.location.toArray()).find((l) => l.name === 'Home Gym') ??
      (await db.location.toArray())[0];
    if (!homeLocation) throw new Error('No location to attach sessions to.');

    // Index existing completed sessions by (scheduleSlotId, calendarDate)
    // to keep this idempotent.
    const existing = await db.session.where('state').equals('COMPLETED').toArray();
    const existingKey = new Set(
      existing.map((s) => `${s.scheduleSlotId}:${sessionCalendarDate(s)}`),
    );

    // Pre-cache slot plans + lift family names.
    const plansBySlot = new Map<string, SlotPlan[]>();
    for (const slot of slots) {
      const plans = await db.slotPlan.where('scheduleSlotId').equals(slot.id).sortBy('orderIndex');
      plansBySlot.set(slot.id, plans);
    }
    const allFamilyIds = new Set<string>();
    for (const arr of plansBySlot.values()) for (const p of arr) allFamilyIds.add(p.liftFamilyId);
    const familyNameById = new Map<string, string>();
    for (const fid of allFamilyIds) {
      const f = await db.liftFamily.get(fid);
      if (f) familyNameById.set(fid, f.name);
    }

    const today = todayLocalDateString();
    const anchor = program.anchorDate;
    const rng = mulberry32(0xc0de_5eed);

    const sessionsToInsert: Session[] = [];
    const liftsToInsert: SessionLift[] = [];
    const setsToInsert: SessionSet[] = [];

    // Walk backward `weeks` × slot.length days from today, in chronological
    // order so weights can progress.
    const totalDays = weeks * 7;
    const startDate = addDays(today, -totalDays);
    for (let i = 0; i <= totalDays; i++) {
      const date = addDays(startDate, i);
      if (date > today) break;
      // Resolve which slot this calendar date belongs to via the anchor.
      const diff = Math.floor(
        (parseLocalDate(date).getTime() - parseLocalDate(anchor).getTime()) / (24 * 60 * 60 * 1000),
      );
      const slotIdx = ((diff % slots.length) + slots.length) % slots.length;
      const slot = slots[slotIdx]!;
      const sdt = sdtById.get(slot.splitDayTypeId);
      if (!sdt || sdt.isRest) continue;

      if (rng() > SESSION_PROBABILITY) continue;
      const key = `${slot.id}:${date}`;
      if (existingKey.has(key)) continue;

      const startedAt = `${date}T18:00:00.000Z`;
      const completedAt = `${date}T19:05:00.000Z`;
      const session: Session = {
        id: newId(),
        scheduleSlotId: slot.id,
        locationId: homeLocation.id,
        startedAt,
        completedAt,
        state: 'COMPLETED',
        calendarDate: date,
      };
      sessionsToInsert.push(session);

      const weeksOld = Math.max(0, weeks - Math.floor(i / 7));
      const plans = plansBySlot.get(slot.id) ?? [];
      plans.forEach((plan, lIdx) => {
        const variantId = plan.defaultVariantId ?? '';
        if (!variantId) return;
        const familyName = familyNameById.get(plan.liftFamilyId) ?? '';
        const base = STARTING_WEIGHTS[familyName] ?? DEFAULT_START;
        // Progression: +1 lb increment per week over the period, occasional
        // stall, plus tiny variation.
        const progression = (weeks - weeksOld) * 2.5;
        const jitter = (rng() - 0.5) * 5;
        const weight = roundTo(base + progression + jitter, 5);
        const sessionLift: SessionLift = {
          id: newId(),
          sessionId: session.id,
          liftFamilyId: plan.liftFamilyId,
          variantId,
          orderIndex: lIdx,
          scope: 'planned',
        };
        liftsToInsert.push(sessionLift);
        plan.plannedSets.forEach((ps) => {
          // Most sets hit the top of the range; occasionally a missed last set.
          const targetReps = ps.plannedRepsMax;
          const missed = rng() < 0.12 && ps.orderIndex === plan.plannedSets.length - 1;
          const loggedReps = missed
            ? Math.max(ps.plannedRepsMin - 1, Math.floor(targetReps * 0.7))
            : targetReps;
          const loggedWeight = familyName === 'Pull-up' ? 0 : weight;
          const loggedAt = `${date}T18:${String(10 + ps.orderIndex * 3).padStart(2, '0')}:00.000Z`;
          const set: SessionSet = {
            id: newId(),
            sessionLiftId: sessionLift.id,
            variantId,
            plannedRepsMin: ps.plannedRepsMin,
            plannedRepsMax: ps.plannedRepsMax,
            plannedReps: ps.plannedRepsMax,
            orderIndex: ps.orderIndex,
            ...(ps.plannedWeight != null ? { plannedWeight: ps.plannedWeight } : {}),
            loggedWeight,
            loggedReps,
            loggedAt,
          };
          setsToInsert.push(set);
        });
      });

      // Also bump the slot's lastCompletedAt to the latest fake date.
      slot.lastCompletedAt = completedAt;
    }

    await db.transaction(
      'rw',
      [db.session, db.sessionLift, db.sessionSet, db.scheduleSlot],
      async () => {
        await db.session.bulkPut(sessionsToInsert);
        await db.sessionLift.bulkPut(liftsToInsert);
        await db.sessionSet.bulkPut(setsToInsert);
        for (const slot of slots) {
          if (slot.lastCompletedAt) {
            await db.scheduleSlot.update(slot.id, { lastCompletedAt: slot.lastCompletedAt });
          }
        }
      },
    );

    return {
      weeksGenerated: weeks,
      sessionsCreated: sessionsToInsert.length,
      setsCreated: setsToInsert.length,
    };
  });
}

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

/** Deterministic PRNG so fake-history runs are repeatable across reloads. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
