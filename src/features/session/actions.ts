/**
 * Mutations against the workout state machine. All writes go through
 * `withWorkoutWriteLock` per NFR19.
 *
 * Session lifecycle:
 *   start  → IDLE → ACTIVE; create Session + SessionLift + SessionSet rows
 *            from the slot plan and current location.
 *   logSet → write loggedWeight/Reps/At on a single SessionSet.
 *   unlogSet → clear those fields.
 *   complete → ACTIVE → COMPLETED; update lastCompletedAt on the slot.
 *
 * Suggested-weight resolution and history-line population happen in
 * `useLiftScreen()` (Sprint 3 UI layer) — actions only persist.
 */

import { getDb } from '@/data/db';
import { todayLocalDateString } from '@/data/calendarDate';
import { newId, nowIso } from '@/data/ids';
import { withWorkoutWriteLock } from '@/data/locks';
import type { PlannedSet, Session, SessionLift, SessionSet, SlotPlan } from '@/data/types';
import { runExport } from '@/features/export/service';

export interface StartSessionInput {
  scheduleSlotId: string;
  locationId: string;
  /**
   * Local-time YYYY-MM-DD this session counts toward in the routine-week
   * view. Defaults to today. Pass a non-today date when starting from a
   * past or future card on the home screen.
   */
  calendarDate?: string;
}

export interface StartSessionOutcome {
  sessionId: string;
}

export interface StartAdHocInput {
  locationId: string;
  /** Defaults to today. */
  calendarDate?: string;
}

/**
 * Start an empty workout with no routine slot binding. The user adds
 * exercises mid-session via the standard add-lift flow. Sessions started
 * this way don't pin to any day card on the routine-week view.
 */
export async function startAdHocSession(input: StartAdHocInput): Promise<StartSessionOutcome> {
  const db = getDb();
  const result = await withWorkoutWriteLock(async () => {
    const now = nowIso();
    const session: Session = {
      id: newId(),
      locationId: input.locationId,
      startedAt: now,
      state: 'ACTIVE',
      calendarDate: input.calendarDate ?? todayLocalDateString(),
    };
    await db.session.put(session);
    return { sessionId: session.id };
  });
  runExport({ trigger: 'workout-start' }).catch(() => undefined);
  return result;
}

export async function startSession(input: StartSessionInput): Promise<StartSessionOutcome> {
  const db = getDb();
  const result = await withWorkoutWriteLock(async () => {
    const slot = await db.scheduleSlot.get(input.scheduleSlotId);
    if (!slot) throw new Error(`Unknown schedule slot: ${input.scheduleSlotId}`);
    const plans: SlotPlan[] = await db.slotPlan
      .where('scheduleSlotId')
      .equals(slot.id)
      .sortBy('orderIndex');
    const supersetGroups = await db.slotPlanSupersetGroup
      .where('scheduleSlotId')
      .equals(slot.id)
      .toArray();
    const supersetGroupBySlotPlanId = new Map<string, string>();
    for (const group of supersetGroups) {
      for (const sid of group.slotPlanIds) supersetGroupBySlotPlanId.set(sid, group.id);
    }

    const now = nowIso();
    const session: Session = {
      id: newId(),
      scheduleSlotId: slot.id,
      locationId: input.locationId,
      startedAt: now,
      state: 'ACTIVE',
      calendarDate: input.calendarDate ?? todayLocalDateString(),
    };

    const sessionLifts: SessionLift[] = [];
    const sessionSets: SessionSet[] = [];
    for (const plan of plans) {
      const variantId = await resolveVariantForPlan(plan, input.locationId);
      const supersetGroupId = supersetGroupBySlotPlanId.get(plan.id);
      const lift: SessionLift = {
        id: newId(),
        sessionId: session.id,
        liftFamilyId: plan.liftFamilyId,
        variantId,
        orderIndex: plan.orderIndex,
        scope: 'planned',
        ...(supersetGroupId ? { supersetGroupId } : {}),
      };
      sessionLifts.push(lift);
      for (const ps of plan.plannedSets) {
        sessionSets.push(makeSessionSet(lift, ps, variantId));
      }
    }

    await db.transaction('rw', [db.session, db.sessionLift, db.sessionSet], async () => {
      await db.session.put(session);
      await db.sessionLift.bulkPut(sessionLifts);
      await db.sessionSet.bulkPut(sessionSets);
    });

    return { sessionId: session.id };
  });

  // Fire-and-forget pre-workout export per FR48. Failure here does not block start.
  runExport({ trigger: 'workout-start' }).catch(() => undefined);

  return result;
}

export async function logSet(input: {
  sessionSetId: string;
  loggedWeight: number;
  loggedReps: number;
}): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    await db.sessionSet.update(input.sessionSetId, {
      loggedWeight: input.loggedWeight,
      loggedReps: input.loggedReps,
      loggedAt: nowIso(),
    });
  });
}

export async function unlogSet(sessionSetId: string): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    const row = await db.sessionSet.get(sessionSetId);
    if (!row) return;
    const next: SessionSet = {
      id: row.id,
      sessionLiftId: row.sessionLiftId,
      variantId: row.variantId,
      plannedRepsMin: row.plannedRepsMin,
      plannedRepsMax: row.plannedRepsMax,
      plannedReps: row.plannedReps,
      orderIndex: row.orderIndex,
      ...(row.plannedWeight != null ? { plannedWeight: row.plannedWeight } : {}),
    };
    await db.sessionSet.put(next);
  });
}

export async function setPlannedRowValues(input: {
  sessionSetId: string;
  plannedWeight?: number;
  plannedReps?: number;
}): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    const patch: Partial<SessionSet> = {};
    if (input.plannedWeight !== undefined) patch.plannedWeight = input.plannedWeight;
    if (input.plannedReps !== undefined) patch.plannedReps = input.plannedReps;
    await db.sessionSet.update(input.sessionSetId, patch);
  });
}

/**
 * Update logged values on an already-logged set without changing `loggedAt`.
 * Used by the post-hoc edit flow (HistorySession) and by the in-workout
 * +/- adjustment buttons so a typo can be corrected without untap → re-log.
 */
export async function editLoggedSet(input: {
  sessionSetId: string;
  loggedWeight?: number;
  loggedReps?: number;
}): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    const patch: Partial<SessionSet> = {};
    if (input.loggedWeight !== undefined) patch.loggedWeight = input.loggedWeight;
    if (input.loggedReps !== undefined) patch.loggedReps = input.loggedReps;
    await db.sessionSet.update(input.sessionSetId, patch);
  });
}

/**
 * Append a fresh set row to a SessionLift. New row inherits the lift's
 * planned rep range from its sibling sets so the matched-history key
 * stays consistent within the lift.
 */
export async function addSessionSet(sessionLiftId: string): Promise<{ sessionSetId: string }> {
  const db = getDb();
  return withWorkoutWriteLock(async () => {
    const lift = await db.sessionLift.get(sessionLiftId);
    if (!lift) throw new Error(`Unknown sessionLift: ${sessionLiftId}`);
    const sets = await db.sessionSet
      .where('sessionLiftId')
      .equals(sessionLiftId)
      .sortBy('orderIndex');
    const template = sets[sets.length - 1] ?? sets[0];
    const next: SessionSet = {
      id: newId(),
      sessionLiftId,
      variantId: lift.variantId,
      plannedRepsMin: template?.plannedRepsMin ?? 8,
      plannedRepsMax: template?.plannedRepsMax ?? 8,
      plannedReps: template?.plannedReps ?? template?.plannedRepsMax ?? 8,
      orderIndex: (template?.orderIndex ?? -1) + 1,
      ...(template?.plannedWeight != null ? { plannedWeight: template.plannedWeight } : {}),
    };
    await db.sessionSet.put(next);
    return { sessionSetId: next.id };
  });
}

export async function deleteSessionSet(sessionSetId: string): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    await db.live.sessionSet.softDelete(sessionSetId);
  });
}

/**
 * Throws away an in-progress (or completed) Session entirely. Cascades to
 * every child row (sessionLift, sessionSet, cardioEntry, stretchEntry) and
 * leaves `scheduleSlot.lastCompletedAt` untouched — the slot was never
 * actually completed from the routine's perspective.
 */
export async function discardSession(sessionId: string): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    const session = await db.session.get(sessionId);
    if (!session) return;
    await db.transaction(
      'rw',
      [db.session, db.sessionLift, db.sessionSet, db.cardioEntry, db.stretchEntry],
      async () => {
        const lifts = await db.sessionLift.where('sessionId').equals(sessionId).toArray();
        const liftIds = lifts.map((l) => l.id);
        if (liftIds.length > 0) {
          await db.live.sessionSet.where('sessionLiftId').anyOf(liftIds).softDeleteAll();
        }
        await db.live.sessionLift.softDeleteMany(liftIds);
        await db.live.cardioEntry.where('sessionId').equals(sessionId).softDeleteAll();
        await db.live.stretchEntry.where('sessionId').equals(sessionId).softDeleteAll();
        await db.live.session.softDelete(sessionId);
      },
    );
  });
}

export async function completeSession(sessionId: string): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    const session = await db.session.get(sessionId);
    if (!session) return;
    const completedAt = nowIso();
    await db.transaction('rw', [db.session, db.scheduleSlot], async () => {
      await db.session.update(sessionId, { state: 'COMPLETED', completedAt });
      // Ad-hoc sessions have no slot to bump.
      if (session.scheduleSlotId) {
        await db.scheduleSlot.update(session.scheduleSlotId, { lastCompletedAt: completedAt });
      }
    });
  });
  // Fire-and-forget post-workout export per FR48.
  runExport({ trigger: 'workout-complete' }).catch(() => undefined);
}

function makeSessionSet(lift: SessionLift, ps: PlannedSet, variantId: string): SessionSet {
  const plannedReps = ps.plannedRepsMax;
  return {
    id: newId(),
    sessionLiftId: lift.id,
    variantId,
    plannedRepsMin: ps.plannedRepsMin,
    plannedRepsMax: ps.plannedRepsMax,
    plannedReps,
    orderIndex: ps.orderIndex,
    ...(ps.plannedWeight != null ? { plannedWeight: ps.plannedWeight } : {}),
  };
}

/**
 * FR11 resolution: most-recent at location → most-recent anywhere →
 * slot-plan default → family's first variant.
 */
async function resolveVariantForPlan(plan: SlotPlan, locationId: string): Promise<string> {
  if (plan.defaultVariantId) {
    return plan.defaultVariantId;
  }
  const db = getDb();
  // Most recent SessionLift at this location for this family.
  const sessionsAtLoc = await db.session.where('state').equals('COMPLETED').toArray();
  const sessionIdsHere = sessionsAtLoc.filter((s) => s.locationId === locationId).map((s) => s.id);
  if (sessionIdsHere.length > 0) {
    const liftsHere = await db.sessionLift
      .where('liftFamilyId')
      .equals(plan.liftFamilyId)
      .filter((l) => sessionIdsHere.includes(l.sessionId))
      .toArray();
    if (liftsHere.length > 0) {
      const latest = liftsHere.reduce((acc, l) =>
        (sessionsAtLoc.find((s) => s.id === l.sessionId)?.startedAt ?? '') >
        (sessionsAtLoc.find((s) => s.id === acc.sessionId)?.startedAt ?? '')
          ? l
          : acc,
      );
      return latest.variantId;
    }
  }
  // Most recent anywhere.
  const anyLift = await db.sessionLift.where('liftFamilyId').equals(plan.liftFamilyId).toArray();
  if (anyLift.length > 0) {
    return anyLift[anyLift.length - 1]!.variantId;
  }
  // Fall back to the first variant of the family.
  const variants = await db.variant.where('liftFamilyId').equals(plan.liftFamilyId).toArray();
  const nonAlias = variants.find((v) => !v.isAlias);
  if (!nonAlias) throw new Error(`No variants for lift family ${plan.liftFamilyId}`);
  return nonAlias.id;
}
