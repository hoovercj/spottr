import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import { runSeed } from '@/data/seed';
import { MemoryDestination, setDestinationFactory } from '@/features/export/destination';
import { logSet, startSession } from '@/features/session/actions';
import {
  addSessionLift,
  changeSessionLiftVariant,
  recordAdHocSuperset,
  removeSessionLift,
  replaceSessionLift,
  validRemovalTiersForScope,
} from '@/features/session/amendments';
import { getDefaultSlotForToday } from '@/features/session/queries';

async function fixture() {
  await runSeed();
  const db = getDb();
  const slot = await getDefaultSlotForToday();
  const location = (await db.location.toArray())[0]!;
  const { sessionId } = await startSession({
    scheduleSlotId: slot!.id,
    locationId: location.id,
  });
  const lifts = await db.sessionLift.where('sessionId').equals(sessionId).toArray();
  const sets = await db.sessionSet.toArray();
  return { db, sessionId, lifts, sets, location, slot: slot! };
}

describe('amendments', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
    setDestinationFactory(() => Promise.resolve(new MemoryDestination()));
  });
  afterEach(async () => {
    setDestinationFactory(null);
    await getDb().delete();
  });

  it('changeSessionLiftVariant updates active variantId on the sessionLift and unlogged sets', async () => {
    const { db, lifts } = await fixture();
    // Pick the first session lift whose family has at least two canonical
    // variants — single-variant families (e.g., Face Pull = cable only)
    // have nothing to switch to and trip this test by row-order accident.
    let liftToChange: (typeof lifts)[number] | null = null;
    let newVariantId: string | null = null;
    for (const candidate of lifts) {
      const others = (
        await db.variant.where('liftFamilyId').equals(candidate.liftFamilyId).toArray()
      ).filter((v) => !v.isAlias && v.id !== candidate.variantId);
      if (others.length > 0) {
        liftToChange = candidate;
        newVariantId = others[0]!.id;
        break;
      }
    }
    if (!liftToChange || !newVariantId) throw new Error('no multi-variant lift in seed');

    await changeSessionLiftVariant({
      sessionLiftId: liftToChange.id,
      newVariantId,
      reattributeLoggedSets: false,
    });

    const updatedLift = await db.sessionLift.get(liftToChange.id);
    expect(updatedLift?.variantId).toBe(newVariantId);
    const updatedSets = await db.sessionSet
      .where('sessionLiftId')
      .equals(liftToChange.id)
      .toArray();
    expect(updatedSets.every((s) => s.variantId === newVariantId)).toBe(true);
  });

  it('reattributeLoggedSets=false keeps already-logged set variant attribution', async () => {
    const { db, lifts } = await fixture();
    // Pick a lift whose family has at least two canonical variants.
    type Lift = (typeof lifts)[number];
    let lift: Lift | null = null;
    let newVariantId: string | null = null;
    for (const candidate of lifts) {
      const fam = (
        await db.variant.where('liftFamilyId').equals(candidate.liftFamilyId).toArray()
      ).filter((v) => !v.isAlias && v.id !== candidate.variantId);
      if (fam.length > 0) {
        lift = candidate;
        newVariantId = fam[0]!.id;
        break;
      }
    }
    if (!lift || !newVariantId) throw new Error('no multi-variant lift found in seed');

    const sets = await db.sessionSet.where('sessionLiftId').equals(lift.id).toArray();
    await logSet({ sessionSetId: sets[0]!.id, loggedWeight: 100, loggedReps: 5 });

    await changeSessionLiftVariant({
      sessionLiftId: lift.id,
      newVariantId,
      reattributeLoggedSets: false,
    });

    const refreshed = await db.sessionSet.where('sessionLiftId').equals(lift.id).toArray();
    const previouslyLogged = refreshed.find((s) => s.id === sets[0]!.id)!;
    const unloggedRow = refreshed.find((s) => s.id !== sets[0]!.id)!;
    expect(previouslyLogged.variantId).toBe(lift.variantId);
    expect(unloggedRow.variantId).toBe(newVariantId);
  });

  it('addSessionLift session-scope adds a lift to this session only; slot plan untouched', async () => {
    const { db, sessionId, slot } = await fixture();
    const newFamily = (await db.liftFamily.toArray()).find((f) => f.name === 'Face Pull')!;
    const newVariant = (await db.variant.where('liftFamilyId').equals(newFamily.id).toArray())[0]!;
    const plansBefore = await db.slotPlan.where('scheduleSlotId').equals(slot.id).count();

    const { sessionLiftId } = await addSessionLift({
      sessionId,
      liftFamilyId: newFamily.id,
      variantId: newVariant.id,
      scope: 'session',
    });

    const added = await db.sessionLift.get(sessionLiftId);
    expect(added?.scope).toBe('session-only');
    const plansAfter = await db.slotPlan.where('scheduleSlotId').equals(slot.id).count();
    expect(plansAfter).toBe(plansBefore);
  });

  it('addSessionLift slot-scope writes a SlotPlan row on the current slot', async () => {
    const { db, sessionId, slot } = await fixture();
    const newFamily = (await db.liftFamily.toArray()).find((f) => f.name === 'Face Pull')!;
    const newVariant = (await db.variant.where('liftFamilyId').equals(newFamily.id).toArray())[0]!;
    const plansBefore = await db.slotPlan.where('scheduleSlotId').equals(slot.id).count();

    await addSessionLift({
      sessionId,
      liftFamilyId: newFamily.id,
      variantId: newVariant.id,
      scope: 'slot',
    });

    const plansAfter = await db.slotPlan.where('scheduleSlotId').equals(slot.id).count();
    expect(plansAfter).toBe(plansBefore + 1);
  });

  it('addSessionLift splitDayType-scope writes a SlotPlan on every slot of that type', async () => {
    const { db, sessionId, slot } = await fixture();
    // Squat is seeded on Legs only; adding to a Pull split-day-type adds
    // exactly one plan per sibling Pull slot.
    const newFamily = (await db.liftFamily.toArray()).find((f) => f.name === 'Squat')!;
    const newVariant = (await db.variant.where('liftFamilyId').equals(newFamily.id).toArray())[0]!;
    const sibling = await db.scheduleSlot
      .where('splitDayTypeId')
      .equals(slot.splitDayTypeId)
      .toArray();
    expect(sibling.length).toBeGreaterThan(0);

    await addSessionLift({
      sessionId,
      liftFamilyId: newFamily.id,
      variantId: newVariant.id,
      scope: 'splitDayType',
    });

    for (const sib of sibling) {
      const plans = await db.slotPlan
        .where('scheduleSlotId')
        .equals(sib.id)
        .and((p) => p.liftFamilyId === newFamily.id)
        .toArray();
      expect(plans.length).toBe(1);
    }
  });

  it('replaceSessionLift changes the family + variant on the active session lift', async () => {
    const { db, lifts } = await fixture();
    const target = lifts[0]!;
    const otherFamily = (await db.liftFamily.toArray()).find((f) => f.id !== target.liftFamilyId)!;
    const newVariant = (
      await db.variant.where('liftFamilyId').equals(otherFamily.id).toArray()
    )[0]!;

    await replaceSessionLift({
      sessionLiftId: target.id,
      newLiftFamilyId: otherFamily.id,
      newVariantId: newVariant.id,
      scope: 'session',
    });

    const updated = await db.sessionLift.get(target.id);
    expect(updated?.liftFamilyId).toBe(otherFamily.id);
    expect(updated?.variantId).toBe(newVariant.id);
    expect(updated?.scope).toBe('session-only');
  });

  it('removeSessionLift session-scope deletes the lift + sets without touching slot plans', async () => {
    const { db, sessionId, lifts, slot } = await fixture();
    const target = lifts[0]!;
    const plansBefore = await db.slotPlan.where('scheduleSlotId').equals(slot.id).count();

    await removeSessionLift({ sessionLiftId: target.id, scope: 'session' });

    // Soft-delete leaves a tombstone behind so the delete propagates
    // across devices via the Drive merge — check deletedAt is set.
    const tombstoned = await db.sessionLift.get(target.id);
    expect(tombstoned?.deletedAt).toBeTruthy();
    const liveSets = (
      await db.sessionSet.where('sessionLiftId').equals(target.id).toArray()
    ).filter((s) => !s.deletedAt);
    expect(liveSets).toHaveLength(0);
    const plansAfter = await db.slotPlan.where('scheduleSlotId').equals(slot.id).count();
    expect(plansAfter).toBe(plansBefore);
    void sessionId;
  });

  it('removeSessionLift slot-scope also deletes the SlotPlan on this slot', async () => {
    const { db, lifts, slot } = await fixture();
    // Pick a lift whose family is uniquely planned on this slot — the
    // updated PPL plans some families (e.g. Row) twice in one day, and the
    // slot-scope removal targets all plans for the family, which breaks
    // the "exactly one plan deleted" assertion.
    let target: (typeof lifts)[number] | null = null;
    for (const candidate of lifts) {
      const planCount = await db.slotPlan
        .where('scheduleSlotId')
        .equals(slot.id)
        .and((p) => p.liftFamilyId === candidate.liftFamilyId)
        .count();
      if (planCount === 1) {
        target = candidate;
        break;
      }
    }
    if (!target) throw new Error('No singly-planned family on this slot');
    const plansBefore = await db.slotPlan
      .where('scheduleSlotId')
      .equals(slot.id)
      .and((p) => p.liftFamilyId === target.liftFamilyId)
      .count();
    expect(plansBefore).toBe(1);

    await removeSessionLift({ sessionLiftId: target.id, scope: 'slot' });

    const plansAfter = (
      await db.slotPlan
        .where('scheduleSlotId')
        .equals(slot.id)
        .and((p) => p.liftFamilyId === target.liftFamilyId)
        .toArray()
    ).filter((p) => !p.deletedAt);
    expect(plansAfter).toHaveLength(0);
  });

  it('validRemovalTiersForScope returns expected tier sets per lift scope', () => {
    expect(validRemovalTiersForScope('session-only')).toEqual([]);
    expect(validRemovalTiersForScope('permanent-slot')).toEqual(['session', 'slot']);
    expect(validRemovalTiersForScope('planned')).toEqual(['session', 'slot', 'splitDayType']);
    expect(validRemovalTiersForScope('permanent-type')).toEqual([
      'session',
      'slot',
      'splitDayType',
    ]);
  });

  it('recordAdHocSuperset persists a sorted (locationId, A, B) row exactly once', async () => {
    const { db, location } = await fixture();
    const a = 'fam-A';
    const b = 'fam-B';
    await recordAdHocSuperset({ locationId: location.id, liftFamilyIdA: a, liftFamilyIdB: b });
    await recordAdHocSuperset({ locationId: location.id, liftFamilyIdA: b, liftFamilyIdB: a });
    const rows = await db.locationSupersetMemory.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.liftFamilyIdA <= rows[0]!.liftFamilyIdB).toBe(true);
  });
});
