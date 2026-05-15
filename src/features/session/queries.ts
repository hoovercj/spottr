/**
 * Reads + planning helpers for the active workout.
 *
 * Selection rules:
 *   - "Today's slot" defaults to the slot immediately after the last completed one,
 *     skipping rest slots (FR18). User can override; override does not re-baseline
 *     (FR18). Lookup is by program isActive flag.
 */

import { getDb } from '@/data/db';
import { addDays, parseLocalDate, shortDayLabel, toLocalDateString } from '@/data/calendarDate';
import type {
  Location,
  Program,
  ScheduleSlot,
  Session,
  SessionLift,
  SessionSet,
  SlotPlan,
  SlotPlanSupersetGroup,
  SplitDayType,
  Variant,
} from '@/data/types';

export interface PlannedSlotView {
  slot: ScheduleSlot;
  splitDayType: SplitDayType;
  plans: SlotPlan[];
  supersetGroups: SlotPlanSupersetGroup[];
  liftFamilyNames: Map<string, string>;
  variants: Map<string, Variant>;
}

export async function getActiveProgram(): Promise<Program | null> {
  const all = await getDb().program.toArray();
  return all.find((p) => p.isActive) ?? null;
}

export async function getProgramSlotsOrdered(programId: string): Promise<ScheduleSlot[]> {
  return getDb().scheduleSlot.where('programId').equals(programId).sortBy('orderIndex');
}

/**
 * The effective calendar date a Session "counts toward" on the routine-week
 * view. Prefers an explicit `Session.calendarDate`; falls back to the local
 * date portion of `Session.startedAt`.
 */
export function sessionCalendarDate(session: Session): string {
  if (session.calendarDate) return session.calendarDate;
  return toLocalDateString(new Date(session.startedAt));
}

export interface RoutineDayView {
  calendarDate: string;
  dayLabel: string;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  slot: ScheduleSlot;
  splitDayType: SplitDayType;
  plans: SlotPlan[];
  liftFamilyNames: Map<string, string>;
  variants: Map<string, Variant>;
  completedSessionId: string | null;
}

export interface RoutineWeekView {
  program: Program;
  /** YYYY-MM-DD of the routine cycle's first visible day in the current week. */
  startDate: string;
  days: RoutineDayView[];
}

/**
 * 7-card routine-week view (Home screen).
 *
 * For a 7-day routine, the week is anchored on the routine's start
 * day-of-week (e.g., Monday for Cody's PPL) and shows that day through the
 * sixth day after it. Today's calendar date is in there exactly once.
 *
 * For shorter (sub-7-day) routines, the same 7-card layout is returned, but
 * the displayed range starts on the ISO Monday of the current local week
 * (the anchor still drives slot selection per day). MVP target is 7-day.
 */
export async function getRoutineWeekView(
  referenceDate: Date = new Date(),
): Promise<RoutineWeekView | null> {
  const db = getDb();
  const program = await getActiveProgram();
  if (!program?.anchorDate) return null;
  const slots = await getProgramSlotsOrdered(program.id);
  if (slots.length === 0) return null;

  // Find the start of this week's visible range.
  const refLocal = toLocalDateString(referenceDate);
  const length = slots.length;
  const startDate = computeWeekStart(program.anchorDate, refLocal, length);

  // Build day candidates.
  const dayDates: string[] = [];
  for (let i = 0; i < 7; i++) dayDates.push(addDays(startDate, i));

  // Fetch completed sessions for the active program; we'll match by
  // (calendarDate, scheduleSlotId). Pulling them all is cheap at MVP scale
  // and dodges Dexie index ergonomics for a calendarDate range.
  const completedSessions = await db.session.where('state').equals('COMPLETED').toArray();

  const days: RoutineDayView[] = [];
  for (const calendarDate of dayDates) {
    const slot = slotForDate(program, calendarDate, slots);
    if (!slot) continue;
    const splitDayType = await db.splitDayType.get(slot.splitDayTypeId);
    if (!splitDayType) continue;
    const plans = await db.slotPlan.where('scheduleSlotId').equals(slot.id).sortBy('orderIndex');
    const families = await db.liftFamily.bulkGet(plans.map((p) => p.liftFamilyId));
    const variantIds = plans
      .map((p) => p.defaultVariantId)
      .filter((id): id is string => Boolean(id));
    const variants = await db.variant.bulkGet(variantIds);

    const completed = completedSessions.find(
      (s) => sessionCalendarDate(s) === calendarDate && s.scheduleSlotId === slot.id,
    );

    days.push({
      calendarDate,
      dayLabel: shortDayLabel(calendarDate),
      isToday: calendarDate === refLocal,
      isPast: calendarDate < refLocal,
      isFuture: calendarDate > refLocal,
      slot,
      splitDayType,
      plans,
      liftFamilyNames: new Map(
        families.filter((f): f is NonNullable<typeof f> => Boolean(f)).map((f) => [f.id, f.name]),
      ),
      variants: new Map(
        variants.filter((v): v is NonNullable<typeof v> => Boolean(v)).map((v) => [v.id, v]),
      ),
      completedSessionId: completed?.id ?? null,
    });
  }

  return { program, startDate, days };
}

function slotIndexForDate(anchorDate: string, date: string, length: number): number {
  const diff = Math.floor(
    (parseLocalDate(date).getTime() - parseLocalDate(anchorDate).getTime()) / (24 * 60 * 60 * 1000),
  );
  return ((diff % length) + length) % length;
}

function slotForDate(program: Program, date: string, slots: ScheduleSlot[]): ScheduleSlot | null {
  if (!program.anchorDate) return null;
  const idx = slotIndexForDate(program.anchorDate, date, slots.length);
  return slots[idx] ?? null;
}

/**
 * The first visible day of the routine-week. For a 7-day routine, this is
 * the anchor's day-of-week within the reference date's local calendar week.
 * For shorter routines the visible window is the local ISO-Monday week.
 */
function computeWeekStart(anchorDate: string, refDate: string, length: number): string {
  if (length === 7) {
    const idx = slotIndexForDate(anchorDate, refDate, 7);
    return addDays(refDate, -idx);
  }
  // Non-7-day routine: align to local ISO Monday.
  const d = parseLocalDate(refDate);
  const dow = d.getDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? 6 : dow - 1;
  return addDays(refDate, -offset);
}

/**
 * Today's slot purely via the anchor calendar (no `lastCompletedAt`
 * heuristic). Returns null if no active program / anchor.
 */
export async function getTodaySlotByAnchor(
  referenceDate: Date = new Date(),
): Promise<ScheduleSlot | null> {
  const program = await getActiveProgram();
  if (!program?.anchorDate) return null;
  const slots = await getProgramSlotsOrdered(program.id);
  if (slots.length === 0) return null;
  return slotForDate(program, toLocalDateString(referenceDate), slots);
}

/**
 * Legacy default-slot computation based on `lastCompletedAt`. New surfaces
 * prefer `getRoutineWeekView` / `getTodaySlotByAnchor`.
 */
export async function getDefaultSlotForToday(): Promise<ScheduleSlot | null> {
  const program = await getActiveProgram();
  if (!program) return null;
  const slots = await getProgramSlotsOrdered(program.id);
  if (slots.length === 0) return null;

  // Find the most recently completed slot.
  const completed = slots.filter((s) => s.lastCompletedAt);
  let candidateIndex: number;
  if (completed.length === 0) {
    candidateIndex = 0;
  } else {
    const last = completed.reduce((acc, s) =>
      (s.lastCompletedAt ?? '') > (acc.lastCompletedAt ?? '') ? s : acc,
    );
    candidateIndex = (slots.indexOf(last) + 1) % slots.length;
  }

  // Skip rest slots up to one full cycle.
  for (let i = 0; i < slots.length; i++) {
    const idx = (candidateIndex + i) % slots.length;
    const slot = slots[idx]!;
    const sdt = await getDb().splitDayType.get(slot.splitDayTypeId);
    if (sdt && !sdt.isRest) return slot;
  }
  return null;
}

export async function getPlannedSlotView(slotId: string): Promise<PlannedSlotView | null> {
  const db = getDb();
  const slot = await db.scheduleSlot.get(slotId);
  if (!slot) return null;
  const splitDayType = await db.splitDayType.get(slot.splitDayTypeId);
  if (!splitDayType) return null;
  const plans = await db.slotPlan.where('scheduleSlotId').equals(slotId).sortBy('orderIndex');
  const supersetGroups = await db.slotPlanSupersetGroup
    .where('scheduleSlotId')
    .equals(slotId)
    .toArray();
  const liftFamilyIds = plans.map((p) => p.liftFamilyId);
  const families = await db.liftFamily.bulkGet(liftFamilyIds);
  const variantIds = plans.map((p) => p.defaultVariantId).filter((id): id is string => Boolean(id));
  const variants = await db.variant.bulkGet(variantIds);

  return {
    slot,
    splitDayType,
    plans,
    supersetGroups,
    liftFamilyNames: new Map(
      families.filter((f): f is NonNullable<typeof f> => Boolean(f)).map((f) => [f.id, f.name]),
    ),
    variants: new Map(
      variants.filter((v): v is NonNullable<typeof v> => Boolean(v)).map((v) => [v.id, v]),
    ),
  };
}

export async function getActiveSession(): Promise<Session | null> {
  const rows = await getDb().live.session.where('state').equals('ACTIVE').toArray();
  if (rows.length === 0) return null;
  return rows.reduce((acc, s) => (s.startedAt > acc.startedAt ? s : acc));
}

export interface SessionLiftView {
  lift: SessionLift;
  familyName: string;
  variant: Variant | null;
  sets: SessionSet[];
}

export interface SessionView {
  session: Session;
  splitDayType: SplitDayType | null;
  location: Location | null;
  lifts: SessionLiftView[];
  supersetGroups: SlotPlanSupersetGroup[];
}

export async function getSessionView(sessionId: string): Promise<SessionView | null> {
  const db = getDb();
  const session = await db.session.get(sessionId);
  if (!session) return null;

  const slot = session.scheduleSlotId
    ? ((await db.scheduleSlot.get(session.scheduleSlotId)) ?? null)
    : null;
  const splitDayType = slot ? ((await db.splitDayType.get(slot.splitDayTypeId)) ?? null) : null;
  const location = (await db.location.get(session.locationId)) ?? null;

  const sessionLifts = await db.sessionLift
    .where('sessionId')
    .equals(sessionId)
    .sortBy('orderIndex');
  const liftFamilyIds = [...new Set(sessionLifts.map((s) => s.liftFamilyId))];
  const variantIds = [...new Set(sessionLifts.map((s) => s.variantId))];
  const [families, variants] = await Promise.all([
    db.liftFamily.bulkGet(liftFamilyIds),
    db.variant.bulkGet(variantIds),
  ]);
  const familyName = new Map(
    families.filter((f): f is NonNullable<typeof f> => Boolean(f)).map((f) => [f.id, f.name]),
  );
  const variantMap = new Map(
    variants.filter((v): v is NonNullable<typeof v> => Boolean(v)).map((v) => [v.id, v]),
  );

  const lifts: SessionLiftView[] = [];
  for (const lift of sessionLifts) {
    const sets = await db.sessionSet.where('sessionLiftId').equals(lift.id).sortBy('orderIndex');
    lifts.push({
      lift,
      familyName: familyName.get(lift.liftFamilyId) ?? '(unknown)',
      variant: variantMap.get(lift.variantId) ?? null,
      sets,
    });
  }

  const supersetGroups = slot
    ? await db.slotPlanSupersetGroup.where('scheduleSlotId').equals(slot.id).toArray()
    : [];

  return { session, splitDayType, location, lifts, supersetGroups };
}
