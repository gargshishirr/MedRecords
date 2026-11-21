/**
 * Childhood vaccine schedule, based on the Indian Academy of Pediatrics (IAP)
 * immunisation schedule. It is a checklist, not advice: doctors may follow a
 * different plan (for example the government UIP schedule).
 */
import type { ISODate, Profile } from './types';
import { addDays, addMonths, ageInYears, parseISODate, toISODate } from './date';

interface Age {
  weeks?: number;
  months?: number;
  years?: number;
}

export interface VaccineDose {
  id: string;
  name: string;
  /** What it protects against, in plain words. */
  against: string;
  /** Recommended age for this dose. Defaults to the stage's start. */
  at?: Age;
}

export interface VaccineStage {
  id: string;
  label: string;
  from: Age;
  /** After this age a dose that hasn't been given counts as overdue. */
  until: Age;
  doses: VaccineDose[];
}

const DTP = 'Diphtheria, tetanus, whooping cough';
const POLIO = 'Polio';
const HIB = 'Hib (meningitis, pneumonia)';
const HEPB = 'Hepatitis B';
const ROTA = 'Rotavirus diarrhoea';
const PCV = 'Pneumococcal disease';
const MMR = 'Measles, mumps, rubella';

export const VACCINE_STAGES: VaccineStage[] = [
  {
    id: 'birth',
    label: 'At birth',
    from: {},
    until: { weeks: 6 },
    doses: [
      { id: 'bcg', name: 'BCG', against: 'Tuberculosis' },
      { id: 'hepb-1', name: 'Hepatitis B 1', against: HEPB },
      { id: 'opv-0', name: 'OPV 0 (oral polio)', against: POLIO },
    ],
  },
  ...[6, 10, 14].map((weeks, i): VaccineStage => ({
    id: `w${weeks}`,
    label: `${weeks} weeks`,
    from: { weeks },
    until: i < 2 ? { weeks: weeks + 4 } : { months: 6 },
    doses: [
      { id: `dtp-${i + 1}`, name: `DTwP / DTaP ${i + 1}`, against: DTP },
      { id: `ipv-${i + 1}`, name: `IPV ${i + 1}`, against: POLIO },
      { id: `hib-${i + 1}`, name: `Hib ${i + 1}`, against: HIB },
      { id: `hepb-${i + 2}`, name: `Hepatitis B ${i + 2}`, against: HEPB },
      { id: `rota-${i + 1}`, name: `Rotavirus ${i + 1}`, against: ROTA },
      { id: `pcv-${i + 1}`, name: `PCV ${i + 1}`, against: PCV },
    ],
  })),
  {
    id: 'm6',
    label: '6–9 months',
    from: { months: 6 },
    until: { months: 9 },
    doses: [
      { id: 'flu-1', name: 'Influenza 1', against: 'Flu' },
      { id: 'flu-2', name: 'Influenza 2', against: 'Flu', at: { months: 7 } },
      { id: 'tcv', name: 'Typhoid conjugate (TCV)', against: 'Typhoid' },
    ],
  },
  {
    id: 'm9',
    label: '9 months',
    from: { months: 9 },
    until: { months: 12 },
    doses: [{ id: 'mmr-1', name: 'MMR 1', against: MMR }],
  },
  {
    id: 'm12',
    label: '12 months',
    from: { months: 12 },
    until: { months: 15 },
    doses: [{ id: 'hepa-1', name: 'Hepatitis A 1', against: 'Hepatitis A' }],
  },
  {
    id: 'm15',
    label: '15 months',
    from: { months: 15 },
    until: { months: 18 },
    doses: [
      { id: 'mmr-2', name: 'MMR 2', against: MMR },
      { id: 'var-1', name: 'Varicella 1', against: 'Chickenpox' },
      { id: 'pcv-b', name: 'PCV booster', against: PCV },
    ],
  },
  {
    id: 'm16',
    label: '16–18 months',
    from: { months: 16 },
    until: { years: 2 },
    doses: [
      { id: 'dtp-b1', name: 'DTwP / DTaP booster 1', against: DTP },
      { id: 'ipv-b1', name: 'IPV booster 1', against: POLIO },
      { id: 'hib-b1', name: 'Hib booster', against: HIB },
      { id: 'hepa-2', name: 'Hepatitis A 2', against: 'Hepatitis A', at: { months: 18 } },
      { id: 'var-2', name: 'Varicella 2', against: 'Chickenpox', at: { months: 18 } },
    ],
  },
  {
    id: 'y4',
    label: '4–6 years',
    from: { years: 4 },
    until: { years: 7 },
    doses: [
      { id: 'dtp-b2', name: 'DTwP / DTaP booster 2', against: DTP },
      { id: 'ipv-b2', name: 'IPV booster 2', against: POLIO },
      { id: 'mmr-3', name: 'MMR 3', against: MMR },
    ],
  },
  {
    id: 'y9',
    label: '9–14 years',
    from: { years: 9 },
    until: { years: 15 },
    doses: [
      { id: 'hpv-1', name: 'HPV 1', against: 'Cervical and other HPV cancers' },
      { id: 'hpv-2', name: 'HPV 2', against: 'Cervical and other HPV cancers', at: { years: 9, months: 6 } },
    ],
  },
  {
    id: 'y10',
    label: '10–12 years',
    from: { years: 10 },
    until: { years: 13 },
    doses: [{ id: 'tdap', name: 'Tdap', against: DTP }],
  },
];

export const VACCINE_IDS: readonly string[] = VACCINE_STAGES.flatMap((s) => s.doses.map((d) => d.id));

/** The schedule is shown for children under this age. */
export const SCHEDULE_MAX_AGE_YEARS = 16;

export function hasSchedule(profile: Pick<Profile, 'dob'>, now: Date): boolean {
  return ageInYears(profile.dob, now) < SCHEDULE_MAX_AGE_YEARS;
}

function ageToDate(dob: ISODate, age: Age): Date {
  const birth = parseISODate(dob);
  return addDays(addMonths(birth, (age.years ?? 0) * 12 + (age.months ?? 0)), (age.weeks ?? 0) * 7);
}

export type VaccineStatus = 'given' | 'overdue' | 'due' | 'upcoming';

export interface VaccineRow {
  dose: VaccineDose;
  stage: VaccineStage;
  status: VaccineStatus;
  /** Recommended date for this dose. */
  dueDate: ISODate;
  givenOn?: ISODate;
}

export function vaccineRows(profile: Profile, now: Date): VaccineRow[] {
  const today = toISODate(now);
  const given = profile.vaccines ?? {};
  return VACCINE_STAGES.flatMap((stage) => {
    const until = toISODate(ageToDate(profile.dob, stage.until));
    return stage.doses.map((dose) => {
      const dueDate = toISODate(ageToDate(profile.dob, dose.at ?? stage.from));
      const givenOn = Object.prototype.hasOwnProperty.call(given, dose.id) ? given[dose.id] : undefined;
      const status: VaccineStatus = givenOn ? 'given' : today > until ? 'overdue' : today >= dueDate ? 'due' : 'upcoming';
      return { dose, stage, status, dueDate, givenOn };
    });
  });
}

export interface VaccineSummary {
  overdue: VaccineRow[];
  due: VaccineRow[];
  /** The next doses not yet due (same stage). */
  next: VaccineRow[];
  given: number;
  total: number;
}

export function vaccineSummary(profile: Profile, now: Date): VaccineSummary {
  const rows = vaccineRows(profile, now);
  const upcoming = rows.filter((r) => r.status === 'upcoming');
  const firstStage = upcoming[0]?.stage.id;
  return {
    overdue: rows.filter((r) => r.status === 'overdue'),
    due: rows.filter((r) => r.status === 'due'),
    next: upcoming.filter((r) => r.stage.id === firstStage),
    given: rows.filter((r) => r.status === 'given').length,
    total: rows.length,
  };
}

/** Demo helper: marks every dose due before `upToAge` as given on its due date. */
export function givenUpTo(dob: ISODate, upTo: Date, skip: string[] = []): Record<string, ISODate> {
  const out: Record<string, ISODate> = {};
  const limit = toISODate(upTo);
  for (const stage of VACCINE_STAGES) {
    for (const dose of stage.doses) {
      const due = toISODate(ageToDate(dob, dose.at ?? stage.from));
      if (due <= limit && !skip.includes(dose.id)) out[dose.id] = due;
    }
  }
  return out;
}
