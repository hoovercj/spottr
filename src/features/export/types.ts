import type {
  CardioEntry,
  LiftFamily,
  Location,
  LocationSupersetMemory,
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

export const EXPORT_FORMAT = 'workoutbuddy-export' as const;
export const EXPORT_FORMAT_VERSION = 1 as const;

export interface ExportPayload {
  format: typeof EXPORT_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  stores: {
    liftFamily: LiftFamily[];
    variant: Variant[];
    location: Location[];
    program: Program[];
    splitDayType: SplitDayType[];
    scheduleSlot: ScheduleSlot[];
    slotPlan: SlotPlan[];
    slotPlanSupersetGroup: SlotPlanSupersetGroup[];
    locationSupersetMemory: LocationSupersetMemory[];
    session: Session[];
    sessionLift: SessionLift[];
    sessionSet: SessionSet[];
    cardioEntry: CardioEntry[];
    stretchEntry: StretchEntry[];
    migrationLog: MigrationLogEntry[];
  };
}

export interface ExportRecord {
  timestamp: string;
  filename: string;
  byteSize: number;
  destinationKind: 'local-directory' | 'download' | 'google-drive';
  /**
   * Drive-only: id and revision id of the JSON file after a successful
   * upload. The next export uses these to detect concurrent writes from
   * another device — if Drive's current `headRevisionId` no longer matches,
   * we know somebody else wrote in between and refuse to overwrite.
   */
  driveFileId?: string;
  driveRevisionId?: string;
}

export type ExportFailureReason =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'AUTH_EXPIRED'
  | 'PERMISSION_REVOKED'
  | 'PICKER_DISMISSED'
  | 'UNSUPPORTED_BROWSER'
  | 'WRITE_FAILED'
  /** Drive-only: the remote file has been written by another device since
   * we last synced; pushing would clobber that change. The UI surfaces a
   * "restore from Drive first" prompt instead of overwriting. */
  | 'REMOTE_NEWER';

export interface ExportFailure {
  timestamp: string;
  reason: ExportFailureReason;
  message: string;
}
