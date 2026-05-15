import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import { livingRow, livingRows } from '@/data/softDelete';
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
    // Tombstoned rows leak otherwise and end up rendering as "deleted but
    // visible" — most painfully, a soft-deleted SlotPlanSupersetGroup still
    // showing up as an active superset card. Filter at the read boundary.
    const program = livingRow(await db.program.get(programId));
    if (!program) return null;
    const slots = livingRows(
      await db.scheduleSlot.where('programId').equals(programId).sortBy('orderIndex'),
    );
    const sdts = livingRows(await db.splitDayType.where('programId').equals(programId).toArray());
    const sdtById = new Map(sdts.map((s) => [s.id, s]));
    const out: SlotDetail[] = [];
    for (const slot of slots) {
      const sdt = sdtById.get(slot.splitDayTypeId);
      if (!sdt) continue;
      const plans = livingRows(
        await db.slotPlan.where('scheduleSlotId').equals(slot.id).sortBy('orderIndex'),
      );
      const families = await db.liftFamily.bulkGet(plans.map((p) => p.liftFamilyId));
      const variantIds = plans
        .map((p) => p.defaultVariantId)
        .filter((id): id is string => Boolean(id));
      const variants = await db.variant.bulkGet(variantIds);
      const variantById = new Map(
        variants
          .map((v) => livingRow(v))
          .filter((v): v is NonNullable<typeof v> => Boolean(v))
          .map((v) => [v.id, v]),
      );
      const rows: SlotPlanRow[] = plans.map((p, idx) => {
        const family = livingRow(families[idx] ?? undefined);
        return {
          slotPlan: p,
          liftFamilyName: family?.name ?? '(exercise)',
          variant: p.defaultVariantId ? (variantById.get(p.defaultVariantId) ?? null) : null,
        };
      });
      const supersetGroups = livingRows(
        await db.slotPlanSupersetGroup.where('scheduleSlotId').equals(slot.id).sortBy('orderIndex'),
      );
      out.push({ slot, splitDayType: sdt, plans: rows, supersetGroups });
    }
    return { program, slots: out };
  }, [programId]);
}
