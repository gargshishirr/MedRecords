import { describe, expect, it } from 'vitest';
import { buildEmergencySummary } from './EmergencyPage';
import { createSeedData } from '../../lib/seed';
import { medicationsFor } from '../../lib/selectors';

const now = new Date(2026, 10, 14, 16, 0);

describe('emergency QR summary', () => {
  const data = createSeedData(now);
  const meera = data.profiles.find((p) => p.id === 'meera')!;
  const { active } = medicationsFor(data, 'meera', now);

  it('labels demo data and holds no link', () => {
    const text = buildEmergencySummary(meera, active, now, true);
    expect(text.split('\n')[0]).toBe('MEDRECORDS EMERGENCY CARD (DEMO DATA)');
    expect(text).not.toMatch(/https?:|www\./);
    expect(buildEmergencySummary(meera, active, now, false).split('\n')[0]).toBe('EMERGENCY MEDICAL INFORMATION');
  });

  it('leaves out the sections the person chose to hide', () => {
    const shown = buildEmergencySummary(meera, active, now);
    expect(shown).toMatch(/CONDITIONS: Type 2 diabetes/);
    expect(shown).toMatch(/MEDS: Metformin SR 500 mg/);
    expect(shown).toMatch(/DOCTOR: Dr\. Vikram Menon/);

    const hidden = buildEmergencySummary({ ...meera, cardHidden: ['conditions', 'medications', 'doctor'] }, active, now);
    expect(hidden).not.toMatch(/CONDITIONS|MEDS|DOCTOR|diabetes|Metformin|Menon/);
    // Allergies and emergency contacts always stay.
    expect(hidden).toMatch(/ALLERGIES: Penicillin \(severe\)/);
    expect(hidden).toMatch(/ICE: Riya Kapoor \(Daughter\)/);
  });

  it('copes with a person who has nothing filled in', () => {
    const text = buildEmergencySummary(
      { ...meera, bloodGroup: 'Unknown', allergies: [], conditions: [], emergencyContacts: [], primaryDoctor: undefined },
      [],
      now,
    );
    expect(text).toContain('Blood not known');
    expect(text).toContain('ALLERGIES: None known');
    expect(text).not.toContain('DOCTOR');
  });
});
