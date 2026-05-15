import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  mostRecentMonday,
  parseLocalDate,
  toLocalDateString,
} from '@/data/calendarDate';

describe('calendarDate helpers', () => {
  it('toLocalDateString formats Y-M-D padded with leading zeros', () => {
    expect(toLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toLocalDateString(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('parseLocalDate round-trips through toLocalDateString', () => {
    const s = '2026-05-04';
    expect(toLocalDateString(parseLocalDate(s))).toBe(s);
  });

  it('daysBetween is signed and whole-day', () => {
    expect(daysBetween('2026-05-04', '2026-05-04')).toBe(0);
    expect(daysBetween('2026-05-04', '2026-05-08')).toBe(4);
    expect(daysBetween('2026-05-10', '2026-05-04')).toBe(-6);
  });

  it('addDays handles month and year rollover', () => {
    expect(addDays('2026-05-04', 7)).toBe('2026-05-11');
    expect(addDays('2026-05-30', 3)).toBe('2026-06-02');
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04');
    expect(addDays('2026-01-03', -5)).toBe('2025-12-29');
  });

  it('mostRecentMonday returns the same date when called on a Monday', () => {
    // 2026-05-04 is a Monday.
    expect(mostRecentMonday(new Date(2026, 4, 4))).toBe('2026-05-04');
  });

  it('mostRecentMonday steps back to the prior Monday on Sunday', () => {
    // 2026-05-10 is a Sunday → prior Monday is 2026-05-04.
    expect(mostRecentMonday(new Date(2026, 4, 10))).toBe('2026-05-04');
  });

  it('mostRecentMonday steps back the right number of days for Wednesday', () => {
    // 2026-05-06 is a Wednesday → prior Monday is 2026-05-04.
    expect(mostRecentMonday(new Date(2026, 4, 6))).toBe('2026-05-04');
  });
});
