import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import type { ExportFailure, ExportRecord } from '@/features/export/types';
import type { DestinationKind } from '@/features/export/destination';
import type { ExportTrigger } from '@/features/export/service';

const META_LAST_OK = 'export:lastOk';
const META_LAST_FAIL = 'export:lastFail';
const META_KIND_KEY = 'export:destinationKind';

export interface ExportStatusView {
  destinationKind: DestinationKind | null;
  lastOk: (ExportRecord & { trigger: ExportTrigger }) | null;
  lastFail: ExportFailure | null;
}

/**
 * Live-query the export status. Returns `undefined` until the first read
 * resolves; callers should treat that as "loading."
 */
export function useExportStatus(): ExportStatusView | undefined {
  return useLiveQuery(async () => {
    const db = getDb();
    const [okRow, failRow, kindRow] = await Promise.all([
      db.meta.get(META_LAST_OK),
      db.meta.get(META_LAST_FAIL),
      db.meta.get(META_KIND_KEY),
    ]);
    return {
      destinationKind: (kindRow?.value as DestinationKind | undefined) ?? null,
      lastOk: (okRow?.value as (ExportRecord & { trigger: ExportTrigger }) | undefined) ?? null,
      lastFail: (failRow?.value as ExportFailure | undefined) ?? null,
    };
  }, []);
}

export function isOnboardingComplete(view: ExportStatusView | undefined): boolean {
  return view?.destinationKind != null;
}
