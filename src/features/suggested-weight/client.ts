/**
 * Client-side wrapper for the suggested-weight worker.
 *
 * The worker is launched lazily on first use. The pure rule is also exported
 * directly for callers that already hold the matched history in memory (e.g.,
 * unit tests, server-side prerender — neither applies in MVP, but the door
 * stays open).
 */

import type { RepRange, Suggestion } from '@/features/suggested-weight/rule';
import { suggest as suggestPure } from '@/features/suggested-weight/rule';
import { fetchMatchedHistory } from '@/features/suggested-weight/queries';

export interface SuggestRequest {
  variantId: string;
  plannedRepRange: RepRange;
  increment: number;
}

/**
 * Direct path that doesn't hit a worker — used by tests and the eventual
 * read-only history view. The main loop will switch to the worker variant
 * once the LiftScreen wiring lands in Sprint 3.
 */
export async function computeSuggestion(req: SuggestRequest): Promise<Suggestion> {
  const history = await fetchMatchedHistory(req.variantId, req.plannedRepRange);
  return suggestPure({
    history,
    plannedRepRange: req.plannedRepRange,
    increment: req.increment,
  });
}
