import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import {
  getActiveProgram,
  getActiveSession,
  getDefaultSlotForToday,
  getPlannedSlotView,
  getProgramSlotsOrdered,
  getRoutineWeekView,
  getSessionView,
  type RoutineWeekView,
  type SessionView,
  type PlannedSlotView,
} from '@/features/session/queries';
import type {
  EquipmentKind,
  ScheduleSlot,
  Session,
  SessionSet,
  SplitDayType,
  Location,
} from '@/data/types';

export function useActiveSession(): Session | null | undefined {
  return useLiveQuery(() => getActiveSession(), []);
}

export function useDefaultSlot(): PlannedSlotView | null | undefined {
  return useLiveQuery(async () => {
    const slot = await getDefaultSlotForToday();
    if (!slot) return null;
    return getPlannedSlotView(slot.id);
  }, []);
}

export function usePlannedSlot(slotId: string | null): PlannedSlotView | null | undefined {
  return useLiveQuery(async () => {
    if (!slotId) return null;
    return getPlannedSlotView(slotId);
  }, [slotId]);
}

export interface ProgramSlotOption {
  slot: ScheduleSlot;
  splitDayType: SplitDayType;
  liftPreview: string;
}

export function useRoutineWeek(referenceDate?: Date): RoutineWeekView | null | undefined {
  // Capture the reference date once at mount so the hook is stable across
  // re-renders. Callers wanting a fresh "today" should remount.
  const refIso = referenceDate?.toISOString() ?? null;
  return useLiveQuery(async () => {
    const d = refIso ? new Date(refIso) : new Date();
    return getRoutineWeekView(d);
  }, [refIso]);
}

export function useProgramSlots(): ProgramSlotOption[] | undefined {
  return useLiveQuery(async () => {
    const db = getDb();
    const program = await getActiveProgram();
    if (!program) return [] as ProgramSlotOption[];
    const slots = await getProgramSlotsOrdered(program.id);
    const out: ProgramSlotOption[] = [];
    for (const slot of slots) {
      const sdt = await db.splitDayType.get(slot.splitDayTypeId);
      if (!sdt) continue;
      const plans = await db.slotPlan.where('scheduleSlotId').equals(slot.id).sortBy('orderIndex');
      const familyIds = plans.map((p) => p.liftFamilyId);
      const families = await db.liftFamily.bulkGet(familyIds);
      const liftPreview = sdt.isRest
        ? 'Rest day'
        : families
            .filter((f): f is NonNullable<typeof f> => Boolean(f))
            .map((f) => f.name)
            .slice(0, 3)
            .join(', ') + (families.length > 3 ? '…' : '');
      out.push({ slot, splitDayType: sdt, liftPreview });
    }
    return out;
  }, []);
}

export function useSessionView(
  sessionId: string | null | undefined,
): SessionView | null | undefined {
  return useLiveQuery(async () => {
    if (!sessionId) return null;
    return getSessionView(sessionId);
  }, [sessionId]);
}

export interface SessionLiftDetail {
  liftId: string;
  familyName: string;
  variantName: string;
  variantId: string;
  equipmentKind: EquipmentKind | null;
  sessionLift: NonNullable<SessionView['lifts'][number]['lift']>;
  sets: SessionSet[];
  splitDayType: SplitDayType | null;
  location: Location | null;
}

export function useSessionLift(
  sessionId: string | null | undefined,
  liftId: string | null | undefined,
): SessionLiftDetail | null | undefined {
  return useLiveQuery(async () => {
    if (!sessionId || !liftId) return null;
    const view = await getSessionView(sessionId);
    if (!view) return null;
    const found = view.lifts.find((l) => l.lift.id === liftId);
    if (!found) return null;
    return liftDetailFromView(view, found);
  }, [sessionId, liftId]);
}

/**
 * Returns every lift in the requested lift's superset group (in session
 * order). If the lift is not part of a superset, returns just that one.
 * The Lift screen uses this to render an entire superset on one page.
 */
export function useSessionLiftGroup(
  sessionId: string | null | undefined,
  liftId: string | null | undefined,
): SessionLiftDetail[] | null | undefined {
  return useLiveQuery(async () => {
    if (!sessionId || !liftId) return null;
    const view = await getSessionView(sessionId);
    if (!view) return null;
    const found = view.lifts.find((l) => l.lift.id === liftId);
    if (!found) return null;
    const groupId = found.lift.supersetGroupId;
    const lifts = groupId ? view.lifts.filter((l) => l.lift.supersetGroupId === groupId) : [found];
    return lifts.map((l) => liftDetailFromView(view, l));
  }, [sessionId, liftId]);
}

function liftDetailFromView(
  view: NonNullable<Awaited<ReturnType<typeof getSessionView>>>,
  found: NonNullable<Awaited<ReturnType<typeof getSessionView>>>['lifts'][number],
): SessionLiftDetail {
  return {
    liftId: found.lift.id,
    familyName: found.familyName,
    variantName: found.variant?.name ?? '(unknown)',
    variantId: found.lift.variantId,
    equipmentKind: found.variant?.equipmentKind ?? null,
    sessionLift: found.lift,
    sets: found.sets,
    splitDayType: view.splitDayType,
    location: view.location,
  };
}

export function useDefaultLocation(): Location | null | undefined {
  return useLiveQuery(async () => {
    const all = await getDb().location.toArray();
    return all[0] ?? null;
  }, []);
}
