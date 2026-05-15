/**
 * User-default settings (units, weight increment). Persisted as a single
 * meta row keyed on `settings:user`. Read with sensible defaults so a
 * fresh install behaves like 'lb'.
 */

import { getDb } from '@/data/db';
import { withWorkoutWriteLock } from '@/data/locks';
import { DEFAULT_INCREMENT, type UserSettings, type Units } from '@/data/types';

const META_KEY = 'settings:user';

export const DEFAULT_USER_SETTINGS: UserSettings = {
  units: 'lb',
  weightIncrement: DEFAULT_INCREMENT.lb,
};

export async function getUserSettings(): Promise<UserSettings> {
  const row = await getDb().meta.get(META_KEY);
  if (!row?.value) return DEFAULT_USER_SETTINGS;
  const raw = row.value as Partial<UserSettings>;
  const units: Units = raw.units === 'kg' ? 'kg' : 'lb';
  const weightIncrement = raw.weightIncrement ?? DEFAULT_INCREMENT[units];
  return { units, weightIncrement };
}

export async function setUserUnits(units: Units): Promise<void> {
  await withWorkoutWriteLock(async () => {
    const current = await getUserSettings();
    const next: UserSettings = {
      units,
      // Reset the increment to the default for the new unit system; if the
      // user customizes it later we'll keep that, but defaulting now avoids
      // 5-lb increments after switching to kg.
      weightIncrement: DEFAULT_INCREMENT[units],
    };
    await getDb().meta.put({ key: META_KEY, value: next });
    void current;
  });
}
