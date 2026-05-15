import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import type { LiftFamily, Variant } from '@/data/types';
import { getVariantsForFamily, type VariantPickerOption } from '@/features/session/amendments';

export function useLiftFamilies(): LiftFamily[] | undefined {
  return useLiveQuery(async () => {
    return (await getDb().liftFamily.toArray()).sort((a, b) => a.name.localeCompare(b.name));
  }, []);
}

export function useVariantsForFamily(
  liftFamilyId: string | null,
): VariantPickerOption[] | undefined {
  return useLiveQuery(async () => {
    if (!liftFamilyId) return [];
    return getVariantsForFamily(liftFamilyId);
  }, [liftFamilyId]);
}

export function useVariant(variantId: string | null): Variant | undefined {
  return useLiveQuery(async () => {
    if (!variantId) return undefined;
    return getDb().variant.get(variantId);
  }, [variantId]);
}
