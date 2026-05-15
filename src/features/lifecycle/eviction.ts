/**
 * Eviction detection (FR52). On app start, if a previously-seeded database
 * has empty core stores, treat it as eviction and offer restore.
 *
 * The "seed:v1:applied" meta key is used as the witness — if it was
 * present before but is missing now, OR if it is present but the
 * liftFamily store is empty, the local data has been evicted or reset.
 */

import { getDb } from '@/data/db';

const SEED_MARKER = 'seed:v1:applied';

export type EvictionState = 'fresh' | 'seeded' | 'evicted';

export async function detectEvictionState(): Promise<EvictionState> {
  const db = getDb();
  const marker = await db.meta.get(SEED_MARKER);
  const familyCount = await db.liftFamily.count();
  if (!marker && familyCount === 0) return 'fresh';
  if (marker && familyCount === 0) return 'evicted';
  return 'seeded';
}
