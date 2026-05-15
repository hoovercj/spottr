/**
 * Program (routine) mutations.
 *
 * The home-screen picker calls `renameProgram` / `setActiveProgram`; the
 * routine-editor surface uses the create / edit / slot-plan helpers
 * below. Every write goes through `withWorkoutWriteLock` to keep
 * structural edits ordered against the workout state machine.
 */

import { getDb } from '@/data/db';
import { mostRecentMonday } from '@/data/calendarDate';
import { newId, nowIso } from '@/data/ids';
import { withWorkoutWriteLock } from '@/data/locks';
import { softDelete, softDeleteCollection } from '@/data/softDelete';
import type {
  PlannedSet,
  Program,
  ScheduleSlot,
  SlotPlan,
  SlotPlanSupersetGroup,
  SplitDayType,
} from '@/data/types';

/** Snapshot of all rows owned by a Program; used by the editor's Discard. */
export interface ProgramSnapshot {
  program: Program;
  splitDayTypes: SplitDayType[];
  scheduleSlots: ScheduleSlot[];
  slotPlans: SlotPlan[];
  slotPlanSupersetGroups: SlotPlanSupersetGroup[];
}

export async function renameProgram(programId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Routine name is required');
  await withWorkoutWriteLock(async () => {
    await getDb().program.update(programId, { name: trimmed });
  });
}

export async function setActiveProgram(programId: string): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    const target = await db.program.get(programId);
    if (!target) throw new Error(`Unknown program: ${programId}`);
    await db.transaction('rw', [db.program], async () => {
      const all = await db.program.toArray();
      for (const p of all) {
        const shouldBeActive = p.id === programId;
        if (p.isActive !== shouldBeActive) {
          await db.program.update(p.id, { isActive: shouldBeActive });
        }
      }
    });
  });
}

const DEFAULT_DAY_NAMES = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];

export interface CreateProgramInput {
  name: string;
  /** Defaults to 7 (one slot per weekday). */
  length?: number;
  /** Defaults to today's most recent Monday. */
  anchorDate?: string;
}

/**
 * Creates a new Program along with `length` empty schedule slots (named
 * "Day 1"…"Day N") and their SplitDayType rows. The new program is
 * inactive by default; the caller can `setActiveProgram` if desired.
 */
export async function createProgram(input: CreateProgramInput): Promise<{ programId: string }> {
  const name = input.name.trim();
  if (!name) throw new Error('Routine name is required');
  const length = Math.max(1, Math.min(14, input.length ?? 7));
  const anchorDate = input.anchorDate ?? mostRecentMonday();
  const db = getDb();
  return withWorkoutWriteLock(async () => {
    return db.transaction('rw', [db.program, db.splitDayType, db.scheduleSlot], async () => {
      const now = nowIso();
      const program: Program = {
        id: newId(),
        name,
        isActive: false,
        anchorDate,
        createdAt: now,
      };
      await db.program.put(program);

      const sdts: SplitDayType[] = [];
      const slots: ScheduleSlot[] = [];
      for (let i = 0; i < length; i++) {
        const sdt: SplitDayType = {
          id: newId(),
          programId: program.id,
          name: DEFAULT_DAY_NAMES[i] ?? `Day ${i + 1}`,
          isRest: false,
        };
        sdts.push(sdt);
        slots.push({
          id: newId(),
          programId: program.id,
          orderIndex: i,
          splitDayTypeId: sdt.id,
        });
      }
      await db.splitDayType.bulkPut(sdts);
      await db.scheduleSlot.bulkPut(slots);
      return { programId: program.id };
    });
  });
}

export async function setProgramAnchorDate(programId: string, anchorDate: string): Promise<void> {
  await withWorkoutWriteLock(async () => {
    await getDb().program.update(programId, { anchorDate });
  });
}

export async function renameSplitDayType(splitDayTypeId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Day name is required');
  await withWorkoutWriteLock(async () => {
    await getDb().splitDayType.update(splitDayTypeId, { name: trimmed });
  });
}

export async function setSplitDayTypeIsRest(
  splitDayTypeId: string,
  isRest: boolean,
): Promise<void> {
  await withWorkoutWriteLock(async () => {
    await getDb().splitDayType.update(splitDayTypeId, { isRest });
  });
}

export interface AddSlotPlanInput {
  scheduleSlotId: string;
  liftFamilyId: string;
  variantId: string;
  plannedSets?: PlannedSet[];
}

export async function addSlotPlan(input: AddSlotPlanInput): Promise<{ slotPlanId: string }> {
  const db = getDb();
  return withWorkoutWriteLock(async () => {
    return db.transaction('rw', [db.slotPlan], async () => {
      const existing = await db.slotPlan
        .where('scheduleSlotId')
        .equals(input.scheduleSlotId)
        .toArray();
      const plannedSets =
        input.plannedSets ??
        [0, 1, 2].map((i) => ({ orderIndex: i, plannedRepsMin: 8, plannedRepsMax: 8 }));
      const sp: SlotPlan = {
        id: newId(),
        scheduleSlotId: input.scheduleSlotId,
        orderIndex: existing.length,
        liftFamilyId: input.liftFamilyId,
        defaultVariantId: input.variantId,
        plannedSets,
      };
      await db.slotPlan.put(sp);
      return { slotPlanId: sp.id };
    });
  });
}

export async function removeSlotPlan(slotPlanId: string): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    await db.transaction('rw', [db.slotPlan, db.slotPlanSupersetGroup], async () => {
      const plan = await db.slotPlan.get(slotPlanId);
      await softDelete(db.slotPlan, slotPlanId);
      if (!plan) return;
      // Cascade: any superset group on this slot that contained this plan
      // gets its membership rewritten. Groups that fall below 2 surviving
      // members are deleted entirely — a superset of one isn't a superset.
      const groups = await db.slotPlanSupersetGroup
        .where('scheduleSlotId')
        .equals(plan.scheduleSlotId)
        .toArray();
      for (const g of groups) {
        if (!g.slotPlanIds.includes(slotPlanId)) continue;
        const remaining = g.slotPlanIds.filter((id) => id !== slotPlanId);
        if (remaining.length < 2) {
          await softDelete(db.slotPlanSupersetGroup, g.id);
        } else {
          await db.slotPlanSupersetGroup.update(g.id, { slotPlanIds: remaining });
        }
      }
    });
  });
}

export async function updateSlotPlanSets(
  slotPlanId: string,
  plannedSets: PlannedSet[],
): Promise<void> {
  await withWorkoutWriteLock(async () => {
    await getDb().slotPlan.update(slotPlanId, { plannedSets });
  });
}

/**
 * Groups two or more slotPlans into a superset on this slot. If any of
 * the selected slotPlans already belong to a superset on the same slot,
 * those groups are merged into one (the user's intent is "these all go
 * together"). The result group's orderIndex follows the lowest existing
 * slotPlan orderIndex among its members so it renders in-place.
 */
export async function createSlotSupersetGroup(input: {
  scheduleSlotId: string;
  slotPlanIds: string[];
}): Promise<{ groupId: string } | null> {
  if (input.slotPlanIds.length < 2) return null;
  const db = getDb();
  return withWorkoutWriteLock(async () => {
    return db.transaction('rw', [db.slotPlan, db.slotPlanSupersetGroup], async () => {
      const plans = await db.slotPlan
        .where('scheduleSlotId')
        .equals(input.scheduleSlotId)
        .sortBy('orderIndex');
      const selected = plans.filter((p) => input.slotPlanIds.includes(p.id));
      if (selected.length < 2) return null;

      // Pull in any plans that already share a group with one of our
      // selections, so the merge keeps each existing group intact.
      const existingGroups = await db.slotPlanSupersetGroup
        .where('scheduleSlotId')
        .equals(input.scheduleSlotId)
        .toArray();
      const selectedIdSet = new Set(input.slotPlanIds);
      const toAbsorb = existingGroups.filter((g) =>
        g.slotPlanIds.some((id) => selectedIdSet.has(id)),
      );
      for (const g of toAbsorb) {
        for (const id of g.slotPlanIds) selectedIdSet.add(id);
        await softDelete(db.slotPlanSupersetGroup, g.id);
      }

      const memberIds = plans.filter((p) => selectedIdSet.has(p.id)).map((p) => p.id);
      // orderIndex of the new group = the smallest existing slotPlan
      // orderIndex among its members. Other groups (or this group as a
      // pure-virtual sort key) sort by this same field.
      const firstMemberOrder = plans.find((p) => selectedIdSet.has(p.id))?.orderIndex ?? 0;
      const newGroup: SlotPlanSupersetGroup = {
        id: newId(),
        scheduleSlotId: input.scheduleSlotId,
        slotPlanIds: memberIds,
        orderIndex: firstMemberOrder,
        updatedAt: nowIso(),
      };
      await db.slotPlanSupersetGroup.put(newGroup);
      return { groupId: newGroup.id };
    });
  });
}

export async function removeSlotSupersetGroup(groupId: string): Promise<void> {
  await withWorkoutWriteLock(async () => {
    await softDelete(getDb().slotPlanSupersetGroup, groupId);
  });
}

export async function deleteProgram(programId: string): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    await db.transaction(
      'rw',
      [db.program, db.splitDayType, db.scheduleSlot, db.slotPlan, db.slotPlanSupersetGroup],
      async () => {
        const program = await db.program.get(programId);
        if (!program) return;
        if (program.isActive) throw new Error('Cannot delete the active routine');
        const slots = await db.scheduleSlot.where('programId').equals(programId).toArray();
        const slotIds = slots.map((s) => s.id);
        await softDeleteCollection(db.slotPlan, db.slotPlan.where('scheduleSlotId').anyOf(slotIds));
        await softDeleteCollection(
          db.slotPlanSupersetGroup,
          db.slotPlanSupersetGroup.where('scheduleSlotId').anyOf(slotIds),
        );
        await softDeleteCollection(
          db.scheduleSlot,
          db.scheduleSlot.where('programId').equals(programId),
        );
        await softDeleteCollection(
          db.splitDayType,
          db.splitDayType.where('programId').equals(programId),
        );
        await softDelete(db.program, programId);
      },
    );
  });
}

/** Read every row that belongs to a program; the editor's Discard restores from this. */
export async function snapshotProgram(programId: string): Promise<ProgramSnapshot | null> {
  const db = getDb();
  const program = await db.program.get(programId);
  if (!program) return null;
  const splitDayTypes = await db.splitDayType.where('programId').equals(programId).toArray();
  const scheduleSlots = await db.scheduleSlot.where('programId').equals(programId).toArray();
  const slotIds = scheduleSlots.map((s) => s.id);
  const slotPlans = slotIds.length
    ? await db.slotPlan.where('scheduleSlotId').anyOf(slotIds).toArray()
    : [];
  const slotPlanSupersetGroups = slotIds.length
    ? await db.slotPlanSupersetGroup.where('scheduleSlotId').anyOf(slotIds).toArray()
    : [];
  return { program, splitDayTypes, scheduleSlots, slotPlans, slotPlanSupersetGroups };
}

/**
 * Restore the program to exactly the state captured in `snapshot`. Wipes the
 * current rows owned by the program first, then re-inserts the snapshot rows
 * verbatim (so IDs survive — outside-program references like Sessions stay
 * valid).
 */
export async function restoreProgramSnapshot(snapshot: ProgramSnapshot): Promise<void> {
  const db = getDb();
  const programId = snapshot.program.id;
  await withWorkoutWriteLock(async () => {
    await db.transaction(
      'rw',
      [db.program, db.splitDayType, db.scheduleSlot, db.slotPlan, db.slotPlanSupersetGroup],
      async () => {
        const slots = await db.scheduleSlot.where('programId').equals(programId).toArray();
        const slotIds = slots.map((s) => s.id);
        if (slotIds.length > 0) {
          await softDeleteCollection(
            db.slotPlan,
            db.slotPlan.where('scheduleSlotId').anyOf(slotIds),
          );
          await softDeleteCollection(
            db.slotPlanSupersetGroup,
            db.slotPlanSupersetGroup.where('scheduleSlotId').anyOf(slotIds),
          );
        }
        await softDeleteCollection(
          db.scheduleSlot,
          db.scheduleSlot.where('programId').equals(programId),
        );
        await softDeleteCollection(
          db.splitDayType,
          db.splitDayType.where('programId').equals(programId),
        );
        await db.program.put(snapshot.program);
        if (snapshot.splitDayTypes.length) await db.splitDayType.bulkPut(snapshot.splitDayTypes);
        if (snapshot.scheduleSlots.length) await db.scheduleSlot.bulkPut(snapshot.scheduleSlots);
        if (snapshot.slotPlans.length) await db.slotPlan.bulkPut(snapshot.slotPlans);
        if (snapshot.slotPlanSupersetGroups.length)
          await db.slotPlanSupersetGroup.bulkPut(snapshot.slotPlanSupersetGroups);
      },
    );
  });
}

/** Append a new empty slot (and matching split-day type) at the end of the routine. */
export async function addProgramSlot(
  programId: string,
  name?: string,
): Promise<{ slotId: string }> {
  const db = getDb();
  return withWorkoutWriteLock(async () => {
    return db.transaction('rw', [db.scheduleSlot, db.splitDayType], async () => {
      const existing = await db.scheduleSlot.where('programId').equals(programId).toArray();
      const nextIndex = existing.length;
      const sdt: SplitDayType = {
        id: newId(),
        programId,
        name: name?.trim() || `Day ${nextIndex + 1}`,
        isRest: false,
      };
      await db.splitDayType.put(sdt);
      const slot: ScheduleSlot = {
        id: newId(),
        programId,
        orderIndex: nextIndex,
        splitDayTypeId: sdt.id,
      };
      await db.scheduleSlot.put(slot);
      return { slotId: slot.id };
    });
  });
}

/**
 * Duplicate an existing slot — its split-day type, its plans, and any
 * superset groups — and append the copy to the end of the program. New IDs
 * everywhere so the copy is fully independent.
 */
export async function duplicateProgramSlot(slotId: string): Promise<{ slotId: string }> {
  const db = getDb();
  return withWorkoutWriteLock(async () => {
    return db.transaction(
      'rw',
      [db.scheduleSlot, db.splitDayType, db.slotPlan, db.slotPlanSupersetGroup],
      async () => {
        const src = await db.scheduleSlot.get(slotId);
        if (!src) throw new Error(`Unknown slot: ${slotId}`);
        const srcSdt = await db.splitDayType.get(src.splitDayTypeId);
        if (!srcSdt) throw new Error(`Slot has no split-day type`);
        const srcPlans = await db.slotPlan
          .where('scheduleSlotId')
          .equals(slotId)
          .sortBy('orderIndex');
        const srcGroups = await db.slotPlanSupersetGroup
          .where('scheduleSlotId')
          .equals(slotId)
          .toArray();
        const existing = await db.scheduleSlot.where('programId').equals(src.programId).toArray();

        const newSdt: SplitDayType = {
          id: newId(),
          programId: src.programId,
          name: `${srcSdt.name} (copy)`,
          isRest: srcSdt.isRest,
        };
        await db.splitDayType.put(newSdt);

        const newSlot: ScheduleSlot = {
          id: newId(),
          programId: src.programId,
          orderIndex: existing.length,
          splitDayTypeId: newSdt.id,
        };
        await db.scheduleSlot.put(newSlot);

        const planIdRemap = new Map<string, string>();
        const newPlans: SlotPlan[] = srcPlans.map((p, i) => {
          const id = newId();
          planIdRemap.set(p.id, id);
          return {
            id,
            scheduleSlotId: newSlot.id,
            orderIndex: i,
            liftFamilyId: p.liftFamilyId,
            plannedSets: p.plannedSets.map((s) => ({ ...s })),
            ...(p.defaultVariantId ? { defaultVariantId: p.defaultVariantId } : {}),
          };
        });
        if (newPlans.length) await db.slotPlan.bulkPut(newPlans);

        const newGroups: SlotPlanSupersetGroup[] = srcGroups.map((g, i) => ({
          id: newId(),
          scheduleSlotId: newSlot.id,
          slotPlanIds: g.slotPlanIds.map((oldId) => planIdRemap.get(oldId) ?? oldId),
          orderIndex: i,
        }));
        if (newGroups.length) await db.slotPlanSupersetGroup.bulkPut(newGroups);

        return { slotId: newSlot.id };
      },
    );
  });
}

/**
 * Move a slot up or down by one position within its program. No-op at the
 * boundaries. The whole program's slots are re-packed afterward so the
 * orderIndex stays contiguous (defends against any pre-existing gaps).
 */
export async function moveProgramSlot(slotId: string, direction: 'up' | 'down'): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    await db.transaction('rw', [db.scheduleSlot], async () => {
      const slot = await db.scheduleSlot.get(slotId);
      if (!slot) return;
      const siblings = await db.scheduleSlot
        .where('programId')
        .equals(slot.programId)
        .sortBy('orderIndex');
      const idx = siblings.findIndex((s) => s.id === slotId);
      if (idx < 0) return;
      const swapWith = direction === 'up' ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= siblings.length) return;
      const arr = [...siblings];
      const a = arr[idx]!;
      const b = arr[swapWith]!;
      arr[idx] = b;
      arr[swapWith] = a;
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i]!;
        if (s.orderIndex !== i) await db.scheduleSlot.update(s.id, { orderIndex: i });
      }
    });
  });
}

/**
 * Clone a program — name, anchor, all of its slots / split-day types /
 * plans / superset groups — into a brand-new inactive program so the user
 * can build a variation without touching the original. Returns the new id.
 */
export async function duplicateProgram(programId: string): Promise<{ programId: string }> {
  const db = getDb();
  return withWorkoutWriteLock(async () => {
    return db.transaction(
      'rw',
      [db.program, db.splitDayType, db.scheduleSlot, db.slotPlan, db.slotPlanSupersetGroup],
      async () => {
        const src = await db.program.get(programId);
        if (!src) throw new Error(`Unknown program: ${programId}`);
        const srcSdts = await db.splitDayType.where('programId').equals(programId).toArray();
        const srcSlots = await db.scheduleSlot
          .where('programId')
          .equals(programId)
          .sortBy('orderIndex');
        const srcSlotIds = srcSlots.map((s) => s.id);
        const srcPlans = srcSlotIds.length
          ? await db.slotPlan.where('scheduleSlotId').anyOf(srcSlotIds).toArray()
          : [];
        const srcGroups = srcSlotIds.length
          ? await db.slotPlanSupersetGroup.where('scheduleSlotId').anyOf(srcSlotIds).toArray()
          : [];

        const newProgram: Program = {
          id: newId(),
          name: `${src.name} (copy)`,
          isActive: false,
          createdAt: nowIso(),
          ...(src.anchorDate ? { anchorDate: src.anchorDate } : {}),
        };
        await db.program.put(newProgram);

        const sdtRemap = new Map<string, string>();
        const newSdts: SplitDayType[] = srcSdts.map((s) => {
          const id = newId();
          sdtRemap.set(s.id, id);
          return { id, programId: newProgram.id, name: s.name, isRest: s.isRest };
        });
        if (newSdts.length) await db.splitDayType.bulkPut(newSdts);

        const slotRemap = new Map<string, string>();
        const newSlots: ScheduleSlot[] = srcSlots.map((s, i) => {
          const id = newId();
          slotRemap.set(s.id, id);
          return {
            id,
            programId: newProgram.id,
            orderIndex: i,
            splitDayTypeId: sdtRemap.get(s.splitDayTypeId) ?? s.splitDayTypeId,
          };
        });
        if (newSlots.length) await db.scheduleSlot.bulkPut(newSlots);

        const planRemap = new Map<string, string>();
        const newPlans: SlotPlan[] = srcPlans.map((p) => {
          const id = newId();
          planRemap.set(p.id, id);
          return {
            id,
            scheduleSlotId: slotRemap.get(p.scheduleSlotId) ?? p.scheduleSlotId,
            orderIndex: p.orderIndex,
            liftFamilyId: p.liftFamilyId,
            plannedSets: p.plannedSets.map((ps) => ({ ...ps })),
            ...(p.defaultVariantId ? { defaultVariantId: p.defaultVariantId } : {}),
          };
        });
        if (newPlans.length) await db.slotPlan.bulkPut(newPlans);

        const newGroups: SlotPlanSupersetGroup[] = srcGroups.map((g) => ({
          id: newId(),
          scheduleSlotId: slotRemap.get(g.scheduleSlotId) ?? g.scheduleSlotId,
          slotPlanIds: g.slotPlanIds.map((id) => planRemap.get(id) ?? id),
          orderIndex: g.orderIndex,
        }));
        if (newGroups.length) await db.slotPlanSupersetGroup.bulkPut(newGroups);

        return { programId: newProgram.id };
      },
    );
  });
}

/**
 * Remove a slot from a program along with its split-day type and any plans
 * and superset groups attached to it. Remaining slots in the program have
 * their `orderIndex` re-packed so the rotation stays contiguous.
 */
export async function deleteProgramSlot(slotId: string): Promise<void> {
  const db = getDb();
  await withWorkoutWriteLock(async () => {
    await db.transaction(
      'rw',
      [db.scheduleSlot, db.splitDayType, db.slotPlan, db.slotPlanSupersetGroup],
      async () => {
        const slot = await db.scheduleSlot.get(slotId);
        if (!slot) return;
        await softDeleteCollection(db.slotPlan, db.slotPlan.where('scheduleSlotId').equals(slotId));
        await softDeleteCollection(
          db.slotPlanSupersetGroup,
          db.slotPlanSupersetGroup.where('scheduleSlotId').equals(slotId),
        );
        await softDelete(db.scheduleSlot, slotId);
        await softDelete(db.splitDayType, slot.splitDayTypeId);
        const siblings = await db.scheduleSlot
          .where('programId')
          .equals(slot.programId)
          .sortBy('orderIndex');
        for (let i = 0; i < siblings.length; i++) {
          const s = siblings[i]!;
          if (s.orderIndex !== i) await db.scheduleSlot.update(s.id, { orderIndex: i });
        }
      },
    );
  });
}
