/**
 * Stretching + cardio actions (FR35 – FR38).
 *
 * Both are workout-scoped binary/log entries. Stretching is a single boolean
 * per session; cardio is one row per modality + duration (or "skipped").
 */

import { getDb } from '@/data/db';
import { newId, nowIso } from '@/data/ids';
import { withWorkoutWriteLock } from '@/data/locks';
import type { CardioEntry, CardioModality, StretchEntry } from '@/data/types';

export async function toggleStretch(sessionId: string, done: boolean): Promise<void> {
  await withWorkoutWriteLock(async () => {
    const db = getDb();
    const existing = await db.stretchEntry.where('sessionId').equals(sessionId).first();
    if (existing) {
      await db.stretchEntry.update(existing.id, { done, loggedAt: nowIso() });
      return;
    }
    const entry: StretchEntry = {
      id: newId(),
      sessionId,
      done,
      loggedAt: nowIso(),
    };
    await db.stretchEntry.put(entry);
  });
}

export async function setCardio(input: {
  sessionId: string;
  modality: CardioModality;
  durationMin?: number;
  skipped: boolean;
}): Promise<void> {
  await withWorkoutWriteLock(async () => {
    const db = getDb();
    const existing = await db.cardioEntry.where('sessionId').equals(input.sessionId).first();
    const next: CardioEntry = {
      id: existing?.id ?? newId(),
      sessionId: input.sessionId,
      modality: input.modality,
      skipped: input.skipped,
      loggedAt: nowIso(),
      ...(input.durationMin != null ? { durationMin: input.durationMin } : {}),
    };
    await db.cardioEntry.put(next);
  });
}

export async function setLiftNote(sessionLiftId: string, note: string): Promise<void> {
  await withWorkoutWriteLock(async () => {
    const db = getDb();
    const existing = await db.sessionLift.get(sessionLiftId);
    if (!existing) return;
    if (note.trim() === '') {
      const cleared = { ...existing };
      delete cleared.note;
      await db.sessionLift.put(cleared);
      return;
    }
    await db.sessionLift.update(sessionLiftId, { note });
  });
}
