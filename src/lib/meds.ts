import type { DoseSlot, ISODate, Medication } from './types';
import { DOSE_SLOTS } from './types';
import { addDays, daysBetween, toISODate } from './date';

/** Hour of day by which a dose in each slot is considered "due". */
export const SLOT_DUE_HOUR: Record<DoseSlot, number> = { morning: 9, afternoon: 14, night: 21 };

export const SLOT_LABEL: Record<DoseSlot, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  night: 'Night',
};

export const doseKey = (medicationId: string, slot: DoseSlot) => `${medicationId}:${slot}`;

export function isActiveOn(med: Pick<Medication, 'startDate' | 'endDate'>, day: ISODate): boolean {
  return med.startDate <= day && (!med.endDate || med.endDate >= day);
}

export function isCurrentlyActive(med: Medication, now: Date = new Date()): boolean {
  return isActiveOn(med, toISODate(now));
}

export interface DoseItem {
  med: Medication;
  slot: DoseSlot;
  key: string;
}

/** All doses scheduled for a given day, ordered morning → night. */
export function dosesForDay(meds: Medication[], day: ISODate): DoseItem[] {
  const items: DoseItem[] = [];
  for (const slot of DOSE_SLOTS) {
    for (const med of meds) {
      if (isActiveOn(med, day) && med.schedule.includes(slot)) {
        items.push({ med, slot, key: doseKey(med.id, slot) });
      }
    }
  }
  return items;
}

export interface DayAdherence {
  date: ISODate;
  expected: number;
  taken: number;
}

export interface AdherenceSummary {
  taken: number;
  expected: number;
  /** 0–1, or `null` when no doses were due in the window. */
  ratio: number | null;
  days: DayAdherence[];
}

/**
 * Adherence over the last `windowDays` days, including today. Past days count
 * every scheduled dose. For today, a dose only counts as expected once its slot
 * is due (or if it has already been ticked off), so the ring is not penalised
 * for evening doses in the morning.
 */
export function computeAdherence(
  meds: Medication[],
  log: Record<ISODate, string[]> | undefined,
  now: Date,
  windowDays = 7,
): AdherenceSummary {
  const today = toISODate(now);
  const days: DayAdherence[] = [];
  let taken = 0;
  let expected = 0;

  for (let i = windowDays - 1; i >= 0; i--) {
    const date = toISODate(addDays(now, -i));
    const takenKeys = new Set(log?.[date] ?? []);
    let dayExpected = 0;
    let dayTaken = 0;
    for (const dose of dosesForDay(meds, date)) {
      const wasTaken = takenKeys.has(dose.key);
      const isDue = date !== today || wasTaken || now.getHours() >= SLOT_DUE_HOUR[dose.slot];
      if (!isDue) continue;
      dayExpected += 1;
      if (wasTaken) dayTaken += 1;
    }
    days.push({ date, expected: dayExpected, taken: dayTaken });
    expected += dayExpected;
    taken += dayTaken;
  }

  return { taken, expected, ratio: expected === 0 ? null : taken / expected, days };
}

export type RefillLevel = 'ok' | 'low' | 'critical';

export interface RefillStatus {
  daysLeft: number;
  level: RefillLevel;
  label: string;
  /** Fraction of the current supply remaining (0–1). */
  remaining: number;
}

export function refillStatus(med: Pick<Medication, 'refillDate' | 'supplyDays'>, now: Date): RefillStatus {
  const daysLeft = med.supplyDays - daysBetween(med.refillDate, now);
  const level: RefillLevel = daysLeft <= 2 ? 'critical' : daysLeft <= 5 ? 'low' : 'ok';
  let label: string;
  if (daysLeft < 0) label = `Refill overdue by ${-daysLeft} day${daysLeft === -1 ? '' : 's'}`;
  else if (daysLeft === 0) label = 'Refill due today';
  else if (daysLeft === 1) label = 'Refill tomorrow';
  else label = `Refill in ${daysLeft} days`;
  const remaining = Math.max(0, Math.min(1, daysLeft / med.supplyDays));
  return { daysLeft, level, label, remaining };
}
