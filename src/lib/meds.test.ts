import { describe, expect, it } from 'vitest';
import type { Medication } from './types';
import { computeAdherence, doseKey, refillStatus } from './meds';

function med(overrides: Partial<Medication> & Pick<Medication, 'id' | 'schedule'>): Medication {
  return {
    profileId: 'p1',
    name: 'Test med',
    strength: '10 mg',
    form: 'tablet',
    dose: '1 tablet',
    frequency: 'Daily',
    purpose: 'Testing',
    prescriber: 'Dr. Example',
    startDate: '2026-01-01',
    refillDate: '2026-11-01',
    supplyDays: 30,
    ...overrides,
  };
}

// Saturday 14 Nov 2026, 10:00 — morning doses are due, night doses are not yet.
const now = new Date(2026, 10, 14, 10, 0);

describe('computeAdherence', () => {
  const a = med({ id: 'a', schedule: ['morning', 'night'] });

  it('counts every scheduled dose on past days and only due doses today', () => {
    const log = {
      '2026-11-13': [doseKey('a', 'morning'), doseKey('a', 'night')],
      '2026-11-12': [doseKey('a', 'morning')],
      '2026-11-14': [doseKey('a', 'morning')],
    };
    const result = computeAdherence([a], log, now, 3);
    // 12 Nov: 1/2, 13 Nov: 2/2, 14 Nov: 1/1 (night not yet due)
    expect(result.days.map((d) => [d.taken, d.expected])).toEqual([
      [1, 2],
      [2, 2],
      [1, 1],
    ]);
    expect(result.taken).toBe(4);
    expect(result.expected).toBe(5);
    expect(result.ratio).toBeCloseTo(0.8);
  });

  it('counts a dose ticked off early today even if its slot is not due yet', () => {
    const log = { '2026-11-14': [doseKey('a', 'night')] };
    const result = computeAdherence([a], log, now, 1);
    expect(result.days[0]).toMatchObject({ taken: 1, expected: 2 });
  });

  it('ignores medications outside their start/end dates', () => {
    const ended = med({ id: 'old', schedule: ['morning'], startDate: '2026-01-01', endDate: '2026-11-12' });
    const result = computeAdherence([ended], {}, now, 3);
    expect(result.days.map((d) => d.expected)).toEqual([1, 0, 0]);
  });

  it('returns a null ratio when nothing was due', () => {
    expect(computeAdherence([], undefined, now).ratio).toBeNull();
  });
});

describe('refillStatus', () => {
  it('counts down days of supply and escalates the warning level', () => {
    expect(refillStatus({ refillDate: '2026-11-04', supplyDays: 30 }, now)).toMatchObject({
      daysLeft: 20,
      level: 'ok',
      label: 'Refill in 20 days',
    });
    expect(refillStatus({ refillDate: '2026-10-19', supplyDays: 30 }, now)).toMatchObject({
      daysLeft: 4,
      level: 'low',
      label: 'Refill in 4 days',
    });
    expect(refillStatus({ refillDate: '2026-10-16', supplyDays: 30 }, now)).toMatchObject({ level: 'critical', label: 'Refill tomorrow' });
    expect(refillStatus({ refillDate: '2026-10-10', supplyDays: 30 }, now).label).toBe('Refill overdue by 5 days');
  });
});
