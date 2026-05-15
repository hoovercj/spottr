/**
 * App-start data initialization.
 *
 * - Seeds the lift library + PPL program + Home Gym location on first run (FR1, FR9).
 * - Backfills `Program.anchorDate` for legacy rows (added 2026-05-15).
 * - Requests persistent storage so eviction is less likely (NFR57).
 *
 * Eviction recovery (FR52, NFR20) lands in Sprint 6 polish — the data path
 * is here, but the user-facing surface waits until the lifecycle pass.
 */

import { getDb } from '@/data/db';
import { mostRecentMonday } from '@/data/calendarDate';
import { newId, nowIso } from '@/data/ids';
import { withWorkoutWriteLock } from '@/data/locks';
import { NO_LOCATION_NAME, seedIfNeeded } from '@/data/seed';

export interface InitOutcome {
  seedApplied: boolean;
  persistentStorageGranted: boolean | null;
}

export async function initData(): Promise<InitOutcome> {
  const seedSummary = await seedIfNeeded();
  await backfillProgramAnchor();
  await backfillNoLocation();
  await ensureCurrentLocationSet();

  let persistentStorageGranted: boolean | null = null;
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    try {
      persistentStorageGranted = await navigator.storage.persist();
    } catch {
      persistentStorageGranted = null;
    }
  }

  return {
    seedApplied: seedSummary !== null,
    persistentStorageGranted,
  };
}

async function backfillProgramAnchor(): Promise<void> {
  const db = getDb();
  // Tombstoned programs don't need backfill — they'll never be activated again.
  const programs = await db.live.program.toArray();
  const needsBackfill = programs.filter((p) => !p.anchorDate);
  if (needsBackfill.length === 0) return;
  const anchor = mostRecentMonday();
  await withWorkoutWriteLock(async () => {
    for (const p of needsBackfill) {
      await db.program.update(p.id, { anchorDate: anchor });
    }
  });
}

async function backfillNoLocation(): Promise<void> {
  const db = getDb();
  // Look at live rows only — a tombstoned NO_LOCATION shouldn't block us from
  // recreating it (and the recreate uses a fresh id, so it doesn't collide).
  const all = await db.live.location.toArray();
  if (all.some((l) => l.name === NO_LOCATION_NAME)) return;
  const now = nowIso();
  await withWorkoutWriteLock(async () => {
    await db.location.put({ id: newId(), name: NO_LOCATION_NAME, createdAt: now, updatedAt: now });
  });
}

const META_CURRENT_LOCATION = 'currentLocationId';

/**
 * Pin the "current location" so picker resolution doesn't depend on the
 * non-deterministic order Dexie returns from `toArray()`. We prefer a real
 * location (e.g., "Home Gym") over the built-in "No location" so renames
 * apply to a row the user actually thinks of as theirs.
 */
async function ensureCurrentLocationSet(): Promise<void> {
  const db = getDb();
  const row = await db.meta.get(META_CURRENT_LOCATION);
  if (row?.value) {
    // Validate the pinned id still exists AND isn't a tombstone; otherwise reseat.
    const exists = await db.live.location.get(row.value as string);
    if (exists) return;
  }
  const all = await db.live.location.toArray();
  if (all.length === 0) return;
  const preferred = all.find((l) => l.name !== NO_LOCATION_NAME) ?? all[0]!;
  await withWorkoutWriteLock(async () => {
    await db.meta.put({ key: META_CURRENT_LOCATION, value: preferred.id });
  });
}
