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
  destinationKind: 'local-directory' | 'download';
}

export type ExportFailureReason =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'AUTH_EXPIRED'
  | 'PERMISSION_REVOKED'
  | 'PICKER_DISMISSED'
  | 'UNSUPPORTED_BROWSER'
  | 'WRITE_FAILED';

export interface ExportFailure {
  timestamp: string;
  reason: ExportFailureReason;
  message: string;
}
