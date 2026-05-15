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
    'Enumerate every (variant, planned rep range) bucket that has at least one logged set. Use when: starting any question about a specific lift — call this first to discover the variantId values and rep ranges that actually exist in the user\'s history. Don\'t use: for trend data — that\'s get_progress_series. Returns `{ buckets: Array<{ variantId, variantName, liftFamilyId, liftFamilyName, plannedRepsMin, plannedRepsMax, isBodyweight }> }`.',
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
    'Completed workout sessions, newest first. Use when: "what did I do this week / yesterday / since [date]" or for a session recap. Don\'t use: for trend or PR questions — use get_progress_series or get_prs. Returns `{ sessions: Array<{ sessionId, date YYYY-MM-DD, workoutName, locationName, loggedSets, plannedSets, liftFamilies[] }> }`. Default `limit` 20; pass `sinceDate` (YYYY-MM-DD) for a lower bound.',
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
    'Full breakdown of one session: every lift, every set, planned vs logged. Use when: "tell me about [date]\'s workout" or after list_recent_sessions when the user wants depth. Don\'t use: to compare across sessions — call multiple times or use get_variant_history. Returns `{ sessionId, date, workoutName, locationName, units, lifts: [{ liftFamily, variant, sets: [{ orderIndex, plannedReps, plannedRange, loggedWeight, loggedReps }] }] }`. `sessionId` comes from list_recent_sessions or get_progress_series.',
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
    'Every logged set for a given variant, newest first — full per-set detail (not just the top set). Use when: the user wants to see all reps/weights for a lift, or when comparing technique drift across sets. Don\'t use: for "what\'s my PR" — that\'s get_prs. For trend lines — that\'s get_progress_series. Returns `{ variantName, liftFamilyName, units, history: [{ sessionId, date, workoutName, sets: [{ loggedWeight, loggedReps, plannedRange }] }] }`. Filter by passing both `plannedRepsMin` and `plannedRepsMax` together, and/or `sinceDate`.',
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
    'Top set per session for each requested (variant, rep range) bucket — the same data the Progress chart plots. Use when: "how has X trended" / "am I getting stronger on X". Don\'t use: for an all-time PR (use get_prs) or for a single session detail (use get_session_detail). Returns `{ units, series: [{ variantName, liftFamilyName, plannedRepsMin, plannedRepsMax, metric: \'weight\'|\'reps\', points: [{ date, value }] }] }`. Discover bucket IDs via list_chartable_buckets first.',
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
    'The user\'s currently active program: every split day, the lifts planned on it, and each lift\'s planned sets/rep ranges. Use when: "what does my routine look like" / "what\'s scheduled". Don\'t use: to ask what they actually did — that\'s list_recent_sessions / get_session_detail. The active program name is also stated in the system prompt, so calling this just to learn that name is unnecessary. Returns `{ programName, splitDays: [{ orderIndex, dayName, isRest, lifts: [{ liftFamily, defaultVariant, plannedSets: [{ plannedReps, plannedWeight }] }] }] }`.',
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
/* get_prs                                                                  */
/* ----------------------------------------------------------------------- */

interface PrsArgs {
  variantId?: string;
  liftFamilyId?: string;
}

interface PrOut {
  variantId: string;
  variantName: string;
  liftFamilyId: string;
  liftFamilyName: string;
  plannedRepsMin: number;
  plannedRepsMax: number;
  bestSet: {
    sessionId: string;
    date: string;
    loggedWeight: number;
    loggedReps: number;
  };
}

const getPrs: ToolSpec<PrsArgs, { units: Units; prs: PrOut[] }> = {
  name: 'get_prs',
  description:
    'Best logged set ever for each (variant, rep range) bucket — i.e., the all-time personal record per training scheme. Use when: "what\'s my PR on X" / "show me my records". Don\'t use: for trend lines (get_progress_series) or per-session detail (get_variant_history). Returns `{ units, prs: Array<{ variantId, variantName, liftFamilyName, plannedRepsMin, plannedRepsMax, bestSet: { sessionId, date, loggedWeight, loggedReps } }> }`. Optional filters: `variantId` (one variant) or `liftFamilyId` (one family).',
  mutates: false,
  risk: 'read',
  jsonSchema: {
    type: 'object',
    properties: {
      variantId: { type: 'string', description: 'Scope to one variant.' },
      liftFamilyId: { type: 'string', description: 'Scope to one lift family.' },
    },
    additionalProperties: false,
  },
  async run(args) {
    const db = getDb();
    const units = await userUnits();

    // Build per-session location-units map once so we can normalize
    // weights at compare time without re-querying.
    const sessions = await db.live.session.where('state').equals('COMPLETED').toArray();
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const locationIds = [...new Set(sessions.map((s) => s.locationId))];
    const locations = await db.live.location.bulkGet(locationIds);
    const locationById = new Map(
      locations.filter((l): l is NonNullable<typeof l> => Boolean(l)).map((l) => [l.id, l]),
    );

    // Pull the candidate sessionLifts. If a variantId or familyId
    // filter is set, narrow at the lift level — cheaper than scanning
    // every set in the database.
    let lifts;
    if (args.variantId) {
      lifts = await db.live.sessionLift.where('variantId').equals(args.variantId).toArray();
    } else if (args.liftFamilyId) {
      lifts = await db.live.sessionLift
        .where('liftFamilyId')
        .equals(args.liftFamilyId)
        .toArray();
    } else {
      lifts = await db.live.sessionLift.toArray();
    }
    // Keep only lifts that belong to a completed session in scope.
    const liftsInScope = lifts.filter((l) => sessionById.has(l.sessionId));
    if (liftsInScope.length === 0) return { units, prs: [] };

    interface Acc {
      variantId: string;
      plannedRepsMin: number;
      plannedRepsMax: number;
      bestWeight: number; // normalized to user units
      bestReps: number;
      bestSessionId: string;
      bestDate: string;
    }
    const accByKey = new Map<string, Acc>();

    for (const lift of liftsInScope) {
      const session = sessionById.get(lift.sessionId)!;
      const sessionUnits: Units = locationById.get(session.locationId)?.units ?? units;
      const sets = await db.live.sessionSet
        .where('sessionLiftId')
        .equals(lift.id)
        .toArray();
      for (const s of sets) {
        if (!s.loggedAt || s.loggedWeight == null || s.loggedReps == null) continue;
        if (s.loggedWeight === 0) continue;
        const normalized = convertWeight(s.loggedWeight, sessionUnits, units);
        const key = `${s.variantId}::${s.plannedRepsMin}-${s.plannedRepsMax}`;
        const prev = accByKey.get(key);
        if (!prev || normalized > prev.bestWeight) {
          accByKey.set(key, {
            variantId: s.variantId,
            plannedRepsMin: s.plannedRepsMin,
            plannedRepsMax: s.plannedRepsMax,
            bestWeight: Math.round(normalized * 10) / 10,
            bestReps: s.loggedReps,
            bestSessionId: lift.sessionId,
            bestDate: sessionCalendarDate(session),
          });
        }
      }
    }

    // Hydrate variant + family names for display.
    const variantIds = [...new Set([...accByKey.values()].map((a) => a.variantId))];
    const variants = await db.live.variant.bulkGet(variantIds);
    const variantById = new Map(
      variants.filter((v): v is NonNullable<typeof v> => Boolean(v)).map((v) => [v.id, v]),
    );
    const familyIds = [
      ...new Set(variants.map((v) => v?.liftFamilyId).filter(Boolean) as string[]),
    ];
    const families = await db.live.liftFamily.bulkGet(familyIds);
    const familyById = new Map(
      families.filter((f): f is NonNullable<typeof f> => Boolean(f)).map((f) => [f.id, f]),
    );

    const prs: PrOut[] = [];
    for (const a of accByKey.values()) {
      const v = variantById.get(a.variantId);
      if (!v) continue;
      const f = familyById.get(v.liftFamilyId);
      if (!f) continue;
      prs.push({
        variantId: v.id,
        variantName: v.name,
        liftFamilyId: f.id,
        liftFamilyName: f.name,
        plannedRepsMin: a.plannedRepsMin,
        plannedRepsMax: a.plannedRepsMax,
        bestSet: {
          sessionId: a.bestSessionId,
          date: a.bestDate,
          loggedWeight: a.bestWeight,
          loggedReps: a.bestReps,
        },
      });
    }
    prs.sort(
      (a, b) =>
        a.liftFamilyName.localeCompare(b.liftFamilyName) ||
        a.variantName.localeCompare(b.variantName) ||
        a.plannedRepsMin - b.plannedRepsMin ||
        a.plannedRepsMax - b.plannedRepsMax,
    );
    return { units, prs };
  },
};

/* ----------------------------------------------------------------------- */
/* get_weekly_volume                                                        */
/* ----------------------------------------------------------------------- */

interface WeeklyVolumeArgs {
  weeks?: number;
  liftFamilyId?: string;
}

interface WeeklyVolumeOut {
  units: Units;
  weeks: Array<{
    weekStart: string; // Monday, YYYY-MM-DD
    totalSets: number;
    totalReps: number;
    totalTonnage: number;
    byFamily: Record<string, { sets: number; reps: number; tonnage: number }>;
  }>;
}

const getWeeklyVolume: ToolSpec<WeeklyVolumeArgs, WeeklyVolumeOut> = {
  name: 'get_weekly_volume',
  description:
    'Per-ISO-week training volume: sets, reps, and tonnage (Σ weight × reps), optionally broken down by lift family. Use when: "how much am I lifting" / "am I overtraining" / "compare this week\'s volume to last week" / "show me a weekly breakdown". Don\'t use: for per-session or per-lift detail (get_session_detail / get_variant_history). Returns `{ units, weeks: [{ weekStart YYYY-MM-DD Monday, totalSets, totalReps, totalTonnage, byFamily: Record<liftFamily, { sets, reps, tonnage }> }] }`. Default window: 8 weeks back through today.',
  mutates: false,
  risk: 'read',
  jsonSchema: {
    type: 'object',
    properties: {
      weeks: { type: 'integer', description: 'Number of weeks to return (1-52). Default 8.' },
      liftFamilyId: { type: 'string', description: 'Optional: scope tonnage to one family.' },
    },
    additionalProperties: false,
  },
  async run(args) {
    const db = getDb();
    const units = await userUnits();
    const weeksRequested = clamp(args.weeks ?? 8, 1, 52);

    const sessions = await db.live.session.where('state').equals('COMPLETED').toArray();
    if (sessions.length === 0) return { units, weeks: [] };

    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const locationIds = [...new Set(sessions.map((s) => s.locationId))];
    const locations = await db.live.location.bulkGet(locationIds);
    const locationById = new Map(
      locations.filter((l): l is NonNullable<typeof l> => Boolean(l)).map((l) => [l.id, l]),
    );

    // Window boundaries. Today's Monday → minus (weeksRequested - 1) weeks.
    const today = new Date();
    const windowStart = mondayOfWeek(today);
    windowStart.setDate(windowStart.getDate() - (weeksRequested - 1) * 7);
    const windowStartIso = isoDate(windowStart);

    // Bucket: weekStart YYYY-MM-DD → totals (+ family map).
    const buckets = new Map<
      string,
      {
        totalSets: number;
        totalReps: number;
        totalTonnage: number;
        byFamily: Map<string, { sets: number; reps: number; tonnage: number }>;
      }
    >();
    // Pre-seed every week in the window so empty weeks still appear.
    for (let i = 0; i < weeksRequested; i++) {
      const d = new Date(windowStart);
      d.setDate(d.getDate() + i * 7);
      buckets.set(isoDate(d), {
        totalSets: 0,
        totalReps: 0,
        totalTonnage: 0,
        byFamily: new Map(),
      });
    }

    // Walk lifts (optionally filtered to one family) → their sets.
    const lifts = args.liftFamilyId
      ? await db.live.sessionLift.where('liftFamilyId').equals(args.liftFamilyId).toArray()
      : await db.live.sessionLift.toArray();
    const familyIds = [...new Set(lifts.map((l) => l.liftFamilyId))];
    const families = await db.live.liftFamily.bulkGet(familyIds);
    const familyName = new Map(
      families.filter((f): f is NonNullable<typeof f> => Boolean(f)).map((f) => [f.id, f.name]),
    );

    for (const lift of lifts) {
      const session = sessionById.get(lift.sessionId);
      if (!session) continue;
      const date = sessionCalendarDate(session);
      if (date < windowStartIso) continue;
      const weekStart = isoDate(mondayOfWeek(parseLocalDate(date)));
      const bucket = buckets.get(weekStart);
      if (!bucket) continue; // outside window
      const sessionUnits: Units = locationById.get(session.locationId)?.units ?? units;
      const sets = await db.live.sessionSet
        .where('sessionLiftId')
        .equals(lift.id)
        .toArray();
      const family = familyName.get(lift.liftFamilyId) ?? '(unknown)';
      let famAcc = bucket.byFamily.get(family);
      if (!famAcc) {
        famAcc = { sets: 0, reps: 0, tonnage: 0 };
        bucket.byFamily.set(family, famAcc);
      }
      for (const s of sets) {
        if (!s.loggedAt || s.loggedWeight == null || s.loggedReps == null) continue;
        const weight = convertWeight(s.loggedWeight, sessionUnits, units);
        const reps = s.loggedReps;
        const tonnage = weight * reps;
        bucket.totalSets += 1;
        bucket.totalReps += reps;
        bucket.totalTonnage += tonnage;
        famAcc.sets += 1;
        famAcc.reps += reps;
        famAcc.tonnage += tonnage;
      }
    }

    const weeks: WeeklyVolumeOut['weeks'] = [];
    const sortedWeekStarts = [...buckets.keys()].sort();
    for (const ws of sortedWeekStarts) {
      const b = buckets.get(ws)!;
      const byFamily: Record<string, { sets: number; reps: number; tonnage: number }> = {};
      for (const [fname, fAcc] of b.byFamily) {
        byFamily[fname] = {
          sets: fAcc.sets,
          reps: fAcc.reps,
          tonnage: Math.round(fAcc.tonnage * 10) / 10,
        };
      }
      weeks.push({
        weekStart: ws,
        totalSets: b.totalSets,
        totalReps: b.totalReps,
        totalTonnage: Math.round(b.totalTonnage * 10) / 10,
        byFamily,
      });
    }
    return { units, weeks };
  },
};

function mondayOfWeek(d: Date): Date {
  // Local-time Monday anchor. JS getDay: Sun=0, Mon=1, ..., Sat=6.
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = out.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  out.setDate(out.getDate() + offset);
  return out;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseLocalDate(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

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
  getPrs,
  getWeeklyVolume,
] as unknown as ToolSpec[];

export function getToolByName(name: string): ToolSpec | undefined {
  return TOOLS.find((t) => t.name === name);
}
