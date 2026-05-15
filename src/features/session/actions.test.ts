import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import { runSeed } from '@/data/seed';
import {
  addSessionSet,
  completeSession,
  deleteSessionSet,
  discardSession,
  editLoggedSet,
  logSet,
  setPlannedRowValues,
  startSession,
  unlogSet,
} from '@/features/session/actions';
import { todayLocalDateString } from '@/data/calendarDate';
import { getActiveSession, getDefaultSlotForToday } from '@/features/session/queries';
import { MemoryDestination, setDestinationFactory } from '@/features/export/destination';

describe('session actions', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
    // Suppress the fire-and-forget exports inside actions.
    setDestinationFactory(() => Promise.resolve(new MemoryDestination()));
  });

  afterEach(async () => {
    setDestinationFactory(null);
    await getDb().delete();
  });

  it('startSession creates a session + lifts + sets from the slot plan', async () => {
    await runSeed();
    const db = getDb();
    const slot = await getDefaultSlotForToday();
    expect(slot).not.toBeNull();
    const location = (await db.location.toArray())[0]!;

    const { sessionId } = await startSession({
      scheduleSlotId: slot!.id,
      locationId: location.id,
    });

    const session = await db.session.get(sessionId);
    expect(session?.state).toBe('ACTIVE');

    const lifts = await db.sessionLift.where('sessionId').equals(sessionId).toArray();
    expect(lifts.length).toBeGreaterThan(0);

    const sets = await db.sessionSet.toArray();
    expect(sets.every((s) => s.loggedAt === undefined)).toBe(true);
  });

  it('logSet → completeSession → COMPLETED with lastCompletedAt set on the slot', async () => {
    await runSeed();
    const db = getDb();
    const slot = await getDefaultSlotForToday();
    const location = (await db.location.toArray())[0]!;
    const { sessionId } = await startSession({
      scheduleSlotId: slot!.id,
      locationId: location.id,
    });

    const sets = await db.sessionSet
      .where('sessionLiftId')
      .anyOf((await db.sessionLift.where('sessionId').equals(sessionId).toArray()).map((l) => l.id))
      .toArray();
    const first = sets[0]!;
    await logSet({ sessionSetId: first.id, loggedWeight: 225, loggedReps: 5 });
    const after = await db.sessionSet.get(first.id);
    expect(after?.loggedWeight).toBe(225);
    expect(after?.loggedReps).toBe(5);
    expect(after?.loggedAt).toBeDefined();

    await completeSession(sessionId);
    const finalSession = await db.session.get(sessionId);
    expect(finalSession?.state).toBe('COMPLETED');
    expect(finalSession?.completedAt).toBeDefined();
    const slotAfter = await db.scheduleSlot.get(slot!.id);
    expect(slotAfter?.lastCompletedAt).toBeDefined();
  });

  it('unlogSet clears loggedWeight / loggedReps / loggedAt', async () => {
    await runSeed();
    const db = getDb();
    const slot = await getDefaultSlotForToday();
    const location = (await db.location.toArray())[0]!;
    const { sessionId } = await startSession({
      scheduleSlotId: slot!.id,
      locationId: location.id,
    });
    const aLift = (await db.sessionLift.where('sessionId').equals(sessionId).toArray())[0]!;
    const aSet = (await db.sessionSet.where('sessionLiftId').equals(aLift.id).toArray())[0]!;

    await logSet({ sessionSetId: aSet.id, loggedWeight: 100, loggedReps: 8 });
    await unlogSet(aSet.id);
    const restored = await db.sessionSet.get(aSet.id);
    expect(restored?.loggedAt).toBeUndefined();
    expect(restored?.loggedWeight).toBeUndefined();
    expect(restored?.loggedReps).toBeUndefined();
    expect(restored?.plannedReps).toBe(aSet.plannedReps);
  });

  it('setPlannedRowValues updates pre-fill without logging', async () => {
    await runSeed();
    const db = getDb();
    const slot = await getDefaultSlotForToday();
    const location = (await db.location.toArray())[0]!;
    const { sessionId } = await startSession({
      scheduleSlotId: slot!.id,
      locationId: location.id,
    });
    const aLift = (await db.sessionLift.where('sessionId').equals(sessionId).toArray())[0]!;
    const aSet = (await db.sessionSet.where('sessionLiftId').equals(aLift.id).toArray())[0]!;

    await setPlannedRowValues({ sessionSetId: aSet.id, plannedWeight: 185, plannedReps: 6 });
    const after = await db.sessionSet.get(aSet.id);
    expect(after?.plannedWeight).toBe(185);
    expect(after?.plannedReps).toBe(6);
    expect(after?.loggedAt).toBeUndefined();
  });

  it('editLoggedSet updates loggedWeight / loggedReps while preserving loggedAt', async () => {
    await runSeed();
    const db = getDb();
    const slot = await getDefaultSlotForToday();
    const location = (await db.location.toArray())[0]!;
    const { sessionId } = await startSession({
      scheduleSlotId: slot!.id,
      locationId: location.id,
    });
    const aLift = (await db.sessionLift.where('sessionId').equals(sessionId).toArray())[0]!;
    const aSet = (await db.sessionSet.where('sessionLiftId').equals(aLift.id).toArray())[0]!;

    await logSet({ sessionSetId: aSet.id, loggedWeight: 100, loggedReps: 8 });
    const original = await db.sessionSet.get(aSet.id);
    expect(original?.loggedAt).toBeDefined();
    const originalLoggedAt = original!.loggedAt;

    await editLoggedSet({ sessionSetId: aSet.id, loggedReps: 9 });
    const after = await db.sessionSet.get(aSet.id);
    expect(after?.loggedReps).toBe(9);
    expect(after?.loggedWeight).toBe(100);
    expect(after?.loggedAt).toBe(originalLoggedAt);
  });

  it('addSessionSet appends a row inheriting rep range from the lift; deleteSessionSet removes it', async () => {
    await runSeed();
    const db = getDb();
    const slot = await getDefaultSlotForToday();
    const location = (await db.location.toArray())[0]!;
    const { sessionId } = await startSession({
      scheduleSlotId: slot!.id,
      locationId: location.id,
    });
    const aLift = (await db.sessionLift.where('sessionId').equals(sessionId).toArray())[0]!;
    const before = await db.sessionSet.where('sessionLiftId').equals(aLift.id).sortBy('orderIndex');

    const { sessionSetId } = await addSessionSet(aLift.id);
    const after = await db.sessionSet.where('sessionLiftId').equals(aLift.id).sortBy('orderIndex');
    expect(after.length).toBe(before.length + 1);
    const added = after.find((s) => s.id === sessionSetId)!;
    expect(added.plannedRepsMin).toBe(before[0]!.plannedRepsMin);
    expect(added.plannedRepsMax).toBe(before[0]!.plannedRepsMax);
    expect(added.orderIndex).toBe(before[before.length - 1]!.orderIndex + 1);

    await deleteSessionSet(sessionSetId);
    const afterDelete = await db.sessionSet.where('sessionLiftId').equals(aLift.id).count();
    expect(afterDelete).toBe(before.length);
  });

  it('startSession defaults Session.calendarDate to today (YYYY-MM-DD)', async () => {
    await runSeed();
    const db = getDb();
    const slot = await getDefaultSlotForToday();
    const location = (await db.location.toArray())[0]!;

    const { sessionId } = await startSession({
      scheduleSlotId: slot!.id,
      locationId: location.id,
    });

    const session = await db.session.get(sessionId);
    expect(session?.calendarDate).toBe(todayLocalDateString());
  });

  it('startSession respects an explicit calendarDate override', async () => {
    await runSeed();
    const db = getDb();
    const slot = await getDefaultSlotForToday();
    const location = (await db.location.toArray())[0]!;

    const { sessionId } = await startSession({
      scheduleSlotId: slot!.id,
      locationId: location.id,
      calendarDate: '2026-05-04',
    });

    const session = await db.session.get(sessionId);
    expect(session?.calendarDate).toBe('2026-05-04');
  });

  it('discardSession deletes the session + all child rows without touching the slot', async () => {
    await runSeed();
    const db = getDb();
    const slot = await getDefaultSlotForToday();
    const location = (await db.location.toArray())[0]!;
    const { sessionId } = await startSession({
      scheduleSlotId: slot!.id,
      locationId: location.id,
    });
    const aLift = (await db.sessionLift.where('sessionId').equals(sessionId).toArray())[0]!;
    const aSet = (await db.sessionSet.where('sessionLiftId').equals(aLift.id).toArray())[0]!;
    await logSet({ sessionSetId: aSet.id, loggedWeight: 100, loggedReps: 5 });

    await discardSession(sessionId);

    expect(await db.session.get(sessionId)).toBeUndefined();
    expect(await db.sessionLift.where('sessionId').equals(sessionId).count()).toBe(0);
    expect(await db.sessionSet.where('sessionLiftId').equals(aLift.id).count()).toBe(0);
    const slotAfter = await db.scheduleSlot.get(slot!.id);
    // Discard does NOT bump lastCompletedAt — the slot was never completed.
    expect(slotAfter?.lastCompletedAt).toBeUndefined();
  });

  it('getActiveSession returns the in-progress session and null after complete', async () => {
    await runSeed();
    const db = getDb();
    const slot = await getDefaultSlotForToday();
    const location = (await db.location.toArray())[0]!;
    const { sessionId } = await startSession({
      scheduleSlotId: slot!.id,
      locationId: location.id,
    });
    expect((await getActiveSession())?.id).toBe(sessionId);
    await completeSession(sessionId);
    expect(await getActiveSession()).toBeNull();
  });
});
