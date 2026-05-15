import { getDb } from '@/data/db';
import type { SessionSet, Variant } from '@/data/types';
import type { RepRange } from '@/features/suggested-weight/rule';

/** Resolve a variant ID through any merge alias chain (FR6 / NFR21a). */
export async function resolveCanonicalVariantId(variantId: string): Promise<string> {
  const db = getDb();
  let current: string | undefined = variantId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const v: Variant | undefined = await db.variant.get(current);
    if (!v?.isAlias || !v.canonicalId) return current;
    current = v.canonicalId;
  }
  return variantId;
}

/**
 * Fetch the most-recent matching **completed** session's sessionSets for the
 * given (variant, rep_range) tuple. The currently-in-progress workout is
 * excluded so the matched-history line on the lift screen always reflects
 * prior performance, not what was just logged this session.
 *
 * Implementation: the compound index `[variantId+plannedRepsMin+plannedRepsMax+loggedAt]`
 * lets us range-scan only the relevant slice; we then resolve each candidate
 * set's session and drop any that isn't COMPLETED.
 */
export async function fetchMatchedHistory(
  variantId: string,
  plannedRepRange: RepRange,
): Promise<SessionSet[]> {
  const db = getDb();
  const canonical = await resolveCanonicalVariantId(variantId);

  const all = await db.sessionSet
    .where('[variantId+plannedRepsMin+plannedRepsMax+loggedAt]')
    .between(
      [canonical, plannedRepRange.min, plannedRepRange.max, ''],
      [canonical, plannedRepRange.min, plannedRepRange.max, '￿'],
    )
    .toArray();

  const logged = all.filter((s): s is SessionSet & { loggedAt: string } => Boolean(s.loggedAt));
  if (logged.length === 0) return [];
  logged.sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1));

  // Resolve each candidate's session and keep only COMPLETED ones.
  const liftIds = [...new Set(logged.map((s) => s.sessionLiftId))];
  const sessionLifts = await db.sessionLift.bulkGet(liftIds);
  const sessionIdByLift = new Map<string, string>();
  for (const sl of sessionLifts) {
    if (sl) sessionIdByLift.set(sl.id, sl.sessionId);
  }
  const sessionIds = [...new Set(sessionLifts.filter(Boolean).map((sl) => sl!.sessionId))];
  const sessions = await db.session.bulkGet(sessionIds);
  const completedSessionIds = new Set(
    sessions.filter((s) => s?.state === 'COMPLETED').map((s) => s!.id),
  );

  for (const s of logged) {
    const sessionId = sessionIdByLift.get(s.sessionLiftId);
    if (sessionId && completedSessionIds.has(sessionId)) {
      return logged.filter((row) => row.sessionLiftId === s.sessionLiftId);
    }
  }
  return [];
}
