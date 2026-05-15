import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import { runSeed } from '@/data/seed';
import { createCustomExercise, createCustomVariant } from '@/features/library/actions';
import { DEFAULT_IS_FREE_WEIGHT } from '@/data/types';

describe('library actions', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
  });
  afterEach(async () => {
    await getDb().delete();
  });

  it('createCustomExercise writes a LiftFamily + Variant and flags isCustom', async () => {
    await runSeed();
    const db = getDb();
    const result = await createCustomExercise({
      familyName: 'Reverse Hyper',
      variantName: 'Custom Machine',
      equipmentKind: 'machine',
    });

    const family = await db.liftFamily.get(result.family.id);
    expect(family?.name).toBe('Reverse Hyper');
    expect(family?.isCustom).toBe(true);
    expect(family?.updatedAt).toBeDefined();

    const variant = await db.variant.get(result.variant.id);
    expect(variant?.name).toBe('Custom Machine');
    expect(variant?.liftFamilyId).toBe(family!.id);
    expect(variant?.equipmentKind).toBe('machine');
    expect(variant?.isAlias).toBe(false);
    // Defaults flow from DEFAULT_IS_FREE_WEIGHT when caller doesn't override.
    expect(variant?.isFreeWeight).toBe(DEFAULT_IS_FREE_WEIGHT.machine);
  });

  it('createCustomExercise trims whitespace and rejects empty input', async () => {
    await expect(
      createCustomExercise({
        familyName: '   ',
        variantName: 'foo',
        equipmentKind: 'barbell',
      }),
    ).rejects.toThrow(/exercise name/i);
    await expect(
      createCustomExercise({
        familyName: 'foo',
        variantName: '   ',
        equipmentKind: 'barbell',
      }),
    ).rejects.toThrow(/variant name/i);
  });

  it('createCustomExercise honors an explicit isFreeWeight override', async () => {
    await runSeed();
    const db = getDb();
    // Override the default for a machine variant.
    const result = await createCustomExercise({
      familyName: 'Pendulum Squat',
      variantName: 'Machine',
      equipmentKind: 'machine',
      isFreeWeight: true,
    });
    const v = await db.variant.get(result.variant.id);
    expect(v?.isFreeWeight).toBe(true);
  });

  it('createCustomVariant attaches a new variant to an existing family', async () => {
    await runSeed();
    const db = getDb();
    const benchPress = (await db.liftFamily.where('name').equals('Bench Press').toArray())[0]!;
    const variant = await createCustomVariant({
      liftFamilyId: benchPress.id,
      variantName: 'Larsen press',
      equipmentKind: 'barbell',
    });
    const persisted = await db.variant.get(variant.id);
    expect(persisted?.liftFamilyId).toBe(benchPress.id);
    expect(persisted?.name).toBe('Larsen press');
    expect(persisted?.isAlias).toBe(false);
    expect(persisted?.isFreeWeight).toBe(DEFAULT_IS_FREE_WEIGHT.barbell);
  });

  it('createCustomVariant rejects empty input', async () => {
    await expect(
      createCustomVariant({
        liftFamilyId: 'whatever',
        variantName: '   ',
        equipmentKind: 'barbell',
      }),
    ).rejects.toThrow(/variant name/i);
  });
});
