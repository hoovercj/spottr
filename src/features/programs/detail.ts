import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import type { Program, ScheduleSlot, SlotPlan, SplitDayType, Variant } from '@/data/types';

export interface SlotPlanRow {
  slotPlan: SlotPlan;
  liftFamilyName: string;
  variant: Variant | null;
}

export interface SlotDetail {
  slot: ScheduleSlot;
  splitDayType: SplitDayType;
  plans: SlotPlanRow[];
}

export interface ProgramDetail {
  program: Program;
  slots: SlotDetail[];
}

export function useProgramDetail(programId: string | null): ProgramDetail | null | undefined {
  return useLiveQuery(async () => {
    if (!programId) return null;
    const db = getDb();
    const program = await db.program.get(programId);
    if (!program) return null;
    const slots = await db.scheduleSlot.where('programId').equals(programId).sortBy('orderIndex');
    const sdts = await db.splitDayType.where('programId').equals(programId).toArray();
    const sdtById = new Map(sdts.map((s) => [s.id, s]));
    const out: SlotDetail[] = [];
    for (const slot of slots) {
      const sdt = sdtById.get(slot.splitDayTypeId);
      if (!sdt) continue;
      const plans = await db.slotPlan.where('scheduleSlotId').equals(slot.id).sortBy('orderIndex');
      const families = await db.liftFamily.bulkGet(plans.map((p) => p.liftFamilyId));
      const variantIds = plans
        .map((p) => p.defaultVariantId)
        .filter((id): id is string => Boolean(id));
      const variants = await db.variant.bulkGet(variantIds);
      const variantById = new Map(
        variants.filter((v): v is NonNullable<typeof v> => Boolean(v)).map((v) => [v.id, v]),
      );
      const rows: SlotPlanRow[] = plans.map((p, idx) => ({
        slotPlan: p,
        liftFamilyName: families[idx]?.name ?? '(exercise)',
        variant: p.defaultVariantId ? (variantById.get(p.defaultVariantId) ?? null) : null,
      }));
      out.push({ slot, splitDayType: sdt, plans: rows });
    }
    return { program, slots: out };
  }, [programId]);
}
