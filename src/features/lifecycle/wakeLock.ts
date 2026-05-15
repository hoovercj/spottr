/**
 * Screen wake lock (PRD NFR15). Held while a workout is active; released
 * when the session ends, the app is backgrounded, or after 10 minutes of
 * no interaction.
 *
 * Browsers without `navigator.wakeLock` silently degrade.
 */

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

interface WakeLockHandle {
  release: () => Promise<void>;
}

let active: WakeLockHandle | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityListener: (() => void) | null = null;

export async function acquireWorkoutWakeLock(): Promise<void> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  if (active) return;

  const wl = (
    navigator as Navigator & { wakeLock: { request: (type: 'screen') => Promise<WakeLockHandle> } }
  ).wakeLock;
  try {
    const sentinel = await wl.request('screen');
    active = sentinel;
  } catch {
    // Failure to acquire is non-fatal; user-visible degrade is silent.
    return;
  }

  resetIdleTimer();
  visibilityListener = () => {
    if (document.visibilityState === 'visible') {
      // Re-acquire if the OS released us while backgrounded.
      void acquireWorkoutWakeLock();
    } else {
      void releaseWorkoutWakeLock();
    }
  };
  document.addEventListener('visibilitychange', visibilityListener);
  ['pointerdown', 'keydown', 'touchstart'].forEach((evt) =>
    document.addEventListener(evt, resetIdleTimer, { passive: true }),
  );
}

export async function releaseWorkoutWakeLock(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (visibilityListener) {
    document.removeEventListener('visibilitychange', visibilityListener);
    visibilityListener = null;
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((evt) =>
    document.removeEventListener(evt, resetIdleTimer),
  );
  if (active) {
    try {
      await active.release();
    } catch {
      // ignore
    }
    active = null;
  }
}

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    void releaseWorkoutWakeLock();
  }, IDLE_TIMEOUT_MS);
}
