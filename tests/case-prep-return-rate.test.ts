import { describe, expect, it } from 'vitest';
import { returnRate, type SessionSummary } from '../src/lib/case-prep/return-rate';

const now = new Date('2026-12-31T00:00:00.000Z');
const day = (n: number) => new Date(Date.UTC(2026, 10, 1) + n * 86_400_000).toISOString();
const started = (ownerId: string, createdDay: number, completedDay?: number): SessionSummary => ({ ownerId, createdAt: day(createdDay), casePrep: completedDay === undefined ? {} : { completedAt: day(completedDay) } });

describe('case-prep return rate', () => {
  it('counts a second case started 10 days after completion as a return', () => {
    expect(returnRate([started('a', 0, 1), started('a', 11)], now)).toEqual({ completers: 1, returned: 1, stillOpen: 0, rate: 1 });
  });

  it('does not count a case started 31 days after completion', () => {
    expect(returnRate([started('a', 0, 1), started('a', 32)], now)).toMatchObject({ completers: 1, returned: 0, rate: 0 });
  });

  it('ignores early assessments, which never set a completion', () => {
    expect(returnRate([started('a', 0), started('a', 3)], now)).toMatchObject({ completers: 0, rate: null });
  });

  it('ignores conversations saved before case prep', () => {
    expect(returnRate([{ ownerId: 'a', createdAt: day(0) }, started('a', 2, 3)], now)).toMatchObject({ completers: 1, returned: 0 });
  });

  it('counts each person once and reports open windows', () => {
    const recent = new Date(Date.parse(day(40)));
    expect(returnRate([started('a', 0, 1), started('a', 4), started('a', 6), started('b', 30, 35)], recent)).toEqual({ completers: 2, returned: 1, stillOpen: 1, rate: 0.5 });
  });

  it('reports no rate when nobody has completed a case', () => {
    expect(returnRate([], now)).toEqual({ completers: 0, returned: 0, stillOpen: 0, rate: null });
  });
});
