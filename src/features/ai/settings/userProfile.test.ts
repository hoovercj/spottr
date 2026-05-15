import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import {
  EMPTY_PROFILE,
  clearUserProfile,
  getUserProfile,
  isProfileNonEmpty,
  setUserProfile,
} from '@/features/ai/settings/userProfile';
import { buildExportPayload } from '@/features/export/serialize';

describe('userProfile', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
  });
  afterEach(async () => {
    await getDb().delete();
  });

  it('returns EMPTY_PROFILE when nothing is stored', async () => {
    const p = await getUserProfile();
    expect(p).toEqual(EMPTY_PROFILE);
    expect(isProfileNonEmpty(p)).toBe(false);
  });

  it('round-trips a partial patch (merge with defaults)', async () => {
    await setUserProfile({ goals: '4-plate squat', experienceLevel: 'intermediate' });
    const p = await getUserProfile();
    expect(p.goals).toBe('4-plate squat');
    expect(p.experienceLevel).toBe('intermediate');
    expect(p.equipment).toBe('');
    expect(p.injuries).toBe('');
    expect(p.coachingNotes).toBe('');
    expect(isProfileNonEmpty(p)).toBe(true);
  });

  it('coerces an unknown experienceLevel back to "unspecified"', async () => {
    // Bypass setUserProfile to drop a stale shape into storage.
    await getDb().meta.put({
      key: 'ai:userProfile',
      value: { experienceLevel: 'ninja', goals: 'be cool' },
    });
    const p = await getUserProfile();
    expect(p.experienceLevel).toBe('unspecified');
    expect(p.goals).toBe('be cool');
  });

  it('clearUserProfile removes the row', async () => {
    await setUserProfile({ goals: 'foo' });
    expect((await getUserProfile()).goals).toBe('foo');
    await clearUserProfile();
    expect(await getUserProfile()).toEqual(EMPTY_PROFILE);
  });

  it('profile contents do NOT leak into the Drive export payload', async () => {
    await setUserProfile({
      goals: 'SECRET-GOAL-MARKER',
      injuries: 'SECRET-INJURY-MARKER',
    });
    const payload = await buildExportPayload();
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('SECRET-GOAL-MARKER');
    expect(serialized).not.toContain('SECRET-INJURY-MARKER');
    expect(serialized).not.toContain('ai:userProfile');
  });

  it('isProfileNonEmpty treats an explicit experienceLevel as non-empty', () => {
    expect(isProfileNonEmpty({ ...EMPTY_PROFILE, experienceLevel: 'beginner' })).toBe(true);
    expect(isProfileNonEmpty({ ...EMPTY_PROFILE, goals: '  ' })).toBe(false);
    expect(isProfileNonEmpty({ ...EMPTY_PROFILE, coachingNotes: 'hi' })).toBe(true);
  });
});
