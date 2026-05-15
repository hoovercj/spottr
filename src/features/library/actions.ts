/**
 * Custom exercise creation. The seed library covers the common lifts but
 * the world has more squat variants than fit in any built-in list, so the
 * picker exposes a "Create new exercise" path that lands here.
 */

import { getDb } from '@/data/db';
import { newId, nowIso } from '@/data/ids';
import {
  DEFAULT_IS_FREE_WEIGHT,
  type EquipmentKind,
  type LiftFamily,
  type Variant,
} from '@/data/types';

export interface CreateCustomExerciseInput {
  familyName: string;
  variantName: string;
  equipmentKind: EquipmentKind;
  /** Defaults to `DEFAULT_IS_FREE_WEIGHT[equipmentKind]` when omitted. */
  isFreeWeight?: boolean;
}

export interface CreateCustomExerciseResult {
  family: LiftFamily;
  variant: Variant;
}

export async function createCustomExercise(
  input: CreateCustomExerciseInput,
): Promise<CreateCustomExerciseResult> {
  const familyName = input.familyName.trim();
  const variantName = input.variantName.trim();
  if (!familyName) throw new Error('Exercise name is required.');
  if (!variantName) throw new Error('Variant name is required.');

  const db = getDb();
  const now = nowIso();
  const family: LiftFamily = {
    id: newId(),
    name: familyName,
    isCustom: true,
    createdAt: now,
    updatedAt: now,
  };
  const variant: Variant = {
    id: newId(),
    liftFamilyId: family.id,
    name: variantName,
    equipmentKind: input.equipmentKind,
    isFreeWeight: input.isFreeWeight ?? DEFAULT_IS_FREE_WEIGHT[input.equipmentKind],
    isAlias: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction('rw', [db.liftFamily, db.variant], async () => {
    await db.liftFamily.put(family);
    await db.variant.put(variant);
  });

  return { family, variant };
}

/**
 * Adds a variant to an existing family (typically the user already has
 * "Squat" and wants to add a "Front Squat" variant they invented). The
 * builder dialog reuses this path when launched from the variant step.
 */
export async function createCustomVariant(input: {
  liftFamilyId: string;
  variantName: string;
  equipmentKind: EquipmentKind;
  isFreeWeight?: boolean;
}): Promise<Variant> {
  const variantName = input.variantName.trim();
  if (!variantName) throw new Error('Variant name is required.');

  const db = getDb();
  const now = nowIso();
  const variant: Variant = {
    id: newId(),
    liftFamilyId: input.liftFamilyId,
    name: variantName,
    equipmentKind: input.equipmentKind,
    isFreeWeight: input.isFreeWeight ?? DEFAULT_IS_FREE_WEIGHT[input.equipmentKind],
    isAlias: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.variant.put(variant);
  return variant;
}
