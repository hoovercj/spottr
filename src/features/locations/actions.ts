/**
 * Location management (PRD §FR9, §FR10).
 *
 * The "current location" is a single meta row that persists across sessions.
 * Defaults to the first location row on first read.
 *
 * Locations carry an optional `units` override (lb / kg) so traveling
 * lifters see weights in the unit system that matches the gym's equipment.
 * When undefined, the user-default unit applies.
 */

import { getDb } from '@/data/db';
import { newId, nowIso } from '@/data/ids';
import { withWorkoutWriteLock } from '@/data/locks';
import type { Location, Units } from '@/data/types';

const META_CURRENT_LOCATION = 'currentLocationId';

export async function getCurrentLocationId(): Promise<string | null> {
  const db = getDb();
  const row = await db.meta.get(META_CURRENT_LOCATION);
  if (row?.value) return row.value as string;
  const first = (await db.location.toArray())[0];
  return first?.id ?? null;
}

export async function setCurrentLocationId(locationId: string): Promise<void> {
  await withWorkoutWriteLock(async () => {
    await getDb().meta.put({ key: META_CURRENT_LOCATION, value: locationId });
  });
}

export interface CreateLocationInput {
  name: string;
  units?: Units;
}

export async function createLocation(input: CreateLocationInput): Promise<Location> {
  const trimmed = input.name.trim();
  if (!trimmed) throw new Error('Location name is required');
  const loc: Location = {
    id: newId(),
    name: trimmed,
    ...(input.units ? { units: input.units } : {}),
    createdAt: nowIso(),
  };
  await withWorkoutWriteLock(async () => {
    await getDb().location.put(loc);
    await getDb().meta.put({ key: META_CURRENT_LOCATION, value: loc.id });
  });
  return loc;
}

export async function renameLocation(locationId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Location name is required');
  await withWorkoutWriteLock(async () => {
    await getDb().location.update(locationId, { name: trimmed });
  });
}

export async function setLocationUnits(locationId: string, units: Units): Promise<void> {
  await withWorkoutWriteLock(async () => {
    await getDb().location.update(locationId, { units });
  });
}
