/**
 * Progress-chart data fetchers.
 *
 * One series per **(variant, planned rep range)**. A family like "Bench
 * Press" with both barbell and dumbbell data plots as two distinct lines —
 * and each is further split when sets were logged at different planned rep
 * ranges (e.g. 5×5 vs 3×8-12). Mixing those would combine two training
 * modalities on different weight scales and read as noise; splitting keeps
 * each scheme's progression legible without estimating 1RM.
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
  /** Stable Recharts dataKey: `${variantId}::${repMin}-${repMax}`. */
  seriesKey: string;
  variantId: string;
  liftFamilyId: string;
  liftFamilyName: string;
  variantName: string;
  /** Planned rep range that defines this series. */
  plannedRepsMin: number;
  plannedRepsMax: number;
  metric: SeriesMetric;
  points: SeriesPoint[];
}

export interface ProgressChartData {
  units: Units;
  series: ProgressSeries[];
  /** Merged date-keyed rows for Recharts, keyed by series.seriesKey. */
  rows: Array<{ date: string; [seriesKey: string]: number | string }>;
  /** Whether any series uses the weight axis — drives the left axis render. */
  hasWeight: boolean;
  /** Whether any series uses the reps axis — drives the right axis render. */
  hasReps: boolean;
}

export function repRangeLabel(min: number, max: number): string {
  return min === max ? String(min) : `${min}-${max}`;
}

export function makeSeriesKey(variantId: string, min: number, max: number): string {
  return `${variantId}::${min}-${max}`;
}

export interface ProgressBucket {
  variantId: string;
  plannedRepsMin: number;
  plannedRepsMax: number;
}

/** Parses a seriesKey back into its bucket parts, or null if malformed. */
export function parseSeriesKey(seriesKey: string): ProgressBucket | null {
  const idx = seriesKey.indexOf('::');
  if (idx < 0) return null;
  const variantId = seriesKey.slice(0, idx);
  const rangePart = seriesKey.slice(idx + 2);
  const dash = rangePart.indexOf('-');
  if (dash < 0) return null;
  const min = Number(rangePart.slice(0, dash));
  const max = Number(rangePart.slice(dash + 1));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { variantId, plannedRepsMin: min, plannedRepsMax: max };
}

/**
 * A (variant, planned rep range) bucket that is selectable on the chart.
 * The picker browses buckets — not bare variants — so each line a user adds
 * is an unambiguous training scheme rather than a mix of e.g. 5×5 and 8-12.
 */
export interface ChartableBucket {
  seriesKey: string;
  variantId: string;
  variantName: string;
  liftFamilyId: string;
  liftFamilyName: string;
  plannedRepsMin: number;
  plannedRepsMax: number;
  isBodyweight: boolean;
}

/**
 * Returns every (variant, planned rep range) bucket that has at least one
 * logged set. The picker browses these so the user adds one training scheme
 * at a time (e.g. "Bench Press · Barbell · 5×5") rather than a variant whose
 * rep ranges may differ between sessions.
 */
export async function getAllChartableBucketsPure(): Promise<ChartableBucket[]> {
  const db = getDb();
  const sets = await db.live.sessionSet.toArray();
  if (sets.length === 0) return [];

  // Aggregate unique (variantId, min, max) for any logged set.
  const bucketIds = new Map<string, ProgressBucket>();
  for (const s of sets) {
    if (!s.loggedAt) continue;
    const key = makeSeriesKey(s.variantId, s.plannedRepsMin, s.plannedRepsMax);
    if (!bucketIds.has(key)) {
      bucketIds.set(key, {
        variantId: s.variantId,
        plannedRepsMin: s.plannedRepsMin,
        plannedRepsMax: s.plannedRepsMax,
      });
    }
  }
  if (bucketIds.size === 0) return [];

  const variantIds = [...new Set([...bucketIds.values()].map((b) => b.variantId))];
  const variants = await db.live.variant.bulkGet(variantIds);
  const variantById = new Map(
    variants.filter((v): v is NonNullable<typeof v> => Boolean(v)).map((v) => [v.id, v]),
  );
  const familyIds = [...new Set(variants.map((v) => v?.liftFamilyId).filter(Boolean))] as string[];
  const families = await db.live.liftFamily.bulkGet(familyIds);
  const familyById = new Map(
    families.filter((f): f is NonNullable<typeof f> => Boolean(f)).map((f) => [f.id, f]),
  );

  const out: ChartableBucket[] = [];
  for (const [seriesKey, b] of bucketIds) {
    const variant = variantById.get(b.variantId);
    if (!variant) continue;
    const fam = familyById.get(variant.liftFamilyId);
    if (!fam) continue;
    out.push({
      seriesKey,
      variantId: variant.id,
      variantName: variant.name,
      liftFamilyId: fam.id,
      liftFamilyName: fam.name,
      plannedRepsMin: b.plannedRepsMin,
      plannedRepsMax: b.plannedRepsMax,
      isBodyweight: variant.equipmentKind === 'bodyweight',
    });
  }
  out.sort(
    (a, b) =>
      a.liftFamilyName.localeCompare(b.liftFamilyName) ||
      a.variantName.localeCompare(b.variantName) ||
      a.plannedRepsMin - b.plannedRepsMin ||
      a.plannedRepsMax - b.plannedRepsMax,
  );
  return out;
}

export function useAllChartableBuckets(): ChartableBucket[] | undefined {
  return useLiveQuery(() => getAllChartableBucketsPure(), []);
}

/**
 * Default chart selection: for each non-rest slot in the active routine,
 * take the first slot plan's first planned set's `(variantId, repMin, repMax)`
 * as the seed bucket. Deduped by seriesKey so two slots that share an
 * exact (variant, rep range) bucket only seed once.
 */
export async function getDefaultProgressBucketsPure(): Promise<ProgressBucket[]> {
  const db = getDb();
  const programs = await db.live.program.toArray();
  const program = programs.find((p) => p.isActive);
  if (!program) return [];
  const slots = await db.live.scheduleSlot
    .where('programId')
    .equals(program.id)
    .sortBy('orderIndex');
  const out: ProgressBucket[] = [];
  const seen = new Set<string>();
  for (const slot of slots) {
    const sdt = await db.live.splitDayType.get(slot.splitDayTypeId);
    if (sdt?.isRest) continue;
    const plans = await db.live.slotPlan
      .where('scheduleSlotId')
      .equals(slot.id)
      .sortBy('orderIndex');
    const first = plans[0];
    if (!first?.defaultVariantId) continue;
    const firstSet = first.plannedSets[0];
    if (!firstSet) continue;
    const seriesKey = makeSeriesKey(
      first.defaultVariantId,
      firstSet.plannedRepsMin,
      firstSet.plannedRepsMax,
    );
    if (seen.has(seriesKey)) continue;
    seen.add(seriesKey);
    out.push({
      variantId: first.defaultVariantId,
      plannedRepsMin: firstSet.plannedRepsMin,
      plannedRepsMax: firstSet.plannedRepsMax,
    });
  }
  return out;
}

export function useDefaultProgressBuckets(): ProgressBucket[] | undefined {
  return useLiveQuery(() => getDefaultProgressBucketsPure(), []);
}

/**
 * Pure progress-data fetcher — emits exactly one series per requested
 * bucket (variant + rep range), filtering sets to the bucket's exact
 * (plannedRepsMin, plannedRepsMax). Best-per-session is taken within
 * the bucket, never across rep ranges.
 */
export async function getProgressDataPure(
  buckets: ProgressBucket[],
  userUnits: Units,
): Promise<ProgressChartData> {
  const db = getDb();
  if (buckets.length === 0) {
    return { units: userUnits, series: [], rows: [], hasWeight: false, hasReps: false };
  }

  // De-dupe (variant, min, max) requests so a caller passing duplicates
  // doesn't produce duplicate lines.
  const wanted = new Map<string, ProgressBucket>();
  for (const b of buckets) {
    wanted.set(makeSeriesKey(b.variantId, b.plannedRepsMin, b.plannedRepsMax), b);
  }
  const wantedVariantIds = [...new Set([...wanted.values()].map((b) => b.variantId))];

  const variants = await db.live.variant.bulkGet(wantedVariantIds);
  const variantById = new Map(
    variants.filter((v): v is NonNullable<typeof v> => Boolean(v)).map((v) => [v.id, v]),
  );
  const familyIds = [...new Set(variants.map((v) => v?.liftFamilyId).filter(Boolean))] as string[];
  const families = await db.live.liftFamily.bulkGet(familyIds);
  const familyById = new Map(
    families.filter((f): f is NonNullable<typeof f> => Boolean(f)).map((f) => [f.id, f]),
  );

  // Pre-cache sessions + locations for unit resolution.
  const sessions = await db.live.session.where('state').equals('COMPLETED').toArray();
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const locationIds = [...new Set(sessions.map((s) => s.locationId))];
  const locations = await db.live.location.bulkGet(locationIds);
  const locationById = new Map(
    locations.filter((l): l is NonNullable<typeof l> => Boolean(l)).map((l) => [l.id, l]),
  );

  // Walk lifts once per requested variant, accumulating per-bucket best-per-session.
  interface BucketAcc {
    bestPerSession: Map<string, number>;
  }
  const accBySeriesKey = new Map<string, BucketAcc>();
  for (const key of wanted.keys()) accBySeriesKey.set(key, { bestPerSession: new Map() });

  for (const vid of wantedVariantIds) {
    const variant = variantById.get(vid);
    if (!variant) continue;
    const isBodyweight = variant.equipmentKind === 'bodyweight';
    const metric: SeriesMetric = isBodyweight ? 'reps' : 'weight';

    const lifts = await db.live.sessionLift.where('variantId').equals(vid).toArray();
    for (const lift of lifts) {
      const session = sessionById.get(lift.sessionId);
      if (!session) continue;
      const sessionUnits: Units = locationById.get(session.locationId)?.units ?? userUnits;
      const sets = await db.live.sessionSet.where('sessionLiftId').equals(lift.id).toArray();
      for (const s of sets) {
        if (!s.loggedAt) continue;
        const key = makeSeriesKey(s.variantId, s.plannedRepsMin, s.plannedRepsMax);
        const acc = accBySeriesKey.get(key);
        if (!acc) continue; // set is in a rep-range bucket we weren't asked about
        let value: number;
        if (metric === 'weight') {
          if (s.loggedWeight == null) continue;
          // Skip 0-weight rows from a weight series — usually a tracked
          // variant that the user logged as bodyweight by accident; plotting
          // those would bottom-out the axis.
          if (s.loggedWeight === 0) continue;
          value = convertWeight(s.loggedWeight, sessionUnits, userUnits);
        } else {
          if (s.loggedReps == null) continue;
          value = s.loggedReps;
        }
        const prev = acc.bestPerSession.get(session.id);
        if (prev == null || value > prev) acc.bestPerSession.set(session.id, value);
      }
    }
  }

  const series: ProgressSeries[] = [];
  for (const [seriesKey, bucket] of wanted) {
    const variant = variantById.get(bucket.variantId);
    if (!variant) continue;
    const family = familyById.get(variant.liftFamilyId);
    if (!family) continue;
    const isBodyweight = variant.equipmentKind === 'bodyweight';
    const metric: SeriesMetric = isBodyweight ? 'reps' : 'weight';
    const acc = accBySeriesKey.get(seriesKey);
    if (!acc) continue;
    const points: SeriesPoint[] = [];
    for (const [sessionId, value] of acc.bestPerSession) {
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
      seriesKey,
      variantId: bucket.variantId,
      liftFamilyId: family.id,
      liftFamilyName: family.name,
      variantName: variant.name,
      plannedRepsMin: bucket.plannedRepsMin,
      plannedRepsMax: bucket.plannedRepsMax,
      metric,
      points,
    });
  }
  series.sort(
    (a, b) =>
      a.liftFamilyName.localeCompare(b.liftFamilyName) ||
      a.variantName.localeCompare(b.variantName) ||
      a.plannedRepsMin - b.plannedRepsMin ||
      a.plannedRepsMax - b.plannedRepsMax,
  );

  const dateMap = new Map<string, { date: string; [k: string]: number | string }>();
  for (const s of series) {
    for (const p of s.points) {
      const row = dateMap.get(p.date) ?? { date: p.date };
      row[s.seriesKey] = p.value;
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

export function useProgressData(buckets: ProgressBucket[]): ProgressChartData | undefined {
  const settings = useUserSettings();
  // Stable string key so the deps array shape doesn't depend on buckets.length.
  const key = buckets
    .map((b) => makeSeriesKey(b.variantId, b.plannedRepsMin, b.plannedRepsMax))
    .sort()
    .join(',');
  return useLiveQuery(async () => {
    if (settings === undefined) return undefined;
    return getProgressDataPure(buckets, settings.units);
  }, [settings?.units, key]);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
