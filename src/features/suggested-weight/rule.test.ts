import { describe, expect, it } from 'vitest';
import { suggest } from '@/features/suggested-weight/rule';
import type { SessionSet } from '@/data/types';

function set(partial: Partial<SessionSet>): SessionSet {
  return {
    id: 'set-' + Math.random().toString(36).slice(2),
    sessionLiftId: 'sl-1',
    variantId: 'v-1',
    plannedRepsMin: 5,
    plannedRepsMax: 5,
    plannedReps: 5,
    orderIndex: 0,
    ...partial,
  };
}

describe('suggest()', () => {
  it('returns null weight + cold-start reasoning when no history exists', () => {
    const out = suggest({ history: [], plannedRepRange: { min: 5, max: 5 }, increment: 5 });
    expect(out.weight).toBeNull();
    expect(out.reasoning).toContain('No previous data');
  });

  it('returns null weight when history rows have no logged values', () => {
    const out = suggest({
      history: [set({ orderIndex: 0 }), set({ orderIndex: 1 })],
      plannedRepRange: { min: 5, max: 5 },
      increment: 5,
    });
    expect(out.weight).toBeNull();
  });

  it('increments when every set hit the top of the range', () => {
    const out = suggest({
      history: [
        set({ orderIndex: 0, loggedWeight: 225, loggedReps: 5 }),
        set({ orderIndex: 1, loggedWeight: 225, loggedReps: 5 }),
        set({ orderIndex: 2, loggedWeight: 225, loggedReps: 5 }),
      ],
      plannedRepRange: { min: 5, max: 5 },
      increment: 5,
    });
    expect(out.weight).toBe(230);
    expect(out.reasoning).toContain('+5');
  });

  it('holds weight when any set dropped below the bottom of the range', () => {
    const out = suggest({
      history: [
        set({ orderIndex: 0, loggedWeight: 225, loggedReps: 5 }),
        set({ orderIndex: 1, loggedWeight: 225, loggedReps: 5 }),
        set({ orderIndex: 2, loggedWeight: 225, loggedReps: 4 }),
      ],
      plannedRepRange: { min: 5, max: 5 },
      increment: 5,
    });
    expect(out.weight).toBe(225);
    expect(out.reasoning).toContain('Missed');
    expect(out.reasoning).toContain('set 3');
  });

  it('holds weight when reps fall inside the range but not at the top', () => {
    const out = suggest({
      history: [
        set({ orderIndex: 0, loggedWeight: 100, loggedReps: 10 }),
        set({ orderIndex: 1, loggedWeight: 100, loggedReps: 9 }),
        set({ orderIndex: 2, loggedWeight: 100, loggedReps: 8 }),
      ],
      plannedRepRange: { min: 8, max: 12 },
      increment: 5,
    });
    expect(out.weight).toBe(100);
    expect(out.reasoning).toContain('hold weight');
  });

  it('honors metric increment (2.5 kg) when supplied', () => {
    const out = suggest({
      history: [
        set({ orderIndex: 0, loggedWeight: 60, loggedReps: 5 }),
        set({ orderIndex: 1, loggedWeight: 60, loggedReps: 5 }),
      ],
      plannedRepRange: { min: 5, max: 5 },
      increment: 2.5,
    });
    expect(out.weight).toBe(62.5);
  });
});
