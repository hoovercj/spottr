/**
 * The MVP read-only tool catalog. Every tool here is side-effect-free and
 * wraps an existing pure query so the chat can answer "how did my squats
 * trend" or "what did I lift on Tuesday" without writing anything.
 *
 * Output shapes are deliberately compact: raw IDs are kept (so follow-up
 * tool calls can pivot off them) but timestamps are normalized to local
 * YYYY-MM-DD strings via `sessionCalendarDate` and weights ride in the
 * user's units so the model doesn't have to reason about conversions.
 */

import { getDb } from '@/data/db';
import { sessionCalendarDate } from '@/features/session/queries';
import {
  getAllChartableBucketsPure,
  getProgressDataPure,
  type ProgressBucket,
} from '@/features/progress/queries';
import { convertWeight, type Units } from '@/data/types';
import { getUserSettings } from '@/features/settings/actions';
import type { Session } from '@/data/types';
import type { ToolSpec } from '@/features/ai/providers/types';

async function userUnits(): Promise<Units> {
  return (await getUserSettings()).units;
}

/* ----------------------------------------------------------------------- */
/* list_chartable_buckets                                                  */
/* ----------------------------------------------------------------------- */

interface ChartableBucketOut {
  variantId: string;
  variantName: string;
  liftFamilyId: string;
  liftFamilyName: string;
  plannedRepsMin: number;
  plannedRepsMax: number;
  isBodyweight: boolean;
}

const listChartableBuckets: ToolSpec<Record<string, never>, { buckets: ChartableBucketOut[] }> = {
  name: 'list_chartable_buckets',
  description:
    'Enumerate every (variant, planned rep range) bucket that has at least one logged set. Use this first to discover variantId values and valid rep ranges before calling get_variant_history or get_progress_series.',
  mutates: false,
  risk: 'read',
  jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run() {
    const all = await getAllChartableBucketsPure();
    return {
      buckets: all.map((b) => ({
        variantId: b.variantId,
        variantName: b.variantName,
        liftFamilyId: b.liftFamilyId,
        liftFamilyName: b.liftFamilyName,
        plannedRepsMin: b.plannedRepsMin,
        plannedRepsMax: b.plannedRepsMax,
        isBodyweight: b.isBodyweight,
      })),
    };
  },
};

/* ----------------------------------------------------------------------- */
/* list_recent_sessions                                                     */
/* ----------------------------------------------------------------------- */

interface RecentSessionArgs {
  limit?: number;
  sinceDate?: string;
}

interface RecentSessionOut {
  sessionId: string;
  date: string;
  workoutName: string;
  locationName: string;
  loggedSets: number;
  plannedSets: number;
  liftFamilies: string[];
}

const listRecentSessions: ToolSpec<RecentSessionArgs, { sessions: RecentSessionOut[] }> = {
  name: 'list_recent_sessions',
  description:
    'List completed workout sessions, most recent first. Returns one row per session with summary counts and the lift families present. Use `sinceDate` to bound the window (YYYY-MM-DD); default `limit` is 20.',
  mutates: false,
  risk: 'read',
  jsonSchema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', description: 'Max sessions to return (1-100). Default 20.' },
      sinceDate: {
        type: 'string',
        description: 'YYYY-MM-DD lower bound on session calendar date (inclusive).',
      },
    },
    additionalProperties: false,
  },
  async run(args) {
    const limit = clamp(args.limit ?? 20, 1, 100);
    const db = getDb();
    const all = await db.live.session.where('state').equals('COMPLETED').toArray();
    const filtered = args.sinceDate
      ? all.filter((s) => sessionCalendarDate(s) >= args.sinceDate!)
      : all;
    filtered.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    const out: RecentSessionOut[] = [];
    for (const session of filtered.slice(0, limit)) {
      out.push(await summarizeSession(session));
    }
    return { sessions: out };
  },
};

async function summarizeSession(session: Session): Promise<RecentSessionOut> {
  const db = getDb();
  const slot = session.scheduleSlotId
    ? await db.live.scheduleSlot.get(session.scheduleSlotId)
    : null;
  const sdt = slot ? await db.live.splitDayType.get(slot.splitDayTypeId) : null;
  const location = await db.live.location.get(session.locationId);
  const lifts = await db.live.sessionLift.where('sessionId').equals(session.id).toArray();
  let logged = 0;
  let planned = 0;
  const familyIds = new Set<string>();
  for (const lift of lifts) {
    familyIds.add(lift.liftFamilyId);
    const sets = await db.live.sessionSet.where('sessionLiftId').equals(lift.id).toArray();
    planned += sets.length;
    logged += sets.filter((s) => s.loggedAt).length;
  }
  const families = await db.live.liftFamily.bulkGet([...familyIds]);
  return {
    sessionId: session.id,
    date: sessionCalendarDate(session),
    workoutName: sdt?.name ?? (session.scheduleSlotId ? '—' : 'Ad-hoc workout'),
    locationName: location?.name ?? '—',
    loggedSets: logged,
    plannedSets: planned,
    liftFamilies: families
      .filter((f): f is NonNullable<typeof f> => Boolean(f))
      .map((f) => f.name),
  };
}

/* ----------------------------------------------------------------------- */
/* get_session_detail                                                       */
/* ----------------------------------------------------------------------- */

interface SessionDetailArgs {
  sessionId: string;
}

interface SessionDetailOut {
  sessionId: string;
  date: string;
  workoutName: string;
  locationName: string;
  units: Units;
  lifts: Array<{
    liftFamily: string;
    variant: string;
    sets: Array<{
      orderIndex: number;
      plannedReps: number;
      plannedRange: string;
      loggedWeight: number | null;
      loggedReps: number | null;
    }>;
  }>;
}

const getSessionDetail: ToolSpec<SessionDetailArgs, SessionDetailOut | { error: string }> = {
  name: 'get_session_detail',
  description:
    'Full breakdown of a single session: every lift, every set, planned vs logged. `sessionId` comes from list_recent_sessions or get_progress_series.',
  mutates: false,
  risk: 'read',
  jsonSchema: {
    type: 'object',
    properties: { sessionId: { type: 'string' } },
    required: ['sessionId'],
    additionalProperties: false,
  },
  async run(args) {
    const db = getDb();
    const session = await db.live.session.get(args.sessionId);
    if (!session) return { error: `Unknown sessionId: ${args.sessionId}` };
    const slot = session.scheduleSlotId
      ? await db.live.scheduleSlot.get(session.scheduleSlotId)
      : null;
    const sdt = slot ? await db.live.splitDayType.get(slot.splitDayTypeId) : null;
    const location = await db.live.location.get(session.locationId);
    const sessionUnits: Units = location?.units ?? (await userUnits());
    const lifts = await db.live.sessionLift
      .where('sessionId')
      .equals(args.sessionId)
      .sortBy('orderIndex');
    const liftViews: SessionDetailOut['lifts'] = [];
    for (const lift of lifts) {
      const fam = await db.live.liftFamily.get(lift.liftFamilyId);
      const variant = await db.live.variant.get(lift.variantId);
      const sets = await db.live.sessionSet
        .where('sessionLiftId')
        .equals(lift.id)
        .sortBy('orderIndex');
      liftViews.push({
        liftFamily: fam?.name ?? '(unknown)',
        variant: variant?.name ?? '(unknown)',
        sets: sets.map((s) => ({
          orderIndex: s.orderIndex,
          plannedReps: s.plannedReps,
          plannedRange:
            s.plannedRepsMin === s.plannedRepsMax
              ? `${s.plannedRepsMin}`
              : `${s.plannedRepsMin}-${s.plannedRepsMax}`,
          loggedWeight: s.loggedWeight ?? null,
          loggedReps: s.loggedReps ?? null,
        })),
      });
    }
    return {
      sessionId: session.id,
      date: sessionCalendarDate(session),
      workoutName: sdt?.name ?? (session.scheduleSlotId ? '—' : 'Ad-hoc workout'),
      locationName: location?.name ?? '—',
      units: sessionUnits,
      lifts: liftViews,
    };
  },
};

/* ----------------------------------------------------------------------- */
/* get_variant_history                                                      */
/* ----------------------------------------------------------------------- */

interface VariantHistoryArgs {
  variantId: string;
  plannedRepsMin?: number;
  plannedRepsMax?: number;
  sinceDate?: string;
}

interface VariantHistoryOut {
  variantName: string;
  liftFamilyName: string;
  units: Units;
  history: Array<{
    sessionId: string;
    date: string;
    workoutName: string;
    sets: Array<{
      loggedWeight: number | null;
      loggedReps: number | null;
      plannedRange: string;
    }>;
  }>;
}

const getVariantHistory: ToolSpec<VariantHistoryArgs, VariantHistoryOut | { error: string }> = {
  name: 'get_variant_history',
  description:
    'Every logged set for a given variant, newest first. Optionally filter by `plannedRepsMin`/`plannedRepsMax` (must be passed together) to isolate one training scheme, and `sinceDate` (YYYY-MM-DD) to bound the window.',
  mutates: false,
  risk: 'read',
  jsonSchema: {
    type: 'object',
    properties: {
      variantId: { type: 'string' },
      plannedRepsMin: { type: 'integer' },
      plannedRepsMax: { type: 'integer' },
      sinceDate: { type: 'string', description: 'YYYY-MM-DD inclusive lower bound.' },
    },
    required: ['variantId'],
    additionalProperties: false,
  },
  async run(args) {
    const db = getDb();
    const variant = await db.live.variant.get(args.variantId);
    if (!variant) return { error: `Unknown variantId: ${args.variantId}` };
    const family = await db.live.liftFamily.get(variant.liftFamilyId);
    const canonicalId = variant.isAlias && variant.canonicalId ? variant.canonicalId : variant.id;
    const lifts = await db.live.sessionLift.where('variantId').equals(canonicalId).toArray();
    const units = await userUnits();
    const history: VariantHistoryOut['history'] = [];
    const wantRange = args.plannedRepsMin != null && args.plannedRepsMax != null;
    for (const lift of lifts) {
      const session = await db.live.session.get(lift.sessionId);
      if (!session || session.state !== 'COMPLETED') continue;
      const date = sessionCalendarDate(session);
      if (args.sinceDate && date < args.sinceDate) continue;
      const setsRaw = await db.live.sessionSet
        .where('sessionLiftId')
        .equals(lift.id)
        .sortBy('orderIndex');
      const setsFiltered = wantRange
        ? setsRaw.filter(
            (s) =>
              s.plannedRepsMin === args.plannedRepsMin &&
              s.plannedRepsMax === args.plannedRepsMax,
          )
        : setsRaw;
      if (setsFiltered.length === 0) continue;
      const slot = session.scheduleSlotId
        ? await db.live.scheduleSlot.get(session.scheduleSlotId)
        : null;
      const sdt = slot ? await db.live.splitDayType.get(slot.splitDayTypeId) : null;
      const location = await db.live.location.get(session.locationId);
      const sessionUnits: Units = location?.units ?? units;
      history.push({
        sessionId: session.id,
        date,
        workoutName: sdt?.name ?? (session.scheduleSlotId ? '—' : 'Ad-hoc workout'),
        sets: setsFiltered.map((s) => ({
          loggedWeight:
            s.loggedWeight != null
              ? Math.round(convertWeight(s.loggedWeight, sessionUnits, units) * 10) / 10
              : null,
          loggedReps: s.loggedReps ?? null,
          plannedRange:
            s.plannedRepsMin === s.plannedRepsMax
              ? `${s.plannedRepsMin}`
              : `${s.plannedRepsMin}-${s.plannedRepsMax}`,
        })),
      });
    }
    history.sort((a, b) => (a.date < b.date ? 1 : -1));
    return {
      variantName: variant.name,
      liftFamilyName: family?.name ?? '(unknown)',
      units,
      history,
    };
  },
};

/* ----------------------------------------------------------------------- */
/* get_progress_series                                                      */
/* ----------------------------------------------------------------------- */

interface ProgressSeriesArgs {
  buckets: Array<{
    variantId: string;
    plannedRepsMin: number;
    plannedRepsMax: number;
  }>;
}

interface ProgressSeriesOut {
  units: Units;
  series: Array<{
    variantName: string;
    liftFamilyName: string;
    plannedRepsMin: number;
    plannedRepsMax: number;
    metric: 'weight' | 'reps';
    points: Array<{ date: string; value: number }>;
  }>;
}

const getProgressSeries: ToolSpec<ProgressSeriesArgs, ProgressSeriesOut> = {
  name: 'get_progress_series',
  description:
    'Top set per session for each requested (variant, rep range) bucket — the same data the Progress chart plots. Strength buckets return weights in the user units; bodyweight buckets return reps.',
  mutates: false,
  risk: 'read',
  jsonSchema: {
    type: 'object',
    properties: {
      buckets: {
        type: 'array',
        description: 'One or more (variant, rep range) buckets to plot.',
        items: {
          type: 'object',
          properties: {
            variantId: { type: 'string' },
            plannedRepsMin: { type: 'integer' },
            plannedRepsMax: { type: 'integer' },
          },
          required: ['variantId', 'plannedRepsMin', 'plannedRepsMax'],
        },
      },
    },
    required: ['buckets'],
    additionalProperties: false,
  },
  async run(args) {
    const units = await userUnits();
    const buckets: ProgressBucket[] = (args.buckets ?? []).map((b) => ({
      variantId: b.variantId,
      plannedRepsMin: b.plannedRepsMin,
      plannedRepsMax: b.plannedRepsMax,
    }));
    const data = await getProgressDataPure(buckets, units);
    return {
      units: data.units,
      series: data.series.map((s) => ({
        variantName: s.variantName,
        liftFamilyName: s.liftFamilyName,
        plannedRepsMin: s.plannedRepsMin,
        plannedRepsMax: s.plannedRepsMax,
        metric: s.metric,
        points: s.points,
      })),
    };
  },
};

/* ----------------------------------------------------------------------- */
/* get_active_routine                                                       */
/* ----------------------------------------------------------------------- */

interface ActiveRoutineOut {
  programName: string | null;
  splitDays: Array<{
    orderIndex: number;
    dayName: string;
    isRest: boolean;
    lifts: Array<{
      liftFamily: string;
      defaultVariant: string | null;
      plannedSets: Array<{
        plannedReps: string;
        plannedWeight: number | null;
      }>;
    }>;
  }>;
}

const getActiveRoutine: ToolSpec<Record<string, never>, ActiveRoutineOut> = {
  name: 'get_active_routine',
  description:
    'The user\'s currently active program: each split day, the lifts planned on it, and each lift\'s planned sets with rep ranges. Good for "what does my plan look like" questions.',
  mutates: false,
  risk: 'read',
  jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run() {
    const db = getDb();
    const programs = await db.live.program.toArray();
    const active = programs.find((p) => p.isActive) ?? null;
    if (!active) return { programName: null, splitDays: [] };
    const slots = await db.live.scheduleSlot
      .where('programId')
      .equals(active.id)
      .sortBy('orderIndex');
    const out: ActiveRoutineOut['splitDays'] = [];
    for (const slot of slots) {
      const sdt = await db.live.splitDayType.get(slot.splitDayTypeId);
      const plans = await db.live.slotPlan
        .where('scheduleSlotId')
        .equals(slot.id)
        .sortBy('orderIndex');
      const lifts: ActiveRoutineOut['splitDays'][number]['lifts'] = [];
      for (const plan of plans) {
        const family = await db.live.liftFamily.get(plan.liftFamilyId);
        const variant = plan.defaultVariantId
          ? await db.live.variant.get(plan.defaultVariantId)
          : null;
        lifts.push({
          liftFamily: family?.name ?? '(unknown)',
          defaultVariant: variant?.name ?? null,
          plannedSets: plan.plannedSets.map((ps) => ({
            plannedReps:
              ps.plannedRepsMin === ps.plannedRepsMax
                ? `${ps.plannedRepsMin}`
                : `${ps.plannedRepsMin}-${ps.plannedRepsMax}`,
            plannedWeight: ps.plannedWeight ?? null,
          })),
        });
      }
      out.push({
        orderIndex: slot.orderIndex,
        dayName: sdt?.name ?? '(unknown)',
        isRest: sdt?.isRest ?? false,
        lifts,
      });
    }
    return { programName: active.name, splitDays: out };
  },
};

/* ----------------------------------------------------------------------- */

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export const TOOLS: ToolSpec[] = [
  listChartableBuckets,
  listRecentSessions,
  getSessionDetail,
  getVariantHistory,
  getProgressSeries,
  getActiveRoutine,
] as unknown as ToolSpec[];

export function getToolByName(name: string): ToolSpec | undefined {
  return TOOLS.find((t) => t.name === name);
}
