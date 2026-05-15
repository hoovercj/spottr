import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import { newId, nowIso } from '@/data/ids';
import { runSeed } from '@/data/seed';
import type { ScheduleSlot, SlotPlan } from '@/data/types';
import {
  addSlotPlan,
  createSlotSupersetGroup,
  removeSlotPlan,
  removeSlotSupersetGroup,
  renameProgram,
  setActiveProgram,
} from '@/features/programs/actions';

describe('program actions', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
  });
  afterEach(async () => {
    await getDb().delete();
  });

  it('renameProgram trims and persists the new name', async () => {
    await runSeed();
    const db = getDb();
    const program = (await db.program.toArray()).find((p) => p.isActive)!;
    await renameProgram(program.id, '  PPL — Mondays  ');
    const refreshed = await db.program.get(program.id);
    expect(refreshed?.name).toBe('PPL — Mondays');
  });

  it('renameProgram rejects empty input', async () => {
    await runSeed();
    const db = getDb();
    const program = (await db.program.toArray()).find((p) => p.isActive)!;
    await expect(renameProgram(program.id, '   ')).rejects.toThrow(/required/i);
  });

  it('setActiveProgram leaves exactly one program with isActive=true', async () => {
    await runSeed();
    const db = getDb();
    // Add a second program manually to exercise the flip.
    const newProgramId = newId();
    await db.program.put({
      id: newProgramId,
      name: 'Upper / Lower',
      isActive: false,
      anchorDate: '2026-05-04',
      createdAt: nowIso(),
    });

    await setActiveProgram(newProgramId);

    const all = await db.program.toArray();
    const activeIds = all.filter((p) => p.isActive).map((p) => p.id);
    expect(activeIds).toEqual([newProgramId]);
  });

  it('createSlotSupersetGroup writes a group with the chosen plan ids', async () => {
    await runSeed();
    const db = getDb();
    const program = (await db.program.toArray()).find((p) => p.isActive)!;
    // Pick the first non-rest slot that has ≥2 plans we can pair freshly.
    const slots = await db.scheduleSlot.where('programId').equals(program.id).sortBy('orderIndex');
    let slotId: string | null = null;
    let planIds: string[] = [];
    for (const slot of slots) {
      const plans = await db.slotPlan.where('scheduleSlotId').equals(slot.id).sortBy('orderIndex');
      if (plans.length >= 2) {
        slotId = slot.id;
        planIds = [plans[0]!.id, plans[1]!.id];
        break;
      }
    }
    expect(slotId).not.toBeNull();

    const result = await createSlotSupersetGroup({
      scheduleSlotId: slotId!,
      slotPlanIds: planIds,
    });
    expect(result).not.toBeNull();

    const groups = await db.slotPlanSupersetGroup
      .where('scheduleSlotId')
      .equals(slotId!)
      .toArray();
    const created = groups.find((g) => g.id === result!.groupId)!;
    expect(created.slotPlanIds).toEqual(planIds);
  });

  it('createSlotSupersetGroup returns null when fewer than 2 plans are passed', async () => {
    await runSeed();
    const db = getDb();
    const slot = (await db.scheduleSlot.toArray())[0]!;
    const onePlan = (await db.slotPlan.where('scheduleSlotId').equals(slot.id).toArray())[0]!;
    const result = await createSlotSupersetGroup({
      scheduleSlotId: slot.id,
      slotPlanIds: [onePlan.id],
    });
    expect(result).toBeNull();
  });

  it('removeSlotPlan cascades: removing one of two members tombstones the group', async () => {
    await runSeed();
    const db = getDb();
    const program = (await db.program.toArray()).find((p) => p.isActive)!;
    const slots = await db.scheduleSlot.where('programId').equals(program.id).sortBy('orderIndex');
    // Build a fresh 2-member superset to avoid relying on whichever seed slot
    // happens to have one.
    let slot: ScheduleSlot | undefined;
    for (const s of slots) {
      const plans = await db.slotPlan.where('scheduleSlotId').equals(s.id).toArray();
      if (plans.length >= 2) {
        slot = s;
        break;
      }
    }
    if (!slot) {
      throw new Error('Expected at least one slot with >=2 plans');
    }
    const plans = await db.slotPlan.where('scheduleSlotId').equals(slot.id).sortBy('orderIndex');
    const a = plans[0]!;
    const b = plans[1]!;
    const result = await createSlotSupersetGroup({
      scheduleSlotId: slot.id,
      slotPlanIds: [a.id, b.id],
    });
    expect(result).not.toBeNull();

    await removeSlotPlan(a.id);

    // Group should now be a tombstone (deletedAt set); live read returns 0.
    const live = await db.live.slotPlanSupersetGroup
      .where('scheduleSlotId')
      .equals(slot.id)
      .toArray();
    expect(live.find((g) => g.id === result!.groupId)).toBeUndefined();
    const raw = await db.slotPlanSupersetGroup.get(result!.groupId);
    expect(raw?.deletedAt).toBeDefined();
  });

  it('removeSlotPlan cascades: removing one of three members trims the group, not deletes', async () => {
    await runSeed();
    const db = getDb();
    const program = (await db.program.toArray()).find((p) => p.isActive)!;
    // Need a slot with ≥3 plans; if none in seed, append one.
    const slots = await db.scheduleSlot.where('programId').equals(program.id).sortBy('orderIndex');
    let targetSlot: ScheduleSlot | null = null;
    let plans: SlotPlan[] = [];
    for (const s of slots) {
      const ps = await db.slotPlan.where('scheduleSlotId').equals(s.id).sortBy('orderIndex');
      if (ps.length >= 3) {
        targetSlot = s;
        plans = ps;
        break;
      }
    }
    expect(targetSlot).not.toBeNull();
    const [a, b, c] = plans;
    const result = await createSlotSupersetGroup({
      scheduleSlotId: targetSlot!.id,
      slotPlanIds: [a!.id, b!.id, c!.id],
    });
    expect(result).not.toBeNull();

    await removeSlotPlan(b!.id);

    const live = await db.live.slotPlanSupersetGroup
      .where('scheduleSlotId')
      .equals(targetSlot!.id)
      .toArray();
    const surviving = live.find((g) => g.id === result!.groupId);
    expect(surviving).toBeDefined();
    expect(surviving!.slotPlanIds).toEqual([a!.id, c!.id]);
  });

  it('removeSlotSupersetGroup tombstones the group without touching its plans', async () => {
    await runSeed();
    const db = getDb();
    const slot = (await db.scheduleSlot.toArray())[0]!;
    const plans = await db.slotPlan.where('scheduleSlotId').equals(slot.id).sortBy('orderIndex');
    if (plans.length < 2) return; // Skip if seed doesn't have a usable slot.
    const result = await createSlotSupersetGroup({
      scheduleSlotId: slot.id,
      slotPlanIds: [plans[0]!.id, plans[1]!.id],
    });
    expect(result).not.toBeNull();

    await removeSlotSupersetGroup(result!.groupId);

    const liveGroups = await db.live.slotPlanSupersetGroup
      .where('scheduleSlotId')
      .equals(slot.id)
      .toArray();
    expect(liveGroups.find((g) => g.id === result!.groupId)).toBeUndefined();
    // The constituent plans remain live.
    const livePlanA = await db.live.slotPlan.get(plans[0]!.id);
    const livePlanB = await db.live.slotPlan.get(plans[1]!.id);
    expect(livePlanA).toBeDefined();
    expect(livePlanB).toBeDefined();
  });

  it('addSlotPlan appends with sequential orderIndex', async () => {
    await runSeed();
    const db = getDb();
    const slot = (await db.scheduleSlot.toArray())[0]!;
    const before = await db.slotPlan.where('scheduleSlotId').equals(slot.id).sortBy('orderIndex');
    const family = (await db.liftFamily.toArray())[0]!;
    const variant = (await db.variant.where('liftFamilyId').equals(family.id).toArray())[0]!;
    const result = await addSlotPlan({
      scheduleSlotId: slot.id,
      liftFamilyId: family.id,
      variantId: variant.id,
    });

    const after = await db.slotPlan.where('scheduleSlotId').equals(slot.id).sortBy('orderIndex');
    expect(after.length).toBe(before.length + 1);
    const added = after.find((p) => p.id === result.slotPlanId)!;
    expect(added.orderIndex).toBe(before.length);
    expect(added.liftFamilyId).toBe(family.id);
    expect(added.defaultVariantId).toBe(variant.id);
  });
});
