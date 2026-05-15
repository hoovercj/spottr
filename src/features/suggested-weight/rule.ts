/**
 * Suggested-weight rule (PRD §FR39 / docs/architecture.md §5).
 *
 * Pure function. No I/O. The worker is the only thing that calls Dexie; this
 * file is unit-testable without an IndexedDB shim.
 */

import type { SessionSet } from '@/data/types';

export interface RepRange {
  min: number;
  max: number;
}

export interface Suggestion {
  /** null indicates a cold-start state (FR41) — no fabricated weight. */
  weight: number | null;
  reasoning: string;
}

export interface SuggestInput {
  /** Most-recent matching session's set rows, in any order. */
  history: SessionSet[];
  plannedRepRange: RepRange;
  /** Default 5 lb / 2.5 kg per PRD §FR39. */
  increment: number;
}

export function suggest(input: SuggestInput): Suggestion {
  const { history, plannedRepRange, increment } = input;

  if (history.length === 0) {
    return {
      weight: null,
      reasoning: 'No previous data for this variant + rep range.',
    };
  }

  const logged = history
    .filter((s): s is SessionSet & { loggedWeight: number; loggedReps: number } => {
      return typeof s.loggedWeight === 'number' && typeof s.loggedReps === 'number';
    })
    .sort((a, b) => a.orderIndex - b.orderIndex);

  if (logged.length === 0) {
    return {
      weight: null,
      reasoning: 'No previous data for this variant + rep range.',
    };
  }

  const baseWeight = logged[0]?.loggedWeight ?? 0;
  const everyAtTopOfRange = logged.every((s) => s.loggedReps >= plannedRepRange.max);
  const anyBelowBottom = logged.some((s) => s.loggedReps < plannedRepRange.min);

  if (everyAtTopOfRange) {
    return {
      weight: baseWeight + increment,
      reasoning: `Hit top of range on every set; +${increment}.`,
    };
  }

  if (anyBelowBottom) {
    const missedIndex = logged.findIndex((s) => s.loggedReps < plannedRepRange.min);
    return {
      weight: baseWeight,
      reasoning: `Missed bottom of range on set ${missedIndex + 1}; hold weight.`,
    };
  }

  return {
    weight: baseWeight,
    reasoning: `Matched last ${logged.length}×${formatRepScheme(logged, plannedRepRange)}; hold weight.`,
  };
}

function formatRepScheme(logged: SessionSet[], plannedRepRange: RepRange): string {
  const reps = new Set(logged.map((s) => s.loggedReps).filter((r): r is number => r != null));
  if (reps.size === 1) {
    return String([...reps][0]);
  }
  return `${plannedRepRange.min}-${plannedRepRange.max}`;
}
