import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import type { Location, Units } from '@/data/types';
import { getCurrentLocationId } from '@/features/locations/actions';
import { useUserSettings } from '@/features/settings/hooks';

export function useAllLocations(): Location[] | undefined {
  return useLiveQuery(async () => {
    return (await getDb().location.toArray()).sort((a, b) => a.name.localeCompare(b.name));
  }, []);
}

export function useCurrentLocation(): Location | null | undefined {
  return useLiveQuery(async () => {
    const id = await getCurrentLocationId();
    if (!id) return null;
    return (await getDb().location.get(id)) ?? null;
  }, []);
}

/**
 * Effective unit system for the current location: the location's override
 * if set, else the user's default. Returns `undefined` while loading.
 */
export function useCurrentLocationUnits(): Units | undefined {
  const settings = useUserSettings();
  const loc = useCurrentLocation();
  if (settings === undefined || loc === undefined) return undefined;
  return loc?.units ?? settings.units;
}
