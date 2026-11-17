import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  VAULT_KEY,
  addAppointment,
  addLab,
  addMedication,
  addProfile,
  addRecord,
  createEmptyData,
  deleteMedication,
  deleteProfile,
  deleteRecord,
  doseLogFor,
  readStored,
  toggleDose,
  updateRecord,
  withSettings,
} from './store';
import type { ProfileInput } from './store';
import { createSeedData } from './seed';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
}

const now = new Date(2026, 10, 14, 16, 0);

const person: ProfileInput = {
  name: 'Asha Rao',
  relation: 'Self',
  dob: '1990-02-03',
  sex: 'Female',
  bloodGroup: 'Unknown',
  allergies: [],
  conditions: [],
  emergencyContacts: [],
};

describe('readStored', () => {
  it('reports an empty browser so the welcome screen can show', () => {
    expect(readStored(memoryStorage(), now)).toEqual({ kind: 'empty' });
  });

  it('returns saved plain data', () => {
    const seed = createSeedData(now);
    const stored = readStored(memoryStorage({ [STORAGE_KEY]: JSON.stringify(seed) }), now);
    expect(stored.kind).toBe('plain');
    expect(stored.kind === 'plain' && stored.data.profiles.map((p) => p.name)).toEqual([
      'Riya Kapoor',
      'Meera Kapoor',
      'Kabir Kapoor',
    ]);
  });

  it('flags corrupt plain data instead of silently replacing it', () => {
    expect(readStored(memoryStorage({ [STORAGE_KEY]: '{not json' }), now)).toEqual({ kind: 'damaged', what: 'plain' });
  });

  it('prefers the encrypted vault over any plain copy', () => {
    const envelope = { v: 1, salt: 'A'.repeat(22) + '==', iv: 'A'.repeat(16), ct: 'A'.repeat(24) };
    const storage = memoryStorage({ [VAULT_KEY]: JSON.stringify(envelope), [STORAGE_KEY]: JSON.stringify(createSeedData(now)) });
    expect(readStored(storage, now).kind).toBe('vault');
    storage.setItem(VAULT_KEY, '{"v":1}');
    expect(readStored(storage, now)).toEqual({ kind: 'damaged', what: 'vault' });
  });
});

describe('demo seed', () => {
  it('is marked as demo data', () => {
    expect(createSeedData(now).demo).toBe(true);
    expect(createEmptyData(now).demo).toBe(false);
  });

  it('uses only non-dialable placeholder phone numbers', () => {
    const data = createSeedData(now);
    const phones = data.profiles.flatMap((p) => [...p.emergencyContacts.map((c) => c.phone), p.primaryDoctor?.phone ?? '']);
    expect(phones.length).toBeGreaterThan(0);
    for (const phone of phones) expect(phone).toMatch(/^\+91 00000 \d{5}$/);
    // No other +91 numbers anywhere in the dataset (e.g. summaries or notes).
    const all = JSON.stringify(data).match(/\+91[\d ]+/g) ?? [];
    expect(all.every((n) => /^\+91 00000 \d{5}$/.test(n))).toBe(true);
  });
});

describe('records', () => {
  it('prepends a trimmed record for the profile and logs activity', () => {
    const data = createSeedData(now);
    const { data: next, record } = addRecord(
      data,
      'meera',
      { type: 'lab', title: '  Thyroid profile ', date: '2026-11-12', doctor: ' ', cost: 650 },
      now,
    );
    expect(next.records).toHaveLength(data.records.length + 1);
    expect(next.records[0]).toBe(record);
    expect(record).toMatchObject({ profileId: 'meera', title: 'Thyroid profile', doctor: undefined, cost: 650 });
    expect(next.activity[0]?.text).toBe('Added lab report: Thyroid profile');
    expect(data.records).not.toContain(record); // original is untouched
  });

  it('edits a record in place and deletes it with its lab results', () => {
    const data = createSeedData(now);
    const target = data.records.find((r) => data.labs.some((l) => l.recordId === r.id))!;
    const edited = updateRecord(data, target.id, { type: 'visit', title: 'Renamed', date: target.date });
    expect(edited.records.find((r) => r.id === target.id)).toMatchObject({
      title: 'Renamed',
      type: 'visit',
      createdAt: target.createdAt,
    });

    const removed = deleteRecord(edited, target.id);
    expect(removed.records.some((r) => r.id === target.id)).toBe(false);
    expect(removed.labs.some((l) => l.recordId === target.id)).toBe(false);
  });
});

describe('people', () => {
  it('works from an empty dataset and switches to the new person', () => {
    const { data, profile } = addProfile(createEmptyData(now), person);
    expect(data.profiles).toEqual([profile]);
    expect(data.activeProfileId).toBe(profile.id);
  });

  it('deletes a person and everything that belongs to them', () => {
    let data = addProfile(createEmptyData(now), person).data;
    const id = data.activeProfileId;
    data = addRecord(data, id, { type: 'visit', title: 'Check-up', date: '2026-11-01' }, now).data;
    data = addLab(data, id, { testId: 'hb', date: '2026-11-01', value: 12.5 }, now).data;
    data = addAppointment(
      data,
      id,
      { at: '2026-12-01T10:00', reason: 'Follow-up', doctor: '', specialty: '', facility: '' },
      now,
    ).data;
    const med = addMedication(
      data,
      id,
      {
        name: 'Iron',
        strength: '',
        form: 'tablet',
        dose: '',
        frequency: '',
        schedule: ['morning'],
        purpose: '',
        prescriber: '',
        startDate: '2026-11-01',
        refillDate: '2026-11-01',
        supplyDays: 30,
      },
      now,
    );
    data = toggleDose(med.data, id, '2026-11-14', `${med.medication.id}:morning`, 'Iron', now);

    const after = deleteProfile(data, id);
    expect(after.profiles).toEqual([]);
    expect(after.activeProfileId).toBe('');
    for (const list of [after.records, after.labs, after.medications, after.appointments, after.activity])
      expect(list).toEqual([]);
    expect(doseLogFor(after, id)).toBeUndefined();
  });
});

describe('medications', () => {
  it('removes checklist ticks when a medication is deleted', () => {
    const data = createSeedData(now);
    const ticked = toggleDose(data, 'riya', '2026-11-14', 'med-riya-cetirizine:night', 'Cetirizine', now);
    const after = deleteMedication(ticked, 'med-riya-cetirizine');
    expect(after.medications.some((m) => m.id === 'med-riya-cetirizine')).toBe(false);
    expect(JSON.stringify(doseLogFor(after, 'riya'))).not.toContain('med-riya-cetirizine');
  });
});

describe('toggleDose', () => {
  it('adds and removes a dose for the given day', () => {
    const data = createSeedData(now);
    const once = toggleDose(data, 'riya', '2026-11-14', 'med-riya-cetirizine:night', 'Cetirizine', now);
    expect(once.doseLog.riya?.['2026-11-14']).toContain('med-riya-cetirizine:night');
    const twice = toggleDose(once, 'riya', '2026-11-14', 'med-riya-cetirizine:night', 'Cetirizine', now);
    expect(twice.doseLog.riya?.['2026-11-14']).not.toContain('med-riya-cetirizine:night');
  });
});

describe('withSettings', () => {
  it('keeps this device settings when the dataset is replaced', () => {
    const current = { ...createSeedData(now), settings: { autoLockMinutes: 15 } };
    expect(withSettings(createEmptyData(now), current).settings.autoLockMinutes).toBe(15);
  });
});
