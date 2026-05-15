/**
 * Hard reset: deletes the entire IndexedDB database and re-opens an empty one.
 *
 * Destructive — wipes every workout, custom variant, location, export
 * destination handle, and the seed marker. After this returns, the caller
 * is expected to reload the page so the React tree re-mounts cleanly and
 * the seed loader re-runs.
 */

import { _resetDbForTest, getDb } from '@/data/db';

export async function wipeAllData(): Promise<void> {
  const db = getDb();
  await db.delete();
  // Re-open a fresh singleton so any further reads in this tick don't error
  // before the page reload happens.
  _resetDbForTest();
}
