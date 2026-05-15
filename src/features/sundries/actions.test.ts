import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import { runSeed } from '@/data/seed';
import { startSession } from '@/features/session/actions';
import { getDefaultSlotForToday } from '@/features/session/queries';
import { setCardio, setLiftNote, toggleStretch } from '@/features/sundries/actions';
import { MemoryDestination, setDestinationFactory } from '@/features/export/destination';

describe('sundries actions', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
    setDestinationFactory(() => Promise.resolve(new MemoryDestination()));
  });
  afterEach(async () => {
    setDestinationFactory(null);
    await getDb().delete();
  });

  async function startTodaysSession(): Promise<string> {
    await runSeed();
    const db = getDb();
    const slot = await getDefaultSlotForToday();
    const location = (await db.location.toArray())[0]!;
    const { sessionId } = await startSession({
      scheduleSlotId: slot!.id,
      locationId: location.id,
    });
    return sessionId;
  }

  it('toggleStretch creates one row per session, then updates in place', async () => {
    const sessionId = await startTodaysSession();
    const db = getDb();

    await toggleStretch(sessionId, true);
    const after1 = await db.stretchEntry.where('sessionId').equals(sessionId).toArray();
    expect(after1).toHaveLength(1);
    expect(after1[0]!.done).toBe(true);
    const firstLoggedAt = after1[0]!.loggedAt;
    expect(firstLoggedAt).toBeDefined();

    // Toggle back — should reuse the row, not create a second.
    await toggleStretch(sessionId, false);
    const after2 = await db.stretchEntry.where('sessionId').equals(sessionId).toArray();
    expect(after2).toHaveLength(1);
    expect(after2[0]!.done).toBe(false);
    expect(after2[0]!.id).toBe(after1[0]!.id);
  });

  it('setCardio stores modality + duration; idempotent per session', async () => {
    const sessionId = await startTodaysSession();
    const db = getDb();

    await setCardio({
      sessionId,
      modality: 'rowing-erg',
      durationMin: 12,
      skipped: false,
    });
    const after1 = await db.cardioEntry.where('sessionId').equals(sessionId).toArray();
    expect(after1).toHaveLength(1);
    expect(after1[0]!.modality).toBe('rowing-erg');
    expect(after1[0]!.durationMin).toBe(12);
    expect(after1[0]!.skipped).toBe(false);

    // Update modality + skipped: same row, no duplicate.
    await setCardio({
      sessionId,
      modality: 'exercise-bike',
      skipped: true,
    });
    const after2 = await db.cardioEntry.where('sessionId').equals(sessionId).toArray();
    expect(after2).toHaveLength(1);
    expect(after2[0]!.id).toBe(after1[0]!.id);
    expect(after2[0]!.modality).toBe('exercise-bike');
    expect(after2[0]!.skipped).toBe(true);
    // omitted durationMin should be absent from the row.
    expect(after2[0]!.durationMin).toBeUndefined();
  });

  it('setLiftNote sets the note; passing empty string clears it', async () => {
    const sessionId = await startTodaysSession();
    const db = getDb();
    const lift = (await db.sessionLift.where('sessionId').equals(sessionId).toArray())[0]!;

    await setLiftNote(lift.id, 'left knee a little tight today');
    const after1 = await db.sessionLift.get(lift.id);
    expect(after1?.note).toBe('left knee a little tight today');

    await setLiftNote(lift.id, '   ');
    const after2 = await db.sessionLift.get(lift.id);
    expect(after2?.note).toBeUndefined();
  });
});
