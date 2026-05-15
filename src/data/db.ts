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

export const SCHEMA_VERSION = 1;

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
