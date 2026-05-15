import Dexie from 'dexie';
import type { EntityTable } from 'dexie';
import type {
  CardioEntry,
  LiftFamily,
  Location,
  LocationSupersetMemory,
  MetaRow,
  MigrationLogEntry,
  Program,
  ScheduleSlot,
  Session,
  SessionLift,
  SessionSet,
  SlotPlan,
  SlotPlanSupersetGroup,
  SplitDayType,
  StretchEntry,
  Variant,
} from '@/data/types';

export const SCHEMA_VERSION = 2;

/**
 * Stores that participate in the multi-device merge. Each row in these
 * tables carries an `updatedAt` (auto-stamped by the create/update hooks
 * below) and an optional `deletedAt` (tombstone). `meta` and `migrationLog`
 * are deliberately excluded — they're per-device state.
 */
const MERGEABLE_TABLES = new Set([
  'liftFamily',
  'variant',
  'location',
  'program',
  'splitDayType',
  'scheduleSlot',
  'slotPlan',
  'slotPlanSupersetGroup',
  'locationSupersetMemory',
  'session',
  'sessionLift',
  'sessionSet',
  'cardioEntry',
  'stretchEntry',
]);

export function isMergeableTableName(name: string): boolean {
  return MERGEABLE_TABLES.has(name);
}

export class SpottrDB extends Dexie {
  meta!: EntityTable<MetaRow, 'key'>;
  liftFamily!: EntityTable<LiftFamily, 'id'>;
  variant!: EntityTable<Variant, 'id'>;
  location!: EntityTable<Location, 'id'>;
  program!: EntityTable<Program, 'id'>;
  splitDayType!: EntityTable<SplitDayType, 'id'>;
  scheduleSlot!: EntityTable<ScheduleSlot, 'id'>;
  slotPlan!: EntityTable<SlotPlan, 'id'>;
  slotPlanSupersetGroup!: EntityTable<SlotPlanSupersetGroup, 'id'>;
  locationSupersetMemory!: EntityTable<LocationSupersetMemory, 'id'>;
  session!: EntityTable<Session, 'id'>;
  sessionLift!: EntityTable<SessionLift, 'id'>;
  sessionSet!: EntityTable<SessionSet, 'id'>;
  cardioEntry!: EntityTable<CardioEntry, 'id'>;
  stretchEntry!: EntityTable<StretchEntry, 'id'>;
  migrationLog!: EntityTable<MigrationLogEntry, 'id'>;

  // IDB databases are keyed by name; changing this orphans any prior
  // `workout-buddy` database (data is still in browser storage but no
  // longer reachable from the app). Restore via Settings → Restore from
  // file if you had data under the old name.
  constructor(name = 'spottr') {
    super(name);

    this.version(1).stores({
      meta: '&key',
      liftFamily: '&id, name, isCustom',
      variant: '&id, liftFamilyId, [liftFamilyId+name], isAlias',
      location: '&id, name',
      program: '&id, isActive',
      splitDayType: '&id, programId',
      scheduleSlot: '&id, programId, [programId+orderIndex], splitDayTypeId',
      slotPlan: '&id, scheduleSlotId, [scheduleSlotId+orderIndex], liftFamilyId',
      slotPlanSupersetGroup: '&id, scheduleSlotId',
      locationSupersetMemory: '&id, [locationId+liftFamilyIdA+liftFamilyIdB]',
      session: '&id, scheduleSlotId, state, startedAt, completedAt',
      sessionLift: '&id, sessionId, [sessionId+orderIndex], liftFamilyId, variantId',
      sessionSet:
        '&id, sessionLiftId, [sessionLiftId+orderIndex], [variantId+plannedRepsMin+plannedRepsMax+loggedAt]',
      cardioEntry: '&id, sessionId',
      stretchEntry: '&id, sessionId',
      migrationLog: '&id, timestamp',
    });

    // v2: per-row updatedAt / deletedAt for multi-device Drive merge.
    // No index changes (we filter tombstones in-memory and merge by id),
    // so the stores definition is unchanged. The upgrade callback
    // backfills updatedAt on every existing row.
    this.version(2)
      .stores({
        meta: '&key',
        liftFamily: '&id, name, isCustom',
        variant: '&id, liftFamilyId, [liftFamilyId+name], isAlias',
        location: '&id, name',
        program: '&id, isActive',
        splitDayType: '&id, programId',
        scheduleSlot: '&id, programId, [programId+orderIndex], splitDayTypeId',
        slotPlan: '&id, scheduleSlotId, [scheduleSlotId+orderIndex], liftFamilyId',
        slotPlanSupersetGroup: '&id, scheduleSlotId',
        locationSupersetMemory: '&id, [locationId+liftFamilyIdA+liftFamilyIdB]',
        session: '&id, scheduleSlotId, state, startedAt, completedAt',
        sessionLift: '&id, sessionId, [sessionId+orderIndex], liftFamilyId, variantId',
        sessionSet:
          '&id, sessionLiftId, [sessionLiftId+orderIndex], [variantId+plannedRepsMin+plannedRepsMax+loggedAt]',
        cardioEntry: '&id, sessionId',
        stretchEntry: '&id, sessionId',
        migrationLog: '&id, timestamp',
      })
      .upgrade(async (tx) => {
        const now = new Date().toISOString();
        for (const tableName of MERGEABLE_TABLES) {
          const tbl = tx.table(tableName);
          await tbl.toCollection().modify((row: Record<string, unknown>) => {
            // Prefer createdAt if available — gives a more accurate sort
            // when two devices both backfill before they meet for the
            // first time. Fall back to "now" for rows without it.
            if (!row.updatedAt) row.updatedAt = row.createdAt ?? now;
          });
        }
      });

    // Auto-stamp updatedAt on every insert / update across the mergeable
    // tables. The hooks fire per row even inside bulk operations.
    for (const tableName of MERGEABLE_TABLES) {
      const table = this.table(tableName) as unknown as {
        hook(ev: 'creating', cb: (pk: string, obj: Record<string, unknown>) => void): void;
        hook(
          ev: 'updating',
          cb: (mods: Record<string, unknown>) => Record<string, unknown> | undefined,
        ): void;
      };
      table.hook('creating', (_pk, obj) => {
        if (!obj.updatedAt) obj.updatedAt = new Date().toISOString();
      });
      table.hook('updating', (mods) => {
        // Only stamp if the caller didn't already set it (e.g. the merge
        // path explicitly preserves the remote row's updatedAt).
        if (mods.updatedAt === undefined) {
          return { ...mods, updatedAt: new Date().toISOString() };
        }
        return undefined;
      });
    }
  }
}

let _db: SpottrDB | undefined;

export function getDb(): SpottrDB {
  if (!_db) {
    _db = new SpottrDB();
  }
  return _db;
}

/** Test-only: replace the singleton with a fresh in-memory DB. */
export function _resetDbForTest(name?: string): SpottrDB {
  if (_db) {
    _db.close();
  }
  _db = new SpottrDB(name);
  return _db;
}
