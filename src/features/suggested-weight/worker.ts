/**
 * Suggested-weight Web Worker (PRD NFR5: 50ms budget, must not block render).
 *
 * Invoked from the LiftScreen via `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`.
 * The Vite build emits this as a separate chunk; the React route remains free
 * of the Dexie + matched-history query path on first paint.
 *
 * Wire-up lands in Sprint 3 when the LiftScreen exists. For now the module
 * is exercised by unit tests (see suggested-weight.client direct path).
 */

import { computeSuggestion, type SuggestRequest } from '@/features/suggested-weight/client';

export interface WorkerSuggestRequestMessage extends SuggestRequest {
  /** Caller-provided correlation id so responses can be matched to requests. */
  requestId: string;
}

export interface WorkerSuggestResponseMessage {
  requestId: string;
  ok: true;
  weight: number | null;
  reasoning: string;
}

export interface WorkerSuggestErrorMessage {
  requestId: string;
  ok: false;
  errorMessage: string;
}

export type WorkerResponse = WorkerSuggestResponseMessage | WorkerSuggestErrorMessage;

// Guard: only register the message handler when running inside a Worker
// context. Importing this module from non-worker code (tests, SSR) is a no-op.
const isWorkerContext =
  typeof globalThis !== 'undefined' &&
  typeof (globalThis as { DedicatedWorkerGlobalScope?: unknown }).DedicatedWorkerGlobalScope !==
    'undefined' &&
  globalThis instanceof
    (globalThis as unknown as { DedicatedWorkerGlobalScope: typeof DedicatedWorkerGlobalScope })
      .DedicatedWorkerGlobalScope;

if (isWorkerContext) {
  self.addEventListener('message', (evt: MessageEvent<WorkerSuggestRequestMessage>) => {
    void handleMessage(evt.data);
  });
}

async function handleMessage(req: WorkerSuggestRequestMessage): Promise<void> {
  try {
    const out = await computeSuggestion({
      variantId: req.variantId,
      plannedRepRange: req.plannedRepRange,
      increment: req.increment,
    });
    const response: WorkerSuggestResponseMessage = {
      requestId: req.requestId,
      ok: true,
      weight: out.weight,
      reasoning: out.reasoning,
    };
    (self as unknown as Worker).postMessage(response);
  } catch (err: unknown) {
    const response: WorkerSuggestErrorMessage = {
      requestId: req.requestId,
      ok: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(response);
  }
}
