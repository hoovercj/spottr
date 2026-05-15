/**
 * Hooks for resolving a session by id (live, view, or edit modes).
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import { getSessionView, type SessionView } from '@/features/session/queries';
import type { Session } from '@/data/types';
import { modeFor, useSessionEditStore, type SessionMode } from '@/features/session/editStore';

export function useSessionById(sessionId: string | null | undefined): Session | null | undefined {
  return useLiveQuery(async () => {
    if (!sessionId) return null;
    return (await getDb().session.get(sessionId)) ?? null;
  }, [sessionId]);
}

export function useSessionViewById(
  sessionId: string | null | undefined,
): SessionView | null | undefined {
  return useLiveQuery(async () => {
    if (!sessionId) return null;
    return getSessionView(sessionId);
  }, [sessionId]);
}

export function useSessionMode(sessionId: string | null | undefined): SessionMode {
  const session = useSessionById(sessionId);
  const editingId = useSessionEditStore((s) => s.editingSessionId);
  if (!sessionId) return 'view';
  return modeFor(session?.state, editingId, sessionId);
}
