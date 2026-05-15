import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import { runSeed } from '@/data/seed';
import { seedFakeHistory } from '@/data/fakeHistory';
import { setUserUnits } from '@/features/settings/actions';
import { TOOLS, getToolByName } from '@/features/ai/tools/catalog';

const ctx = { now: new Date('2026-05-15T12:00:00Z').toISOString() };

describe('AI tool catalog (read-only)', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
  });
  afterEach(async () => {
    await getDb().delete();
  });

  it('every tool is read-only and risk=read', () => {
    for (const t of TOOLS) {
      expect(t.mutates).toBe(false);
      expect(t.risk).toBe('read');
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(t.jsonSchema.type).toBe('object');
    }
  });

  it('list_chartable_buckets returns buckets after fake history seed', async () => {
    await runSeed();
    await setUserUnits('lb');
    await seedFakeHistory(4);
    const tool = getToolByName('list_chartable_buckets');
    expect(tool).toBeDefined();
    const out = (await tool!.run({}, ctx)) as { buckets: unknown[] };
    expect(Array.isArray(out.buckets)).toBe(true);
    expect(out.buckets.length).toBeGreaterThan(0);
  });

  it('list_recent_sessions returns at least one row after fake history seed', async () => {
    await runSeed();
    await setUserUnits('lb');
    await seedFakeHistory(4);
    const tool = getToolByName('list_recent_sessions');
    const out = (await tool!.run({ limit: 5 }, ctx)) as {
      sessions: Array<{ sessionId: string; date: string }>;
    };
    expect(out.sessions.length).toBeGreaterThan(0);
    // Sorted newest-first.
    for (let i = 1; i < out.sessions.length; i++) {
      expect(out.sessions[i - 1]!.date >= out.sessions[i]!.date).toBe(true);
    }
  });

  it('get_session_detail returns error shape for unknown id and full detail for a known one', async () => {
    await runSeed();
    await setUserUnits('lb');
    await seedFakeHistory(4);
    const list = getToolByName('list_recent_sessions');
    const listed = (await list!.run({ limit: 1 }, ctx)) as {
      sessions: Array<{ sessionId: string }>;
    };
    const sessionId = listed.sessions[0]!.sessionId;

    const detail = getToolByName('get_session_detail');
    const ok = (await detail!.run({ sessionId }, ctx)) as { sessionId?: string; error?: string };
    expect(ok.sessionId).toBe(sessionId);
    expect(ok.error).toBeUndefined();

    const bad = (await detail!.run({ sessionId: 'nope' }, ctx)) as { error?: string };
    expect(bad.error).toContain('Unknown');
  });

  it('get_active_routine returns the seeded program', async () => {
    await runSeed();
    const tool = getToolByName('get_active_routine');
    const out = (await tool!.run({}, ctx)) as {
      programName: string | null;
      splitDays: Array<{ dayName: string; lifts: unknown[] }>;
    };
    expect(out.programName).toBeTruthy();
    expect(out.splitDays.length).toBeGreaterThan(0);
  });
});
