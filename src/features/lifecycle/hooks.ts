import { useEffect } from 'react';
import { acquireWorkoutWakeLock, releaseWorkoutWakeLock } from '@/features/lifecycle/wakeLock';
import { useActiveSession } from '@/features/session/hooks';

/**
 * Acquires the wake lock when an active session exists, releases when it ends.
 * Mounted once near the route root.
 */
export function useWorkoutWakeLock(): void {
  const active = useActiveSession();
  useEffect(() => {
    if (active) {
      void acquireWorkoutWakeLock();
    } else {
      void releaseWorkoutWakeLock();
    }
    return () => {
      // Mount/unmount or session change releases.
      void releaseWorkoutWakeLock();
    };
  }, [active]);
}
