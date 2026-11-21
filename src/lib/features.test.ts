import { describe, expect, it } from 'vitest';
import { appointmentCalendar, foldLine, medicationCalendar } from './calendar';
import { dueReminders } from './reminders';
import { medicationWarnings } from './safety';
import { vaccineRows, vaccineSummary } from './vaccines';
import { createSeedData } from './seed';
import { setVaccine } from './store';
import type { Medication, Profile } from './types';
import { DEFAULT_REMINDERS } from './types';

const now = new Date(2026, 10, 14, 16, 0);

const med = (over: Partial<Medication> = {}): Medication => ({
  id: 'med-1',
  profileId: 'riya',
  name: 'Cetirizine',
  strength: '10 mg',
  form: 'tablet',
  dose: '1 tablet',
  frequency: 'Once daily',
  schedule: ['night'],
  purpose: '',
  prescriber: '',
  startDate: '2026-11-01',
  refillDate: '2026-11-01',
  supplyDays: 30,
  ...over,
});

describe('calendar files', () => {
  it('makes a daily reminder at the chosen time, ending with the course', () => {
    const ics = medicationCalendar(med({ endDate: '2026-11-30' }), 'Riya', DEFAULT_REMINDERS.times, now);
    expect(ics).toContain('DTSTART:20261114T210000');
    expect(ics).toContain('RRULE:FREQ=DAILY;UNTIL=20261130T235900');
    expect(ics).toContain('SUMMARY:Cetirizine 10 mg (Riya)');
    expect(ics).toContain('SUMMARY:Refill Cetirizine 10 mg (Riya)');
    expect(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });

  it('escapes text and reminds a day and two hours before an appointment', () => {
    const ics = appointmentCalendar(
      { id: 'apt-1', profileId: 'riya', at: '2026-12-04T11:15', doctor: 'Dr. Rao', specialty: 'GP', facility: 'Clinic; Baner, Pune', reason: 'Check-up' },
      'Riya',
      now,
    );
    expect(ics).toContain('DTSTART:20261204T111500');
    expect(ics).toContain('LOCATION:Clinic\\; Baner\\, Pune');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('TRIGGER:-PT2H');
  });

  it('folds long lines without splitting characters', () => {
    const folded = foldLine(`SUMMARY:${'दवा '.repeat(40)}`);
    expect(folded.split('\r\n ').join('')).toBe(`SUMMARY:${'दवा '.repeat(40)}`);
  });
});

describe('reminders', () => {
  const data = createSeedData(now);
  const at = (h: number, m = 0) => new Date(2026, 10, 14, h, m);

  it('reminds about untaken doses during the hour after their time, once', () => {
    const night = dueReminders(data, at(21, 10), new Set(), false);
    const dose = night.find((r) => r.key.startsWith('dose:2026-11-14:night:riya'));
    expect(dose?.title).toBe("Riya's night medicines");
    expect(dose?.body).toContain('Cetirizine');
    expect(dueReminders(data, at(22, 30), new Set(), false).some((r) => r.key.startsWith('dose:'))).toBe(false);
    expect(dueReminders(data, at(21, 10), new Set(night.map((r) => r.key)), false)).toEqual([]);
  });

  it('keeps names out of reminders when the lock is on', () => {
    const text = JSON.stringify(dueReminders(data, at(21, 10), new Set(), true));
    expect(text).not.toMatch(/Riya|Cetirizine/);
  });
});

describe('medicine safety checks', () => {
  const allergies: Profile['allergies'] = [{ name: 'Sulfa drugs', severity: 'moderate', reaction: 'Rash' }];

  it('warns about a medicine from an allergy family', () => {
    const [w] = medicationWarnings('Septran DS', allergies, [], now);
    expect(w?.kind).toBe('allergy');
    expect(w?.message).toContain('sulfa');
    expect(medicationWarnings('Cetirizine', allergies, [], now)).toEqual([]);
  });

  it('warns about doubling up on paracetamol but not when editing the same medicine', () => {
    const crocin = med({ id: 'med-2', name: 'Crocin 650' });
    expect(medicationWarnings('Dolo 650', [], [crocin], now)[0]?.kind).toBe('same-family');
    expect(medicationWarnings('Crocin 650', [], [crocin], now, 'med-2')).toEqual([]);
    expect(medicationWarnings('crocin 650', [], [crocin], now)[0]?.kind).toBe('duplicate');
  });
});

describe('vaccine schedule', () => {
  const baby: Profile = { ...createSeedData(now).profiles[2]!, dob: '2026-08-01' };
  delete baby.vaccines;

  it('works out what is overdue, due and coming next from the birth date', () => {
    const rows = vaccineRows(baby, now);
    expect(rows.find((r) => r.dose.id === 'bcg')?.status).toBe('overdue');
    expect(rows.find((r) => r.dose.id === 'dtp-2')?.status).toBe('overdue');
    expect(rows.find((r) => r.dose.id === 'dtp-3')?.status).toBe('due');
    expect(rows.find((r) => r.dose.id === 'mmr-1')?.status).toBe('upcoming');
    expect(vaccineSummary(baby, now).next.map((r) => r.dose.id)).toEqual(['flu-1', 'flu-2', 'tcv']);
  });

  it('counts a dose as given once it is ticked off', () => {
    const data = createSeedData(now);
    const updated = setVaccine({ ...data, profiles: [baby] }, baby.id, 'bcg', '2026-08-01');
    expect(vaccineRows(updated.profiles[0]!, now).find((r) => r.dose.id === 'bcg')?.status).toBe('given');
    expect(setVaccine(updated, baby.id, 'bcg', null).profiles[0]!.vaccines).toBeUndefined();
  });
});
