/**
 * Mid-workout planning amendments (FR14 / FR27 / FR28 / FR30 / FR31 / FR33).
 *
 * Each operation respects three-tier scope (`session` / `slot` / `splitDayType`).
 * - `session`: only the active session record changes; programming untouched.
 * - `slot`: amend SlotPlan/SupersetGroup rows on the active session's slot.
 * - `splitDayType`: amend the corresponding rows on every slot of that type.
 */

import { getDb } from '@/data/db';
import { newId, nowIso } from '@/data/ids';
import { withWorkoutWriteLock } from '@/data/locks';
import type {
  PlannedSet,
  ScheduleSlot,
  SessionLift,
  SessionSet,
  SlotPlan,
  Variant,
} from '@/data/types';
import type { Scope } from '@/components/ScopeModal';

/* ----- FR27 / FR28 — variant change + retroactive re-attribution ----- */

export async function changeSessionLiftVariant(input: {
  sessionLiftId: string;
  newVariantId: string;
  /** When true, all already-logged sets on this lift in this session are moved (FR28). */
  reattributeLoggedSets: boolean;
}): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    await db.transaction('rw', [db.sessionLift, db.sessionSet], async () => {
      await db.sessionLift.update(input.sessionLiftId, { variantId: input.newVariantId });
      const sets = await db.sessionSet.where('sessionLiftId').equals(input.sessionLiftId).toArray();
      for (const s of sets) {
        const shouldUpdate = s.loggedAt ? input.reattributeLoggedSets : true;
        if (shouldUpdate) {
          await db.sessionSet.update(s.id, { variantId: input.newVariantId });
        }
      }
    });
  });
}

/* ----- FR30 — replace lift (cross-family swap) ----- */

export interface ReplaceLiftInput {
  sessionLiftId: string;
  newLiftFamilyId: string;
  newVariantId: string;
  scope: Scope;
  /** Default planned-set spec for the replacement lift if scope > session. */
  plannedSets?: PlannedSet[];
}

export async function replaceSessionLift(input: ReplaceLiftInput): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    const lift = await db.sessionLift.get(input.sessionLiftId);
    if (!lift) throw new Error('Unknown sessionLift');
    const session = await db.session.get(lift.sessionId);
    if (!session) throw new Error('Unknown session');

    await db.transaction(
      'rw',
      [db.sessionLift, db.sessionSet, db.slotPlan, db.scheduleSlot, db.splitDayType],
      async () => {
        const scopeMap: Record<Scope, SessionLift['scope']> = {
          session: 'session-only',
          slot: 'permanent-slot',
          splitDayType: 'permanent-type',
        };
        await db.sessionLift.update(input.sessionLiftId, {
          liftFamilyId: input.newLiftFamilyId,
          variantId: input.newVariantId,
          scope: scopeMap[input.scope],
        });
        const sets = await db.sessionSet
          .where('sessionLiftId')
          .equals(input.sessionLiftId)
          .toArray();
        for (const s of sets) {
          await db.sessionSet.update(s.id, { variantId: input.newVariantId });
        }
        if ((input.scope === 'slot' || input.scope === 'splitDayType') && session.scheduleSlotId) {
          await applySlotPlanAmendmentReplace(
            session.scheduleSlotId,
            lift.liftFamilyId,
            input.newLiftFamilyId,
            input.newVariantId,
            input.plannedSets,
            input.scope === 'splitDayType',
          );
        }
      },
    );
  });
}

/* ----- FR31 — add lift (with scope) ----- */

export interface AddLiftInput {
  sessionId: string;
  liftFamilyId: string;
  variantId: string;
  scope: Scope;
  /** Defaults to a single 3×8 placeholder when not supplied. */
  plannedSets?: PlannedSet[];
}

export async function addSessionLift(input: AddLiftInput): Promise<{ sessionLiftId: string }> {
  const db = getDb();
  return withWorkoutWriteLock(async () => {
    const session = await db.session.get(input.sessionId);
    if (!session) throw new Error('Unknown session');

    return db.transaction(
      'rw',
      [db.sessionLift, db.sessionSet, db.slotPlan, db.scheduleSlot, db.splitDayType],
      async () => {
        const existing = await db.sessionLift.where('sessionId').equals(input.sessionId).toArray();
        const nextOrder = existing.length;
        const scopeMap: Record<Scope, SessionLift['scope']> = {
          session: 'session-only',
          slot: 'permanent-slot',
          splitDayType: 'permanent-type',
        };
        const sessionLift: SessionLift = {
          id: newId(),
          sessionId: input.sessionId,
          liftFamilyId: input.liftFamilyId,
          variantId: input.variantId,
          orderIndex: nextOrder,
          scope: scopeMap[input.scope],
        };
        const plannedSets = input.plannedSets ?? defaultPlannedSets();
        const sessionSets: SessionSet[] = plannedSets.map<SessionSet>((ps) => ({
          id: newId(),
          sessionLiftId: sessionLift.id,
          variantId: input.variantId,
          plannedRepsMin: ps.plannedRepsMin,
          plannedRepsMax: ps.plannedRepsMax,
          plannedReps: ps.plannedRepsMax,
          orderIndex: ps.orderIndex,
          ...(ps.plannedWeight != null ? { plannedWeight: ps.plannedWeight } : {}),
        }));
        await db.sessionLift.put(sessionLift);
        await db.sessionSet.bulkPut(sessionSets);

        if ((input.scope === 'slot' || input.scope === 'splitDayType') && session.scheduleSlotId) {
          await applySlotPlanAmendmentAdd(
            session.scheduleSlotId,
            input.liftFamilyId,
            input.variantId,
            plannedSets,
            input.scope === 'splitDayType',
          );
        }
        return { sessionLiftId: sessionLift.id };
      },
    );
  });
}

/* ----- Remove lift from session (delete-lift counterpart to add/replace) ----- */

export interface RemoveLiftInput {
  sessionLiftId: string;
  scope: Scope;
}

export async function removeSessionLift(input: RemoveLiftInput): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    const lift = await db.sessionLift.get(input.sessionLiftId);
    if (!lift) return;
    const session = await db.session.get(lift.sessionId);
    if (!session) return;

    await db.transaction(
      'rw',
      [db.sessionLift, db.sessionSet, db.slotPlan, db.scheduleSlot, db.splitDayType],
      async () => {
        // Delete the session-side records always.
        const sets = await db.sessionSet
          .where('sessionLiftId')
          .equals(input.sessionLiftId)
          .toArray();
        await db.sessionSet.bulkDelete(sets.map((s) => s.id));
        await db.sessionLift.delete(input.sessionLiftId);

        // Apply programming change for slot/splitDayType scopes.
        if (input.scope === 'session') return;
        if (!session.scheduleSlotId) return; // ad-hoc workout has no slot to amend

        const slotsToMutate =
          input.scope === 'splitDayType'
            ? await siblingSlotIds(session.scheduleSlotId)
            : [session.scheduleSlotId];

        for (const sid of slotsToMutate) {
          const plan = await db.slotPlan
            .where('scheduleSlotId')
            .equals(sid)
            .and((p) => p.liftFamilyId === lift.liftFamilyId)
            .first();
          if (plan) await db.slotPlan.delete(plan.id);
        }
      },
    );
  });
}

/** Tier filter helper for removal — narrower-scope lifts shouldn't offer broader tiers. */
export function validRemovalTiersForScope(scope: SessionLift['scope']): Scope[] {
  switch (scope) {
    case 'session-only':
      // Nothing to ask — there's no programming to amend.
      return [];
    case 'permanent-slot':
      return ['session', 'slot'];
    case 'planned':
    case 'permanent-type':
      return ['session', 'slot', 'splitDayType'];
  }
}

/* ----- FR33 — ad-hoc superset memory ----- */

export async function recordAdHocSuperset(input: {
  locationId: string;
  liftFamilyIdA: string;
  liftFamilyIdB: string;
}): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    const existing = await db.locationSupersetMemory
      .where('[locationId+liftFamilyIdA+liftFamilyIdB]')
      .equals([input.locationId, ...orderedPair(input.liftFamilyIdA, input.liftFamilyIdB)])
      .first();
    if (existing) return;
    const [a, b] = orderedPair(input.liftFamilyIdA, input.liftFamilyIdB);
    await db.locationSupersetMemory.put({
      id: newId(),
      locationId: input.locationId,
      liftFamilyIdA: a,
      liftFamilyIdB: b,
      observedAt: nowIso(),
    });
  });
}

/* ----- helpers ----- */

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function defaultPlannedSets(): PlannedSet[] {
  return [0, 1, 2].map((i) => ({
    orderIndex: i,
    plannedRepsMin: 8,
    plannedRepsMax: 8,
  }));
}

async function applySlotPlanAmendmentAdd(
  scheduleSlotId: string,
  liftFamilyId: string,
  variantId: string,
  plannedSets: PlannedSet[],
  applyToSplitDayType: boolean,
): Promise<void> {
  const db = getDb();
  const slotsToMutate = applyToSplitDayType
    ? await siblingSlotIds(scheduleSlotId)
    : [scheduleSlotId];
  for (const sid of slotsToMutate) {
    const existing = await db.slotPlan.where('scheduleSlotId').equals(sid).toArray();
    const nextOrder = existing.length;
    const sp: SlotPlan = {
      id: newId(),
      scheduleSlotId: sid,
      orderIndex: nextOrder,
      liftFamilyId,
      defaultVariantId: variantId,
      plannedSets,
    };
    await db.slotPlan.put(sp);
  }
}

async function applySlotPlanAmendmentReplace(
  scheduleSlotId: string,
  oldLiftFamilyId: string,
  newLiftFamilyId: string,
  newVariantId: string,
  plannedSets: PlannedSet[] | undefined,
  applyToSplitDayType: boolean,
): Promise<void> {
  const db = getDb();
  const slotsToMutate = applyToSplitDayType
    ? await siblingSlotIds(scheduleSlotId)
    : [scheduleSlotId];
  for (const sid of slotsToMutate) {
    const plan = await db.slotPlan
      .where('scheduleSlotId')
      .equals(sid)
      .and((p) => p.liftFamilyId === oldLiftFamilyId)
      .first();
    if (!plan) continue;
    await db.slotPlan.update(plan.id, {
      liftFamilyId: newLiftFamilyId,
      defaultVariantId: newVariantId,
      ...(plannedSets ? { plannedSets } : {}),
    });
  }
}

async function siblingSlotIds(scheduleSlotId: string): Promise<string[]> {
  const db = getDb();
  const slot: ScheduleSlot | undefined = await db.scheduleSlot.get(scheduleSlotId);
  if (!slot) return [scheduleSlotId];
  const siblings = await db.scheduleSlot
    .where('splitDayTypeId')
    .equals(slot.splitDayTypeId)
    .toArray();
  return siblings.map((s) => s.id);
}

/* ----- read helpers used by UI ----- */

export interface VariantPickerOption {
  variant: Variant;
  isCanonical: boolean;
}

export async function getVariantsForFamily(liftFamilyId: string): Promise<VariantPickerOption[]> {
  const db = getDb();
  const all = await db.variant.where('liftFamilyId').equals(liftFamilyId).toArray();
  return all.filter((v) => !v.isAlias).map((v) => ({ variant: v, isCanonical: true }));
}
