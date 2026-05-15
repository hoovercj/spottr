import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import { sessionCalendarDate } from '@/features/session/queries';
import type { Session, SessionLift, SessionSet, Variant } from '@/data/types';

export interface CompletedSessionView {
  session: Session;
  splitDayTypeName: string;
  locationName: string;
  /** Local-time YYYY-MM-DD this session counts toward. */
  calendarDate: string;
  loggedSetCount: number;
  plannedSetCount: number;
  /** 0..100 integer; loggedSetCount / plannedSetCount when planned > 0. */
  completionPercent: number;
}

export function useCompletedSessions(): CompletedSessionView[] | undefined {
  return useLiveQuery(async () => {
    const db = getDb();
    const sessions = await db.session.where('state').equals('COMPLETED').toArray();
    sessions.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    const results: CompletedSessionView[] = [];
    for (const session of sessions) {
      const slot = session.scheduleSlotId
        ? await db.scheduleSlot.get(session.scheduleSlotId)
        : null;
      const sdt = slot ? await db.splitDayType.get(slot.splitDayTypeId) : null;
      const location = await db.location.get(session.locationId);
      const lifts = await db.sessionLift.where('sessionId').equals(session.id).toArray();
      const liftIds = lifts.map((l) => l.id);
      let loggedCount = 0;
      let plannedCount = 0;
      for (const lid of liftIds) {
        const sets = await db.sessionSet.where('sessionLiftId').equals(lid).toArray();
        plannedCount += sets.length;
        loggedCount += sets.filter((s) => s.loggedAt).length;
      }
      const pct = plannedCount > 0 ? Math.round((loggedCount / plannedCount) * 100) : 0;
      results.push({
        session,
        splitDayTypeName: sdt?.name ?? (session.scheduleSlotId ? '—' : 'Ad-hoc workout'),
        locationName: location?.name ?? '—',
        calendarDate: sessionCalendarDate(session),
        loggedSetCount: loggedCount,
        plannedSetCount: plannedCount,
        completionPercent: pct,
      });
    }
    return results;
  }, []);
}

/** YYYY-MM key of the month a session belongs to. */
export function sessionMonthKey(view: CompletedSessionView): string {
  return view.calendarDate.slice(0, 7);
}

export interface VariantHistoryRow {
  session: Session;
  sessionLift: SessionLift;
  sets: SessionSet[];
  splitDayTypeName: string;
  locationName: string;
}

export function useVariantHistory(
  variantId: string | null,
  repRange?: { min: number; max: number },
): { variant: Variant | null; rows: VariantHistoryRow[] } | undefined {
  return useLiveQuery(async () => {
    if (!variantId) return { variant: null, rows: [] };
    const db = getDb();
    const variant = (await db.variant.get(variantId)) ?? null;
    const canonicalId = variant?.isAlias && variant.canonicalId ? variant.canonicalId : variantId;

    const lifts = await db.sessionLift.where('variantId').equals(canonicalId).toArray();
    const rows: VariantHistoryRow[] = [];
    for (const lift of lifts) {
      const session = await db.session.get(lift.sessionId);
      if (!session || session.state !== 'COMPLETED') continue;
      const sets = await db.sessionSet.where('sessionLiftId').equals(lift.id).toArray();
      const filtered = repRange
        ? sets.filter((s) => s.plannedRepsMin === repRange.min && s.plannedRepsMax === repRange.max)
        : sets;
      if (filtered.length === 0) continue;
      const slot = session.scheduleSlotId
        ? await db.scheduleSlot.get(session.scheduleSlotId)
        : null;
      const sdt = slot ? await db.splitDayType.get(slot.splitDayTypeId) : null;
      const location = await db.location.get(session.locationId);
      rows.push({
        session,
        sessionLift: lift,
        sets: filtered.sort((a, b) => a.orderIndex - b.orderIndex),
        splitDayTypeName: sdt?.name ?? '—',
        locationName: location?.name ?? '—',
      });
    }
    rows.sort((a, b) => (a.session.startedAt < b.session.startedAt ? 1 : -1));
    return { variant, rows };
  }, [variantId, repRange?.min, repRange?.max]);
}

export interface SessionDetailView {
  session: Session;
  splitDayTypeName: string;
  locationName: string;
  /** Units the session was logged in (location override → user default → lb fallback). */
  locationUnits: 'lb' | 'kg' | null;
  lifts: Array<{
    lift: SessionLift;
    familyName: string;
    variant: Variant | null;
    sets: SessionSet[];
  }>;
  cardio: { modality: string; durationMin: number | null; skipped: boolean } | null;
  stretched: boolean | null;
}

export function useSessionDetail(sessionId: string | null): SessionDetailView | null | undefined {
  return useLiveQuery(async () => {
    if (!sessionId) return null;
    const db = getDb();
    const session = await db.session.get(sessionId);
    if (!session) return null;
    const slot = session.scheduleSlotId ? await db.scheduleSlot.get(session.scheduleSlotId) : null;
    const sdt = slot ? await db.splitDayType.get(slot.splitDayTypeId) : null;
    const location = await db.location.get(session.locationId);
    const lifts = await db.sessionLift.where('sessionId').equals(sessionId).sortBy('orderIndex');
    const liftViews: SessionDetailView['lifts'] = [];
    for (const lift of lifts) {
      const fam = await db.liftFamily.get(lift.liftFamilyId);
      const variant = (await db.variant.get(lift.variantId)) ?? null;
      const sets = await db.sessionSet.where('sessionLiftId').equals(lift.id).sortBy('orderIndex');
      liftViews.push({
        lift,
        familyName: fam?.name ?? '—',
        variant,
        sets,
      });
    }
    const cardio = await db.cardioEntry.where('sessionId').equals(sessionId).first();
    const stretch = await db.stretchEntry.where('sessionId').equals(sessionId).first();
    return {
      session,
      splitDayTypeName: sdt?.name ?? '—',
      locationName: location?.name ?? '—',
      locationUnits: location?.units ?? null,
      lifts: liftViews,
      cardio: cardio
        ? {
            modality: cardio.modality,
            durationMin: cardio.durationMin ?? null,
            skipped: cardio.skipped,
          }
        : null,
      stretched: stretch ? stretch.done : null,
    };
  }, [sessionId]);
}
