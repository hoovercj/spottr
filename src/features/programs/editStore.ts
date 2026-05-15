/**
 * Routine editor state — holds the snapshot taken on entry so Discard can
 * restore the program to its pre-edit shape. The "isNewlyCreated" flag flips
 * Discard from "restore snapshot" to "delete the program entirely", giving
 * users a Cancel-style escape when they hit Create new routine and change
 * their mind.
 */

import { create } from 'zustand';
import type { ProgramSnapshot } from '@/features/programs/actions';

interface RoutineEditState {
  editingProgramId: string | null;
  snapshot: ProgramSnapshot | null;
  isNewlyCreated: boolean;
  enterEdit: (programId: string, snapshot: ProgramSnapshot | null, isNewlyCreated: boolean) => void;
  clear: () => void;
}

export const useRoutineEditStore = create<RoutineEditState>((set) => ({
  editingProgramId: null,
  snapshot: null,
  isNewlyCreated: false,
  enterEdit: (programId, snapshot, isNewlyCreated) =>
    set({ editingProgramId: programId, snapshot, isNewlyCreated }),
  clear: () => set({ editingProgramId: null, snapshot: null, isNewlyCreated: false }),
}));
