/**
 * Progress-chart data fetchers.
 *
 * One series per **variant** (not per family). A family like "Bench Press"
 * with both barbell and dumbbell data plots as two distinct lines so the
 * user can see each variant's progression — and tag the picker prompt
 * accordingly.
 *
 * Weight-tracked variants (loggedWeight > 0) plot on the left Y axis in the
 * user's default units. Bodyweight variants (`equipmentKind === 'bodyweight'`
 * or a series whose every logged set has loggedWeight=0) plot on the right
 * Y axis as reps — they would otherwise bottom-out a weight chart and the
 * "reps" axis is where real progression on bodyweight movements shows up.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import { sessionCalendarDate } from '@/features/session/queries';
import { convertWeight, type Units } from '@/data/types';
import { useUserSettings } from '@/features/settings/hooks';

export type SeriesMetric = 'weight' | 'reps';

export interface SeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface ProgressSeries {
  /** Stable key for the line — variantId. */
  variantId: string;
  liftFamilyId: string;
  liftFamilyName: string;
  variantName: string;
  metric: SeriesMetric;
  points: SeriesPoint[];
}

export interface ProgressChartData {
  units: Units;
  series: ProgressSeries[];
  /** Merged date-keyed rows for Recharts. */
  rows: Array<{ date: string; [variantId: string]: number | string }>;
  /** Whether any series uses the weight axis — drives the left axis render. */
  hasWeight: boolean;
  /** Whether any series uses the reps axis — drives the right axis render. */
  hasReps: boolean;
}

export interface ChartableVariant {
  variantId: string;
  variantName: string;
  liftFamilyId: string;
  liftFamilyName: string;
  isBodyweight: boolean;
}

/**
 * Returns the catalog of variants that have at least one logged set in the
 * database. The picker uses this to:
 *   - show only families with any data on the chart-able list
 *   - prompt the user to choose a variant when a single family has data on
 *     more than one variant (e.g. Bench Press: barbell + machine)
 */
export async function getAllChartableVariantsPure(): Promise<ChartableVariant[]> {
  const db = getDb();
  const lifts = await db.sessionLift.toArray();
  if (lifts.length === 0) return [];
  const variantIds = [...new Set(lifts.map((l) => l.variantId))];
  const variants = await db.variant.bulkGet(variantIds);
  const familyIds = [...new Set(variants.map((v) => v?.liftFamilyId).filter(Boolean))] as string[];
  const families = await db.liftFamily.bulkGet(familyIds);
  const familyById = new Map(
    families.filter((f): f is NonNullable<typeof f> => Boolean(f)).map((f) => [f.id, f]),
  );

  // Restrict to variants that actually have a logged set somewhere.
  const liftIds = lifts.map((l) => l.id);
  const setsByLiftIdsChunked = await db.sessionSet.where('sessionLiftId').anyOf(liftIds).toArray();
  const liftsWithLogged = new Set<string>();
  for (const s of setsByLiftIdsChunked) {
    if (s.loggedAt) liftsWithLogged.add(s.sessionLiftId);
  }
  const variantHasLogged = new Set<string>();
  for (const l of lifts) {
    if (liftsWithLogged.has(l.id)) variantHasLogged.add(l.variantId);
  }

  const out: ChartableVariant[] = [];
  for (const v of variants) {
    if (!v) continue;
    if (!variantHasLogged.has(v.id)) continue;
    const fam = familyById.get(v.liftFamilyId);
    if (!fam) continue;
    out.push({
      variantId: v.id,
      variantName: v.name,
      liftFamilyId: fam.id,
      liftFamilyName: fam.name,
      isBodyweight: v.equipmentKind === 'bodyweight',
    });
  }
  out.sort(
    (a, b) =>
      a.liftFamilyName.localeCompare(b.liftFamilyName) ||
      a.variantName.localeCompare(b.variantName),
  );
  return out;
}

export function useAllChartableVariants(): ChartableVariant[] | undefined {
  return useLiveQuery(() => getAllChartableVariantsPure(), []);
}

/** Pure version of the default-variants query — used by the hook and tests. */
export async function getDefaultProgressVariantsPure(): Promise<string[]> {
  const db = getDb();
  const programs = await db.program.toArray();
  const program = programs.find((p) => p.isActive);
  if (!program) return [];
  const slots = await db.scheduleSlot.where('programId').equals(program.id).sortBy('orderIndex');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const slot of slots) {
    const sdt = await db.splitDayType.get(slot.splitDayTypeId);
    if (sdt?.isRest) continue;
    const plans = await db.slotPlan.where('scheduleSlotId').equals(slot.id).sortBy('orderIndex');
    const first = plans[0];
    if (!first?.defaultVariantId) continue;
    if (seen.has(first.defaultVariantId)) continue;
    seen.add(first.defaultVariantId);
    out.push(first.defaultVariantId);
  }
  return out;
}

/**
 * First-exercise default variant for each non-rest slot in the active
 * routine, deduped — the seed selection on the Progress tab.
 */
export function useDefaultProgressVariants(): string[] | undefined {
  return useLiveQuery(() => getDefaultProgressVariantsPure(), []);
}

/** Pure progress-data fetcher — exposed for tests and direct callers. */
export async function getProgressDataPure(
  variantIds: string[],
  userUnits: Units,
): Promise<ProgressChartData> {
  const db = getDb();
  if (variantIds.length === 0) {
    return { units: userUnits, series: [], rows: [], hasWeight: false, hasReps: false };
  }
  const variants = await db.variant.bulkGet(variantIds);
  const familyIds = [...new Set(variants.map((v) => v?.liftFamilyId).filter(Boolean))] as string[];
  const families = await db.liftFamily.bulkGet(familyIds);
  const familyById = new Map(
    families.filter((f): f is NonNullable<typeof f> => Boolean(f)).map((f) => [f.id, f]),
  );

  // Pre-cache sessions + locations for unit resolution.
  const sessions = await db.session.where('state').equals('COMPLETED').toArray();
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const locationIds = [...new Set(sessions.map((s) => s.locationId))];
  const locations = await db.location.bulkGet(locationIds);
  const locationById = new Map(
    locations.filter((l): l is NonNullable<typeof l> => Boolean(l)).map((l) => [l.id, l]),
  );

  const series: ProgressSeries[] = [];

  for (let i = 0; i < variantIds.length; i++) {
    const vid = variantIds[i]!;
    const variant = variants[i];
    if (!variant) continue;
    const family = familyById.get(variant.liftFamilyId);
    if (!family) continue;
    const isBodyweight = variant.equipmentKind === 'bodyweight';
    const metric: SeriesMetric = isBodyweight ? 'reps' : 'weight';

    const lifts = await db.sessionLift.where('variantId').equals(vid).toArray();
    const bestPerSession = new Map<string, number>();
    for (const lift of lifts) {
      const session = sessionById.get(lift.sessionId);
      if (!session) continue;
      const sessionUnits: Units = locationById.get(session.locationId)?.units ?? userUnits;
      const sets = await db.sessionSet.where('sessionLiftId').equals(lift.id).toArray();
      for (const s of sets) {
        if (!s.loggedAt) continue;
        if (metric === 'weight') {
          if (s.loggedWeight == null) continue;
          // Skip 0-weight rows from a weight series — usually a tracked
          // variant that the user logged as bodyweight by accident; plotting
          // those would bottom-out the axis.
          if (s.loggedWeight === 0) continue;
          const converted = convertWeight(s.loggedWeight, sessionUnits, userUnits);
          const prev = bestPerSession.get(session.id);
          if (prev == null || converted > prev) bestPerSession.set(session.id, converted);
        } else {
          if (s.loggedReps == null) continue;
          const reps = s.loggedReps;
          const prev = bestPerSession.get(session.id);
          if (prev == null || reps > prev) bestPerSession.set(session.id, reps);
        }
      }
    }

    const points: SeriesPoint[] = [];
    for (const [sessionId, value] of bestPerSession) {
      const session = sessionById.get(sessionId);
      if (!session) continue;
      points.push({
        date: sessionCalendarDate(session),
        value: metric === 'weight' ? round1(value) : value,
      });
    }
    points.sort((a, b) => (a.date < b.date ? -1 : 1));
    if (points.length === 0) continue;
    series.push({
      variantId: vid,
      liftFamilyId: family.id,
      liftFamilyName: family.name,
      variantName: variant.name,
      metric,
      points,
    });
  }

  const dateMap = new Map<string, { date: string; [k: string]: number | string }>();
  for (const s of series) {
    for (const p of s.points) {
      const row = dateMap.get(p.date) ?? { date: p.date };
      row[s.variantId] = p.value;
      dateMap.set(p.date, row);
    }
  }
  const rows = [...dateMap.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    units: userUnits,
    series,
    rows,
    hasWeight: series.some((s) => s.metric === 'weight'),
    hasReps: series.some((s) => s.metric === 'reps'),
  };
}

export function useProgressData(variantIds: string[]): ProgressChartData | undefined {
  const settings = useUserSettings();
  // Single-string key so deps array length doesn't vary with variantIds.
  const key = variantIds.join(',');
  return useLiveQuery(async () => {
    if (settings === undefined) return undefined;
    return getProgressDataPure(variantIds, settings.units);
  }, [settings?.units, key]);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
