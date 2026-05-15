import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import { newId, nowIso } from '@/data/ids';
import type { Session, SessionLift, SessionSet, Variant } from '@/data/types';
import {
  fetchMatchedHistory,
  resolveCanonicalVariantId,
} from '@/features/suggested-weight/queries';
import { computeSuggestion } from '@/features/suggested-weight/client';

interface SeedShape {
  variant: Variant;
  aliasVariant: Variant;
  sessionLifts: SessionLift[];
  sessionSets: SessionSet[];
}

async function seedHistory(): Promise<SeedShape> {
  const db = getDb();
  const now = nowIso();
  const variant: Variant = {
    id: newId(),
    liftFamilyId: 'lf-bench',
    name: 'Barbell',
    equipmentKind: 'barbell',
    isFreeWeight: true,
    isAlias: false,
    createdAt: now,
  };
  const aliasVariant: Variant = {
    id: newId(),
    liftFamilyId: 'lf-bench',
    name: 'Olympic Bar',
    equipmentKind: 'barbell',
    isFreeWeight: true,
    isAlias: true,
    canonicalId: variant.id,
    createdAt: now,
  };

  const sessions: Session[] = [
    {
      id: newId(),
      scheduleSlotId: 's1',
      locationId: 'home',
      startedAt: '2026-04-30T18:00:00.000Z',
      completedAt: '2026-04-30T19:00:00.000Z',
      state: 'COMPLETED',
    },
    {
      id: newId(),
      scheduleSlotId: 's1',
      locationId: 'home',
      startedAt: '2026-05-07T18:00:00.000Z',
      completedAt: '2026-05-07T19:00:00.000Z',
      state: 'COMPLETED',
    },
  ];

  const sl1: SessionLift = {
    id: newId(),
    sessionId: sessions[0]!.id,
    liftFamilyId: 'lf-bench',
    variantId: variant.id,
    orderIndex: 0,
    scope: 'planned',
  };
  const sl2: SessionLift = {
    id: newId(),
    sessionId: sessions[1]!.id,
    liftFamilyId: 'lf-bench',
    variantId: variant.id,
    orderIndex: 0,
    scope: 'planned',
  };

  const sessionSets: SessionSet[] = [];
  // Older session: 3x5 @ 215
  for (let i = 0; i < 3; i++) {
    sessionSets.push({
      id: newId(),
      sessionLiftId: sl1.id,
      variantId: variant.id,
      orderIndex: i,
      plannedRepsMin: 5,
      plannedRepsMax: 5,
      plannedReps: 5,
      plannedWeight: 215,
      loggedWeight: 215,
      loggedReps: 5,
      loggedAt: `2026-04-30T18:${10 + i * 5}:00.000Z`,
    });
  }
  // Newer session: 5 sets @ 225 — three 5s then 4 and 4 (missed bottom)
  const newerReps = [5, 5, 5, 4, 4];
  newerReps.forEach((reps, i) => {
    sessionSets.push({
      id: newId(),
      sessionLiftId: sl2.id,
      variantId: variant.id,
      orderIndex: i,
      plannedRepsMin: 5,
      plannedRepsMax: 5,
      plannedReps: 5,
      plannedWeight: 225,
      loggedWeight: 225,
      loggedReps: reps,
      loggedAt: `2026-05-07T18:${10 + i * 5}:00.000Z`,
    });
  });

  await db.transaction('rw', [db.variant, db.session, db.sessionLift, db.sessionSet], async () => {
    await db.variant.bulkPut([variant, aliasVariant]);
    await db.session.bulkPut(sessions);
    await db.sessionLift.bulkPut([sl1, sl2]);
    await db.sessionSet.bulkPut(sessionSets);
  });

  return { variant, aliasVariant, sessionLifts: [sl1, sl2], sessionSets };
}

describe('matched-history queries', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await getDb().delete();
  });

  it('returns the most recent session’s sets for the (variant, rep_range) tuple', async () => {
    const { variant } = await seedHistory();
    const history = await fetchMatchedHistory(variant.id, { min: 5, max: 5 });
    expect(history).toHaveLength(5);
    expect(history.every((s) => s.loggedWeight === 225)).toBe(true);
  });

  it('returns [] when no logged-at sets exist for the rep range', async () => {
    const { variant } = await seedHistory();
    const history = await fetchMatchedHistory(variant.id, { min: 8, max: 12 });
    expect(history).toEqual([]);
  });

  it('resolves an alias variant id to its canonical id (FR6 / NFR21a)', async () => {
    const { variant, aliasVariant } = await seedHistory();
    const resolved = await resolveCanonicalVariantId(aliasVariant.id);
    expect(resolved).toBe(variant.id);
  });

  it('excludes the currently-active session from matched history', async () => {
    const { variant } = await seedHistory();
    const db = getDb();
    // Add an ACTIVE session with logged sets at the same (variant, rep_range)
    // and a later loggedAt timestamp; it must NOT show up in matched history.
    const activeSession = {
      id: 'active-session',
      scheduleSlotId: 's1',
      locationId: 'home',
      startedAt: '2026-05-14T18:00:00.000Z',
      state: 'ACTIVE' as const,
    };
    const activeLift = {
      id: 'active-lift',
      sessionId: activeSession.id,
      liftFamilyId: 'lf-bench',
      variantId: variant.id,
      orderIndex: 0,
      scope: 'planned' as const,
    };
    await db.session.put(activeSession);
    await db.sessionLift.put(activeLift);
    await db.sessionSet.put({
      id: 'active-set',
      sessionLiftId: activeLift.id,
      variantId: variant.id,
      plannedRepsMin: 5,
      plannedRepsMax: 5,
      plannedReps: 5,
      orderIndex: 0,
      plannedWeight: 235,
      loggedWeight: 235,
      loggedReps: 5,
      loggedAt: '2026-05-14T18:30:00.000Z',
    });

    const history = await fetchMatchedHistory(variant.id, { min: 5, max: 5 });
    // Should still be the 5 sets from the previous COMPLETED session at 225 lb.
    expect(history).toHaveLength(5);
    expect(history.every((s) => s.loggedWeight === 225)).toBe(true);
  });

  it('end-to-end: history + rule = suggestion (missed bottom → hold weight)', async () => {
    const { variant } = await seedHistory();
    const suggestion = await computeSuggestion({
      variantId: variant.id,
      plannedRepRange: { min: 5, max: 5 },
      increment: 5,
    });
    expect(suggestion.weight).toBe(225);
    expect(suggestion.reasoning).toContain('Missed');
  });

  it('end-to-end: aliased variant suggests against the canonical history', async () => {
    const { aliasVariant } = await seedHistory();
    const suggestion = await computeSuggestion({
      variantId: aliasVariant.id,
      plannedRepRange: { min: 5, max: 5 },
      increment: 5,
    });
    expect(suggestion.weight).toBe(225);
  });
});
