import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import type { UserSettings } from '@/data/types';
import { DEFAULT_USER_SETTINGS } from '@/features/settings/actions';

const META_KEY = 'settings:user';

export function useUserSettings(): UserSettings | undefined {
  return useLiveQuery(async () => {
    const row = await getDb().meta.get(META_KEY);
    if (!row?.value) return DEFAULT_USER_SETTINGS;
    const raw = row.value as Partial<UserSettings>;
    return {
      units: raw.units === 'kg' ? 'kg' : 'lb',
      weightIncrement: raw.weightIncrement ?? (raw.units === 'kg' ? 2.5 : 5),
    };
  }, []);
}
