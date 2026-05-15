import type { ExportPayload } from '@/features/export/types';

const CSV_HEADER = [
  'sessionId',
  'sessionStartedAt',
  'sessionCompletedAt',
  'locationName',
  'splitDayTypeName',
  'liftFamilyName',
  'variantName',
  'isFreeWeight',
  'sessionLiftOrderIndex',
  'sessionLiftNote',
  'sessionLiftScope',
  'supersetGroupId',
  'setOrderIndex',
  'plannedWeight',
  'plannedRepsMin',
  'plannedRepsMax',
  'plannedReps',
  'loggedWeight',
  'loggedReps',
  'loggedAt',
] as const;

export function serializeCsv(payload: ExportPayload): string {
  const rows: string[] = [CSV_HEADER.join(',')];

  const variants = new Map(payload.stores.variant.map((v) => [v.id, v]));
  const families = new Map(payload.stores.liftFamily.map((f) => [f.id, f]));
  const locations = new Map(payload.stores.location.map((l) => [l.id, l]));
  const sdt = new Map(payload.stores.splitDayType.map((s) => [s.id, s]));
  const slots = new Map(payload.stores.scheduleSlot.map((s) => [s.id, s]));
  const sessions = new Map(payload.stores.session.map((s) => [s.id, s]));
  const sessionLifts = new Map(payload.stores.sessionLift.map((sl) => [sl.id, sl]));

  for (const set of payload.stores.sessionSet) {
    const sl = sessionLifts.get(set.sessionLiftId);
    if (!sl) continue;
    const session = sessions.get(sl.sessionId);
    if (!session) continue;
    const slot = session.scheduleSlotId ? slots.get(session.scheduleSlotId) : undefined;
    const splitDay = slot ? sdt.get(slot.splitDayTypeId) : undefined;
    const family = families.get(sl.liftFamilyId);
    const variant = variants.get(sl.variantId);
    const location = locations.get(session.locationId);

    rows.push(
      [
        session.id,
        session.startedAt,
        session.completedAt ?? '',
        location?.name ?? '',
        splitDay?.name ?? '',
        family?.name ?? '',
        variant?.name ?? '',
        variant?.isFreeWeight ? 'true' : 'false',
        String(sl.orderIndex),
        sl.note ?? '',
        sl.scope,
        sl.supersetGroupId ?? '',
        String(set.orderIndex),
        set.plannedWeight != null ? String(set.plannedWeight) : '',
        String(set.plannedRepsMin),
        String(set.plannedRepsMax),
        String(set.plannedReps),
        set.loggedWeight != null ? String(set.loggedWeight) : '',
        set.loggedReps != null ? String(set.loggedReps) : '',
        set.loggedAt ?? '',
      ]
        .map(escapeCsvCell)
        .join(','),
    );
  }

  return rows.join('\r\n') + '\r\n';
}

function escapeCsvCell(value: string): string {
  if (value === '') return '';
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
