import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import type { CardioEntry, StretchEntry } from '@/data/types';

export function useStretchForSession(
  sessionId: string | null | undefined,
): StretchEntry | null | undefined {
  return useLiveQuery(async () => {
    if (!sessionId) return null;
    return (await getDb().stretchEntry.where('sessionId').equals(sessionId).first()) ?? null;
  }, [sessionId]);
}

export function useCardioForSession(
  sessionId: string | null | undefined,
): CardioEntry | null | undefined {
  return useLiveQuery(async () => {
    if (!sessionId) return null;
    return (await getDb().cardioEntry.where('sessionId').equals(sessionId).first()) ?? null;
  }, [sessionId]);
}
