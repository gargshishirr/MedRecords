import type { LabTestId, Profile, RangeStatus, VitalKind } from './types';
import { ageInYears } from './date';

/**
 * A reference range. Values within `[low, high]` are normal. Values just outside
 * (down to `watchLow` / up to `watchHigh`, inclusive) are flagged "watch"; values
 * beyond those bounds are "low" / "high". Omit a watch bound to go straight from
 * normal to low/high.
 */
export interface RefRange {
  low: number;
  high: number;
  watchLow?: number;
  watchHigh?: number;
  /** Optional human label, e.g. "Below 100". */
  label?: string;
}

export function classify(value: number, range: RefRange): RangeStatus {
  if (!Number.isFinite(value)) return 'normal';
  if (value >= range.low && value <= range.high) return 'normal';
  if (value > range.high) {
    return range.watchHigh !== undefined && value <= range.watchHigh ? 'watch' : 'high';
  }
  return range.watchLow !== undefined && value >= range.watchLow ? 'watch' : 'low';
}

const SEVERITY: Record<RangeStatus, number> = { normal: 0, watch: 1, low: 2, high: 2 };

/** Returns the more severe of two statuses (ties prefer "high"). */
export function worstStatus(a: RangeStatus, b: RangeStatus): RangeStatus {
  if (SEVERITY[a] !== SEVERITY[b]) return SEVERITY[a] > SEVERITY[b] ? a : b;
  return a === 'high' || b === 'high' ? 'high' : a;
}

export function isOutOfRange(status: RangeStatus): boolean {
  return status === 'high' || status === 'low';
}

export const STATUS_LABEL: Record<RangeStatus, string> = {
  normal: 'Normal',
  watch: 'Watch',
  high: 'High',
  low: 'Low',
};

export function formatRange(range: RefRange, unit: string, decimals = 0): string {
  if (range.label) return `${range.label} ${unit}`.trim();
  const f = (n: number) => n.toFixed(decimals);
  return `${f(range.low)}–${f(range.high)} ${unit}`.trim();
}

/* ------------------------------------------------------------------------ */
/* Lab tests                                                                 */
/* ------------------------------------------------------------------------ */

export interface PersonContext {
  sex: Profile['sex'];
  age: number;
}

export interface LabTest {
  id: LabTestId;
  name: string;
  short: string;
  unit: string;
  decimals: number;
  description: string;
  range: (p: PersonContext) => RefRange;
}

const isChild = (p: PersonContext) => p.age < 13;

export const LAB_TESTS: Record<LabTestId, LabTest> = {
  hba1c: {
    id: 'hba1c',
    name: 'HbA1c',
    short: 'HbA1c',
    unit: '%',
    decimals: 1,
    description:
      'Average blood sugar over the past 2–3 months. 5.7–6.4% suggests prediabetes; 6.5% or above is in the diabetes range.',
    range: () => ({ low: 4.0, high: 5.6, watchHigh: 6.4 }),
  },
  fbs: {
    id: 'fbs',
    name: 'Fasting glucose',
    short: 'FBS',
    unit: 'mg/dL',
    decimals: 0,
    description: 'Blood sugar after at least 8 hours without food. 100–125 mg/dL is impaired fasting glucose.',
    range: () => ({ low: 70, high: 99, watchLow: 60, watchHigh: 125 }),
  },
  ldl: {
    id: 'ldl',
    name: 'LDL cholesterol',
    short: 'LDL',
    unit: 'mg/dL',
    decimals: 0,
    description:
      '"Bad" cholesterol that can build up in artery walls. Lower is better; targets may be stricter for people with diabetes.',
    range: () => ({ low: 0, high: 99, watchHigh: 159, label: 'Below 100' }),
  },
  hb: {
    id: 'hb',
    name: 'Haemoglobin',
    short: 'Hb',
    unit: 'g/dL',
    decimals: 1,
    description: 'Oxygen-carrying protein in red blood cells. Low values can indicate anaemia, often due to low iron.',
    range: (p) =>
      isChild(p)
        ? { low: 11.5, high: 15.5, watchLow: 10.5, watchHigh: 16.5 }
        : p.sex === 'Female'
          ? { low: 12.0, high: 15.5, watchLow: 11.0, watchHigh: 16.5 }
          : { low: 13.5, high: 17.5, watchLow: 12.5, watchHigh: 18.5 },
  },
  vitd: {
    id: 'vitd',
    name: 'Vitamin D (25-OH)',
    short: 'Vit D',
    unit: 'ng/mL',
    decimals: 0,
    description: 'Vitamin D status, important for bones and immunity. 20–29 ng/mL is insufficient; below 20 is deficient.',
    range: () => ({ low: 30, high: 100, watchLow: 20, watchHigh: 150 }),
  },
  tsh: {
    id: 'tsh',
    name: 'TSH',
    short: 'TSH',
    unit: 'mIU/L',
    decimals: 2,
    description: 'Thyroid-stimulating hormone, the main screening test for thyroid function.',
    range: () => ({ low: 0.4, high: 4.0, watchLow: 0.3, watchHigh: 6.0 }),
  },
  creatinine: {
    id: 'creatinine',
    name: 'Serum creatinine',
    short: 'Creat.',
    unit: 'mg/dL',
    decimals: 2,
    description: 'A waste product filtered by the kidneys; used to track kidney function, especially with diabetes.',
    range: (p) =>
      isChild(p)
        ? { low: 0.3, high: 0.7, watchLow: 0.2, watchHigh: 0.9 }
        : p.sex === 'Female'
          ? { low: 0.5, high: 1.1, watchLow: 0.4, watchHigh: 1.3 }
          : { low: 0.7, high: 1.3, watchLow: 0.6, watchHigh: 1.5 },
  },
};

export function personContext(profile: Pick<Profile, 'sex' | 'dob'>, now: Date = new Date()): PersonContext {
  return { sex: profile.sex, age: ageInYears(profile.dob, now) };
}

export function labStatus(testId: LabTestId, value: number, person: PersonContext): RangeStatus {
  return classify(value, LAB_TESTS[testId].range(person));
}

/* ------------------------------------------------------------------------ */
/* Vitals                                                                    */
/* ------------------------------------------------------------------------ */

export interface VitalMeta {
  kind: VitalKind;
  label: string;
  unit: string;
  decimals: number;
}

export const VITALS: Record<VitalKind, VitalMeta> = {
  bp: { kind: 'bp', label: 'Blood pressure', unit: 'mmHg', decimals: 0 },
  hr: { kind: 'hr', label: 'Heart rate', unit: 'bpm', decimals: 0 },
  glucose: { kind: 'glucose', label: 'Fasting glucose', unit: 'mg/dL', decimals: 0 },
  weight: { kind: 'weight', label: 'Weight', unit: 'kg', decimals: 1 },
  spo2: { kind: 'spo2', label: 'SpO₂', unit: '%', decimals: 0 },
};

export function systolicRange(p: PersonContext): RefRange {
  return isChild(p) ? { low: 85, high: 109, watchLow: 80, watchHigh: 119 } : { low: 90, high: 119, watchLow: 85, watchHigh: 139 };
}

export function diastolicRange(p: PersonContext): RefRange {
  return isChild(p) ? { low: 50, high: 69, watchLow: 45, watchHigh: 79 } : { low: 60, high: 79, watchLow: 55, watchHigh: 89 };
}

export function bpStatus(systolic: number, diastolic: number, p: PersonContext): RangeStatus {
  return worstStatus(classify(systolic, systolicRange(p)), classify(diastolic, diastolicRange(p)));
}

export function heartRateRange(p: PersonContext): RefRange {
  return isChild(p) ? { low: 70, high: 120, watchLow: 60, watchHigh: 130 } : { low: 60, high: 100, watchLow: 50, watchHigh: 110 };
}

export const GLUCOSE_RANGE: RefRange = { low: 70, high: 99, watchLow: 60, watchHigh: 125 };
export const SPO2_RANGE: RefRange = { low: 95, high: 100, watchLow: 92 };

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function bmiRange(p: PersonContext): RefRange {
  return isChild(p) ? { low: 13.5, high: 17.5, watchLow: 12.5, watchHigh: 19 } : { low: 18.5, high: 24.9, watchLow: 17, watchHigh: 29.9 };
}

/** Status of a single vital reading for a given person. Weight is judged via BMI, so it has no status without a height. */
export function vitalStatus(
  kind: VitalKind,
  reading: { value: number; value2?: number },
  p: PersonContext & { heightCm?: number },
): RangeStatus | null {
  switch (kind) {
    case 'bp':
      return bpStatus(reading.value, reading.value2 ?? 0, p);
    case 'hr':
      return classify(reading.value, heartRateRange(p));
    case 'glucose':
      return classify(reading.value, GLUCOSE_RANGE);
    case 'weight':
      return p.heightCm ? classify(bmi(reading.value, p.heightCm), bmiRange(p)) : null;
    case 'spo2':
      return classify(reading.value, SPO2_RANGE);
  }
}

/** Short reference label shown under each vital's name. Weight shows the reading's BMI. */
export function vitalRangeLabel(
  kind: VitalKind,
  p: PersonContext & { heightCm?: number },
  reading?: { value: number },
): string {
  switch (kind) {
    case 'bp': {
      const s = systolicRange(p);
      const d = diastolicRange(p);
      return `Target < ${s.high + 1}/${d.high + 1}`;
    }
    case 'hr': {
      const r = heartRateRange(p);
      return `Range ${r.low}–${r.high}`;
    }
    case 'glucose':
      return `Range ${GLUCOSE_RANGE.low}–${GLUCOSE_RANGE.high}`;
    case 'weight': {
      const r = bmiRange(p);
      if (!p.heightCm) return 'Add a height to see BMI';
      return reading ? `BMI ${bmi(reading.value, p.heightCm).toFixed(1)} · ${r.low}–${r.high}` : `BMI ${r.low}–${r.high}`;
    }
    case 'spo2':
      return `Target ≥ ${SPO2_RANGE.low}%`;
  }
}
