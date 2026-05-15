/**
 * Session edit-mode store.
 *
 * A completed session can be opened in `view` or `edit` mode. Entering
 * edit mode snapshots the editable sessionSet values; Discard changes
 * restores from that snapshot; Save just exits edit mode (changes
 * persisted as they were made).
 *
 * Scope: edit mode only covers set-level values (loggedWeight,
 * loggedReps, loggedAt). Add-/remove-lift, add-/delete-set, variant
 * change, cardio/stretch — these are live-mode-only mutations. Edit
 * mode keeps the structural shape stable so snapshot restoration is
 * straightforward.
 */

import { create } from 'zustand';
import { getDb } from '@/data/db';
import { withWorkoutWriteLock } from '@/data/locks';
import type { SessionSet } from '@/data/types';

export interface SetSnapshot {
  id: string;
  loggedWeight?: number;
  loggedReps?: number;
  loggedAt?: string;
}

interface SessionEditState {
  editingSessionId: string | null;
  snapshot: SetSnapshot[] | null;
  enterEdit: (sessionId: string) => Promise<void>;
  discardEdit: () => Promise<void>;
  saveEdit: () => void;
}

export const useSessionEditStore = create<SessionEditState>((set, get) => ({
  editingSessionId: null,
  snapshot: null,

  enterEdit: async (sessionId) => {
    const db = getDb();
    const lifts = await db.sessionLift.where('sessionId').equals(sessionId).toArray();
    const liftIds = lifts.map((l) => l.id);
    const sets =
      liftIds.length > 0 ? await db.sessionSet.where('sessionLiftId').anyOf(liftIds).toArray() : [];
    const snapshot: SetSnapshot[] = sets.map((s) => ({
      id: s.id,
      ...(s.loggedWeight !== undefined ? { loggedWeight: s.loggedWeight } : {}),
      ...(s.loggedReps !== undefined ? { loggedReps: s.loggedReps } : {}),
      ...(s.loggedAt !== undefined ? { loggedAt: s.loggedAt } : {}),
    }));
    set({ editingSessionId: sessionId, snapshot });
  },

  discardEdit: async () => {
    const { snapshot } = get();
    if (!snapshot) {
      set({ editingSessionId: null, snapshot: null });
      return;
    }
    const db = getDb();
    await withWorkoutWriteLock(async () => {
      await db.transaction('rw', [db.sessionSet], async () => {
        for (const snap of snapshot) {
          const current = await db.sessionSet.get(snap.id);
          if (!current) continue;
          const next: SessionSet = {
            id: current.id,
            sessionLiftId: current.sessionLiftId,
            variantId: current.variantId,
            plannedRepsMin: current.plannedRepsMin,
            plannedRepsMax: current.plannedRepsMax,
            plannedReps: current.plannedReps,
            orderIndex: current.orderIndex,
            ...(current.plannedWeight !== undefined
              ? { plannedWeight: current.plannedWeight }
              : {}),
            ...(snap.loggedWeight !== undefined ? { loggedWeight: snap.loggedWeight } : {}),
            ...(snap.loggedReps !== undefined ? { loggedReps: snap.loggedReps } : {}),
            ...(snap.loggedAt !== undefined ? { loggedAt: snap.loggedAt } : {}),
          };
          await db.sessionSet.put(next);
        }
      });
    });
    set({ editingSessionId: null, snapshot: null });
  },

  saveEdit: () => set({ editingSessionId: null, snapshot: null }),
}));

export type SessionMode = 'live' | 'view' | 'edit';

export function modeFor(
  sessionState: 'ACTIVE' | 'COMPLETED' | undefined,
  editingSessionId: string | null,
  sessionId: string,
): SessionMode {
  if (sessionState === 'ACTIVE') return 'live';
  if (editingSessionId === sessionId) return 'edit';
  return 'view';
}
