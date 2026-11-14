import { describe, expect, it } from 'vitest';
import { bpStatus, classify, labStatus, vitalStatus, worstStatus } from './ranges';
import type { RefRange } from './ranges';

const range: RefRange = { low: 70, high: 99, watchLow: 60, watchHigh: 125 };
const adultFemale = { sex: 'Female' as const, age: 58 };

describe('classify', () => {
  it('treats values inside the range (inclusive) as normal', () => {
    expect(classify(70, range)).toBe('normal');
    expect(classify(85, range)).toBe('normal');
    expect(classify(99, range)).toBe('normal');
  });

  it('flags values just outside the range as watch', () => {
    expect(classify(100, range)).toBe('watch');
    expect(classify(125, range)).toBe('watch');
    expect(classify(65, range)).toBe('watch');
  });

  it('flags values beyond the watch bounds as high or low', () => {
    expect(classify(126, range)).toBe('high');
    expect(classify(59, range)).toBe('low');
  });

  it('goes straight to high/low when no watch band is defined', () => {
    const strict: RefRange = { low: 95, high: 100 };
    expect(classify(94, strict)).toBe('low');
    expect(classify(101, strict)).toBe('high');
  });
});

describe('worstStatus', () => {
  it('returns the more severe status, preferring high on ties', () => {
    expect(worstStatus('normal', 'watch')).toBe('watch');
    expect(worstStatus('watch', 'high')).toBe('high');
    expect(worstStatus('low', 'high')).toBe('high');
    expect(worstStatus('normal', 'normal')).toBe('normal');
  });
});

describe('vital and lab status', () => {
  it('uses the worse of systolic and diastolic for blood pressure', () => {
    expect(bpStatus(112, 72, adultFemale)).toBe('normal');
    expect(bpStatus(118, 84, adultFemale)).toBe('watch');
    expect(bpStatus(146, 82, adultFemale)).toBe('high');
  });

  it('judges weight by BMI using the profile height', () => {
    const person = { ...adultFemale, heightCm: 160 };
    expect(vitalStatus('weight', { value: 56 }, person)).toBe('normal'); // BMI 21.9
    expect(vitalStatus('weight', { value: 70 }, person)).toBe('watch'); // BMI 27.3
    expect(vitalStatus('weight', { value: 80 }, person)).toBe('high'); // BMI 31.3
  });

  it('applies sex- and age-specific lab ranges', () => {
    expect(labStatus('hb', 12.5, adultFemale)).toBe('normal');
    expect(labStatus('hb', 12.5, { sex: 'Male', age: 40 })).toBe('watch');
    expect(labStatus('hb', 11.8, { sex: 'Male', age: 6 })).toBe('normal');
  });

  it('classifies HbA1c into the prediabetes and diabetes bands', () => {
    expect(labStatus('hba1c', 5.4, adultFemale)).toBe('normal');
    expect(labStatus('hba1c', 6.0, adultFemale)).toBe('watch');
    expect(labStatus('hba1c', 6.7, adultFemale)).toBe('high');
  });
});
