/**
 * navigator.locks wrapper. Per PRD NFR19, all writes that participate in the
 * workout state machine must hold the `workout-write` exclusive lock so that
 * a service-worker activation cannot interleave with an in-flight commit.
 *
 * Browsers without `navigator.locks` (iOS Safari pre-16.4) silently degrade:
 * the wrapper awaits the function directly. iOS is not a target per UX spec.
 */

const WORKOUT_WRITE_LOCK = 'workout-write';

export async function withWriteLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks?.request) {
    return fn();
  }
  return new Promise<T>((resolve, reject) => {
    locks
      .request(name, { mode: 'exclusive' }, async () => {
        try {
          resolve(await fn());
        } catch (err: unknown) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .catch((err: unknown) => reject(err instanceof Error ? err : new Error(String(err))));
  });
}

export function withWorkoutWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  return withWriteLock(WORKOUT_WRITE_LOCK, fn);
}
