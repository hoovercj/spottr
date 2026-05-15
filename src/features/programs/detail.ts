import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import type {
  Program,
  ScheduleSlot,
  SlotPlan,
  SlotPlanSupersetGroup,
  SplitDayType,
  Variant,
} from '@/data/types';

export interface SlotPlanRow {
  slotPlan: SlotPlan;
  liftFamilyName: string;
  variant: Variant | null;
}

export interface SlotDetail {
  slot: ScheduleSlot;
  splitDayType: SplitDayType;
  plans: SlotPlanRow[];
  /** Superset groups defined on this slot, in display order. */
  supersetGroups: SlotPlanSupersetGroup[];
}

export interface ProgramDetail {
  program: Program;
  slots: SlotDetail[];
}

export function useProgramDetail(programId: string | null): ProgramDetail | null | undefined {
  return useLiveQuery(async () => {
    if (!programId) return null;
    const db = getDb();
    // All reads go through `db.live.*` so tombstones can't leak into the
    // detail view (a soft-deleted SlotPlanSupersetGroup would otherwise
    // render as an active superset card on the editor).
    const program = await db.live.program.get(programId);
    if (!program) return null;
    const slots = await db.live.scheduleSlot
      .where('programId')
      .equals(programId)
      .sortBy('orderIndex');
    const sdts = await db.live.splitDayType.where('programId').equals(programId).toArray();
    const sdtById = new Map(sdts.map((s) => [s.id, s]));
    const out: SlotDetail[] = [];
    for (const slot of slots) {
      const sdt = sdtById.get(slot.splitDayTypeId);
      if (!sdt) continue;
      const plans = await db.live.slotPlan
        .where('scheduleSlotId')
        .equals(slot.id)
        .sortBy('orderIndex');
      const families = await db.live.liftFamily.bulkGet(plans.map((p) => p.liftFamilyId));
      const variantIds = plans
        .map((p) => p.defaultVariantId)
        .filter((id): id is string => Boolean(id));
      const variants = await db.live.variant.bulkGet(variantIds);
      const variantById = new Map(
        variants.filter((v): v is NonNullable<typeof v> => Boolean(v)).map((v) => [v.id, v]),
      );
      const rows: SlotPlanRow[] = plans.map((p, idx) => {
        const family = families[idx] ?? null;
        return {
          slotPlan: p,
          liftFamilyName: family?.name ?? '(exercise)',
          variant: p.defaultVariantId ? (variantById.get(p.defaultVariantId) ?? null) : null,
        };
      });
      const supersetGroups = await db.live.slotPlanSupersetGroup
        .where('scheduleSlotId')
        .equals(slot.id)
        .sortBy('orderIndex');
      out.push({ slot, splitDayType: sdt, plans: rows, supersetGroups });
    }
    return { program, slots: out };
  }, [programId]);
}
