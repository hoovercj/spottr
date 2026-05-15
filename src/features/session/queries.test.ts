import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import { runSeed } from '@/data/seed';
import { newId, nowIso } from '@/data/ids';
import { mostRecentMonday, parseLocalDate } from '@/data/calendarDate';
import {
  getRoutineWeekView,
  getTodaySlotByAnchor,
  sessionCalendarDate,
} from '@/features/session/queries';
import type { Session } from '@/data/types';

async function reseedWithAnchor(anchorDate: string) {
  await runSeed();
  const db = getDb();
  const program = (await db.program.toArray()).find((p) => p.isActive)!;
  await db.program.update(program.id, { anchorDate });
  return program;
}

describe('getRoutineWeekView', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await getDb().delete();
  });

  it('renders 7 contiguous days starting on the anchor day-of-week for a 7-day routine', async () => {
    await reseedWithAnchor('2026-05-04'); // a Monday
    // Reference date is Friday 2026-05-08.
    const week = await getRoutineWeekView(new Date(2026, 4, 8));
    expect(week).not.toBeNull();
    expect(week!.startDate).toBe('2026-05-04');
    expect(week!.days).toHaveLength(7);
    expect(week!.days[0]!.calendarDate).toBe('2026-05-04');
    expect(week!.days[6]!.calendarDate).toBe('2026-05-10');
  });

  it('marks today on the correct card', async () => {
    await reseedWithAnchor('2026-05-04');
    const week = await getRoutineWeekView(new Date(2026, 4, 8));
    const today = week!.days.find((d) => d.isToday)!;
    expect(today.calendarDate).toBe('2026-05-08');
    expect(week!.days.filter((d) => d.isToday)).toHaveLength(1);
  });

  it('assigns the correct slot per day for the seeded PPL routine', async () => {
    await reseedWithAnchor('2026-05-04');
    const week = await getRoutineWeekView(new Date(2026, 4, 8));
    const splitNames = week!.days.map((d) => d.splitDayType.name);
    expect(splitNames).toEqual(['Pull', 'Push', 'Legs', 'Pull', 'Push', 'Legs', 'Rest']);
  });

  it('isPast / isFuture are mutually exclusive with isToday', async () => {
    await reseedWithAnchor('2026-05-04');
    const week = await getRoutineWeekView(new Date(2026, 4, 8));
    for (const d of week!.days) {
      const flags = [d.isToday, d.isPast, d.isFuture].filter(Boolean).length;
      expect(flags).toBe(1);
    }
  });

  it('attributes completion to Session.calendarDate, not startedAt', async () => {
    const program = await reseedWithAnchor('2026-05-04');
    const db = getDb();
    const slots = await db.scheduleSlot.where('programId').equals(program.id).sortBy('orderIndex');
    const mondaySlot = slots[0]!;
    // Build a COMPLETED session whose calendarDate = Monday but
    // startedAt = Tuesday (modeling "did Monday's missed workout on Tuesday").
    const session: Session = {
      id: newId(),
      scheduleSlotId: mondaySlot.id,
      locationId: (await db.location.toArray())[0]!.id,
      startedAt: new Date(2026, 4, 5, 18, 0).toISOString(),
      completedAt: new Date(2026, 4, 5, 19, 0).toISOString(),
      state: 'COMPLETED',
      calendarDate: '2026-05-04',
    };
    await db.session.put(session);

    const week = await getRoutineWeekView(new Date(2026, 4, 8));
    const monday = week!.days.find((d) => d.calendarDate === '2026-05-04')!;
    const tuesday = week!.days.find((d) => d.calendarDate === '2026-05-05')!;
    expect(monday.completedSessionId).toBe(session.id);
    expect(tuesday.completedSessionId).toBeNull();
  });

  it('falls back to startedAt date when calendarDate is absent (legacy rows)', async () => {
    const program = await reseedWithAnchor('2026-05-04');
    const db = getDb();
    const mondaySlot = (
      await db.scheduleSlot.where('programId').equals(program.id).sortBy('orderIndex')
    )[0]!;
    const session: Session = {
      id: newId(),
      scheduleSlotId: mondaySlot.id,
      locationId: (await db.location.toArray())[0]!.id,
      startedAt: new Date(2026, 4, 4, 18, 0).toISOString(),
      completedAt: new Date(2026, 4, 4, 19, 0).toISOString(),
      state: 'COMPLETED',
    };
    await db.session.put(session);
    expect(sessionCalendarDate(session)).toBe('2026-05-04');
    const week = await getRoutineWeekView(new Date(2026, 4, 8));
    expect(week!.days.find((d) => d.calendarDate === '2026-05-04')!.completedSessionId).toBe(
      session.id,
    );
  });
});

describe('getTodaySlotByAnchor', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await getDb().delete();
  });

  it('returns the Tuesday slot on a Tuesday reference date when anchor is Monday', async () => {
    await reseedWithAnchor('2026-05-04');
    const tuesday = parseLocalDate('2026-05-05');
    const slot = await getTodaySlotByAnchor(tuesday);
    expect(slot?.orderIndex).toBe(1);
  });

  it('returns the anchor slot when reference is the anchor date itself', async () => {
    await reseedWithAnchor('2026-05-04');
    const slot = await getTodaySlotByAnchor(parseLocalDate('2026-05-04'));
    expect(slot?.orderIndex).toBe(0);
  });
});

describe('seed anchor backfill', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await getDb().delete();
  });

  it('runSeed assigns anchorDate equal to the most recent Monday', async () => {
    await runSeed();
    const db = getDb();
    const program = (await db.program.toArray()).find((p) => p.isActive)!;
    expect(program.anchorDate).toBe(mostRecentMonday());
  });
});

describe('sessionCalendarDate', () => {
  it('prefers an explicit calendarDate', () => {
    const s: Session = {
      id: 's',
      scheduleSlotId: 'slot',
      locationId: 'loc',
      startedAt: nowIso(),
      state: 'COMPLETED',
      calendarDate: '2026-05-04',
    };
    expect(sessionCalendarDate(s)).toBe('2026-05-04');
  });
});
