import { describe, expect, it } from 'vitest';
import { STORAGE_KEY, addRecord, loadData, parseImport, resetData, serialize, toggleDose } from './store';
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

describe('loadData', () => {
  it('seeds demo data on first run and persists it under the versioned key', () => {
    const storage = memoryStorage();
    const data = loadData(storage, now);
    expect(STORAGE_KEY).toMatch(/v1$/);
    expect(data.schemaVersion).toBe(1);
    expect(data.profiles.map((p) => p.name)).toEqual(['Riya Kapoor', 'Meera Kapoor', 'Kabir Kapoor']);
    expect(data.records.length).toBeGreaterThan(40);
    expect(storage.map.has(STORAGE_KEY)).toBe(true);
  });

  it('returns previously saved data instead of re-seeding', () => {
    const storage = memoryStorage();
    const seeded = loadData(storage, now);
    const { data: withRecord } = addRecord(seeded, 'riya', { type: 'visit', title: 'Saved visit', date: '2026-11-10' }, now);
    storage.setItem(STORAGE_KEY, JSON.stringify(withRecord));
    expect(loadData(storage, now).records[0]?.title).toBe('Saved visit');
  });

  it('re-seeds when stored data is corrupt', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{not json' });
    expect(loadData(storage, now).profiles).toHaveLength(3);
  });
});

describe('demo seed', () => {
  it('uses only non-dialable placeholder phone numbers', () => {
    const data = createSeedData(now);
    const phones = data.profiles.flatMap((p) => [...p.emergencyContacts.map((c) => c.phone), p.primaryDoctor.phone]);
    expect(phones.length).toBeGreaterThan(0);
    for (const phone of phones) expect(phone).toMatch(/^\+91 00000 \d{5}$/);
    // No other +91 numbers anywhere in the dataset (e.g. summaries or notes).
    const all = JSON.stringify(data).match(/\+91[\d ]+/g) ?? [];
    expect(all.every((n) => /^\+91 00000 \d{5}$/.test(n))).toBe(true);
  });
});

describe('addRecord', () => {
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

describe('resetData', () => {
  it('discards user changes and restores the demo dataset', () => {
    const storage = memoryStorage();
    const seeded = loadData(storage, now);
    const { data: changed } = addRecord(seeded, 'riya', { type: 'document', title: 'Temp', date: '2026-11-01' }, now);
    storage.setItem(STORAGE_KEY, JSON.stringify(changed));
    const restored = resetData(storage, now);
    expect(restored.records.some((r) => r.title === 'Temp')).toBe(false);
    expect(restored.records).toHaveLength(seeded.records.length);
  });
});

describe('parseImport', () => {
  const valid = () => JSON.parse(serialize(createSeedData(now)));

  it('accepts a round-tripped export', () => {
    const result = parseImport(serialize(createSeedData(now)));
    expect(result.ok).toBe(true);
  });

  it('rejects text that is not JSON', () => {
    expect(parseImport('hello')).toEqual({ ok: false, error: 'That file is not valid JSON.' });
  });

  it('rejects an unsupported schema version', () => {
    const data = { ...valid(), schemaVersion: 2 };
    const result = parseImport(JSON.stringify(data));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/schema version/i);
  });

  it('pinpoints invalid records', () => {
    const data = valid();
    data.records[3].type = 'xray';
    const result = parseImport(JSON.stringify(data));
    expect(!result.ok && result.error).toBe('records[3].type is not a known record type');
  });

  it('rejects items that reference a missing profile', () => {
    const data = valid();
    data.labs[0].profileId = 'ghost';
    const result = parseImport(JSON.stringify(data));
    expect(!result.ok && result.error).toMatch(/labs\[0\]\.profileId/);
  });

  it('repairs an active profile id that no longer exists', () => {
    const data = { ...valid(), activeProfileId: 'nobody' };
    const result = parseImport(JSON.stringify(data));
    expect(result.ok && result.data.activeProfileId).toBe('riya');
  });
});
