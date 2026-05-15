/**
 * Authoritative type shapes for everything persisted to IndexedDB.
 *
 * IDs are uuid v4 strings. Timestamps are ISO 8601 UTC strings
 * (`new Date().toISOString()`); rendering is done via `Intl.DateTimeFormat`.
 */

export type Iso8601 = string;

/**
 * Per-row sync metadata, mixed into every store the multi-device Drive
 * merge touches. `updatedAt` is stamped automatically by Dexie hooks on
 * every insert/update; `deletedAt`, when set, marks the row as a tombstone
 * so the delete propagates across devices without being silently
 * resurrected by a stale push.
 *
 * `meta` and `migrationLog` deliberately do NOT carry these fields: meta is
 * per-device settings (local always wins), and the migration log is a
 * per-device journal.
 */
export interface SyncFields {
  /**
   * Stamped automatically by the Dexie `creating`/`updating` hooks (see
   * `src/data/db.ts`). Optional in the type so call sites don't have to
   * remember it; the merge function falls back to `createdAt` then ""
   * when the field is missing (e.g. payloads from a v1 build that never
   * ran the v2 upgrade).
   */
  updatedAt?: Iso8601;
  /** When non-null, the row is a tombstone. Read-paths filter these out. */
  deletedAt?: Iso8601;
}

export type Units = 'lb' | 'kg';

/** Conventional plate increment per unit (PRD §FR39). */
export const DEFAULT_INCREMENT: Record<Units, number> = {
  lb: 5,
  kg: 2.5,
};

/** Convert a weight between units. 1 lb = 0.45359237 kg exactly. */
export function convertWeight(value: number, from: Units, to: Units): number {
  if (from === to) return value;
  if (from === 'kg' && to === 'lb') return value / 0.45359237;
  return value * 0.45359237;
}

/** Closed vocabulary per PRD §FR2. User-defined custom variants are free strings. */
export const EQUIPMENT_KINDS = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'smith-machine',
  'custom',
] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

/** Default free-weight flag for each built-in kind (PRD §FR5). */
export const DEFAULT_IS_FREE_WEIGHT: Record<EquipmentKind, boolean> = {
  barbell: true,
  dumbbell: true,
  bodyweight: true,
  machine: false,
  cable: false,
  'smith-machine': false,
  custom: false, // forces explicit user choice on creation
};

export interface LiftFamily extends SyncFields {
  id: string;
  name: string;
  isCustom: boolean;
  createdAt: Iso8601;
}

export interface Variant extends SyncFields {
  id: string;
  liftFamilyId: string;
  name: string;
  equipmentKind: EquipmentKind;
  /** PRD §FR5 — required input on custom variant creation. */
  isFreeWeight: boolean;
  /** True after merge (FR6 / NFR21a). Aliased variants point to the canonical via canonicalId. */
  isAlias: boolean;
  canonicalId?: string;
  createdAt: Iso8601;
}

export interface Location extends SyncFields {
  id: string;
  name: string;
  /**
   * Override for the unit system used when logging weights at this location.
   * Travelers care about this — a hotel gym in Europe shows kg even when
   * the user's default is lb. When undefined, the user's default applies.
   */
  units?: Units;
  createdAt: Iso8601;
}

export interface Program extends SyncFields {
  id: string;
  name: string;
  isActive: boolean;
  /**
   * Calendar date (YYYY-MM-DD, local-time) on which the routine's slot at
   * `orderIndex = 0` falls. For a 7-day routine this acts as the "start
   * day-of-week"; for shorter routines it acts as the absolute start date
   * from which the cycle repeats. The home-screen week view computes the
   * slot for any given calendar day as
   * `((daysSinceAnchor % length) + length) % length`.
   *
   * Optional in the type to tolerate legacy rows; `initData` backfills it
   * on app start.
   */
  anchorDate?: string;
  createdAt: Iso8601;
}

/**
 * Named split-day type within a program (e.g., "Push", "Pull", "Legs", "Rest").
 * User-named, never enum (UX spec §Program-Shape Neutrality).
 */
export interface SplitDayType extends SyncFields {
  id: string;
  programId: string;
  name: string;
  /** True for explicit rest slots (no planned lifts). */
  isRest: boolean;
}

export interface ScheduleSlot extends SyncFields {
  id: string;
  programId: string;
  orderIndex: number;
  splitDayTypeId: string;
  lastCompletedAt?: Iso8601;
}

export interface PlannedSet {
  orderIndex: number;
  plannedWeight?: number;
  plannedRepsMin: number;
  plannedRepsMax: number;
}

export interface SlotPlan extends SyncFields {
  id: string;
  scheduleSlotId: string;
  orderIndex: number;
  liftFamilyId: string;
  defaultVariantId?: string;
  plannedSets: PlannedSet[];
}

/** Programmed superset group within a schedule slot (FR16). */
export interface SlotPlanSupersetGroup extends SyncFields {
  id: string;
  scheduleSlotId: string;
  slotPlanIds: string[];
  orderIndex: number;
}

/** Ad-hoc superset memory per location (FR33). */
export interface LocationSupersetMemory extends SyncFields {
  id: string;
  locationId: string;
  liftFamilyIdA: string;
  liftFamilyIdB: string;
  observedAt: Iso8601;
}

export type SessionState = 'ACTIVE' | 'COMPLETED';

export interface Session extends SyncFields {
  id: string;
  /**
   * Optional. Absent for ad-hoc workouts that aren't tied to a routine
   * slot. When absent, the session shows up in history but is not pinned
   * to a specific day card on the routine-week view.
   */
  scheduleSlotId?: string;
  locationId: string;
  startedAt: Iso8601;
  completedAt?: Iso8601;
  state: SessionState;
  /**
   * Local-time YYYY-MM-DD this session counts toward in the routine-week
   * view. Distinct from `startedAt`: doing Monday's missed workout on
   * Tuesday sets `calendarDate = Monday's date` so the green check lands
   * on Monday's card. When absent (legacy rows) the reader falls back to
   * the date portion of `startedAt`.
   */
  calendarDate?: string;
}

export type SessionLiftScope = 'planned' | 'session-only' | 'permanent-slot' | 'permanent-type';

export interface SessionLift extends SyncFields {
  id: string;
  sessionId: string;
  liftFamilyId: string;
  variantId: string;
  orderIndex: number;
  scope: SessionLiftScope;
  /** FR23b — single nullable note per (lift, session) pair. */
  note?: string;
  /** Ad-hoc or programmed superset group; resolved at session-start from slot-plan or memory. */
  supersetGroupId?: string;
}

export interface SessionSet extends SyncFields {
  id: string;
  sessionLiftId: string;
  /** Denormalized for the (variant, rep_range) compound index. */
  variantId: string;
  plannedRepsMin: number;
  plannedRepsMax: number;
  plannedWeight?: number;
  plannedReps: number;
  orderIndex: number;
  loggedWeight?: number;
  loggedReps?: number;
  /** Absent until the user taps the row's checkbox. */
  loggedAt?: Iso8601;
}

export type CardioModality =
  | 'exercise-bike'
  | 'stair-stepper'
  | 'treadmill'
  | 'outdoor-run'
  | 'rowing-erg';

export interface CardioEntry extends SyncFields {
  id: string;
  sessionId: string;
  modality: CardioModality;
  durationMin?: number;
  skipped: boolean;
  loggedAt: Iso8601;
}

export interface StretchEntry extends SyncFields {
  id: string;
  sessionId: string;
  done: boolean;
  loggedAt: Iso8601;
}

export type MigrationStatus = 'started' | 'completed' | 'failed';

export interface MigrationLogEntry {
  id: string;
  timestamp: Iso8601;
  versionFrom: number;
  versionTo: number;
  action: string;
  status: MigrationStatus;
  message: string;
}

/** Key-value singletons in the `meta` store. */
export interface MetaRow<K extends string = string, V = unknown> {
  key: K;
  value: V;
}

export interface UserSettings {
  units: Units;
  /** Plate increment in current units (5 lb or 2.5 kg). */
  weightIncrement: number;
}

/** Persisted across cold starts so we can detect first-run / show onboarding (FR47). */
export interface OnboardingState {
  exportDestinationConfigured: boolean;
  exportDirHandlePersisted: boolean;
  /** Per-user opt-in for accepting the persistent storage prompt. */
  persistentStorageRequested: boolean;
}
