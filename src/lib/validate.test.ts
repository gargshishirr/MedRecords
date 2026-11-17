import { afterEach, describe, expect, it } from 'vitest';
import { MAX_IMPORT_BYTES, TOO_BIG_MESSAGE, parseAppDataJson, safeJsonParse, validateAppData } from './validate';
import { readFileText } from './backup';
import { createEmptyData } from './store';
import { createSeedData } from './seed';

const now = new Date(2026, 10, 14, 16, 0);
const seed = () => createSeedData(now);
const asJson = (value: unknown) => JSON.stringify(value);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plain = (): any => JSON.parse(asJson(seed()));

afterEach(() => {
  // Belt and braces: make sure no test leaves Object.prototype polluted.
  for (const key of ['polluted', 'isAdmin']) delete (Object.prototype as Record<string, unknown>)[key];
});

describe('valid data', () => {
  it('keeps every field of a real export', () => {
    const data = seed();
    const result = parseAppDataJson(asJson(data), now);
    expect(result.ok).toBe(true);
    expect(result.ok && result.data).toEqual(JSON.parse(asJson(data)));
  });

  it('accepts an empty dataset with no people', () => {
    const result = parseAppDataJson(asJson(createEmptyData(now)), now);
    expect(result.ok && result.data.profiles).toEqual([]);
    expect(result.ok && result.data.activeProfileId).toBe('');
  });

  it('treats older exports without the new fields as demo data with default settings', () => {
    const legacy = plain();
    delete legacy.demo;
    delete legacy.settings;
    const result = parseAppDataJson(asJson(legacy), now);
    expect(result.ok && result.data.demo).toBe(true);
    expect(result.ok && result.data.settings).toEqual({ autoLockMinutes: 5 });
  });

  it('repairs an active profile id that no longer exists', () => {
    const result = parseAppDataJson(asJson({ ...plain(), activeProfileId: 'nobody' }), now);
    expect(result.ok && result.data.activeProfileId).toBe('riya');
  });
});

describe('strict schema', () => {
  it('drops unknown keys at every level', () => {
    const data = plain();
    data.evil = '<script>alert(1)</script>';
    data.profiles[0].ssn = '123';
    data.profiles[0].allergies[0].secret = true;
    data.records[0].onclick = 'steal()';
    data.medications[0].extra = { nested: 1 };
    data.settings.debug = true;
    const result = parseAppDataJson(asJson(data), now);
    expect(result.ok).toBe(true);
    const out = asJson(result.ok && result.data);
    for (const key of ['evil', 'ssn', 'secret', 'onclick', 'extra', 'debug']) expect(out).not.toContain(`"${key}"`);
  });

  it('pinpoints invalid records with a friendly message', () => {
    const data = plain();
    data.records[3].type = 'xray';
    expect(parseAppDataJson(asJson(data), now)).toEqual({ ok: false, error: 'Record 4: the record type is not recognised.' });
  });

  it('rejects items that belong to a missing person', () => {
    const data = plain();
    data.labs[0].profileId = 'ghost';
    expect(parseAppDataJson(asJson(data), now)).toEqual({
      ok: false,
      error: "Lab result 1 belongs to a person who isn't in this backup.",
    });
  });

  it('rejects wrong types, bad dates and over-long text', () => {
    const cases: [(d: ReturnType<typeof plain>) => void, RegExp][] = [
      [(d) => (d.labs[0].value = '12'), /Lab result 1: the result should be a number/],
      [(d) => (d.records[0].date = '2026-02-30'), /Record 1: the date is missing or not a valid date/],
      [(d) => (d.profiles[0].name = 'x'.repeat(500)), /Person 1: the name is too long/],
      [(d) => (d.medications[0].supplyDays = -4), /Medication 1: the days of supply is out of range/],
      [
        (d) => (d.appointments[0].at = 'tomorrow'),
        /Appointment 1: the date and time is missing|Appointment 1: the date and time are not valid/,
      ],
      [(d) => (d.records = 'lots'), /record list is not valid/],
      [(d) => (d.records[1].id = d.records[0].id), /Record 2: its id is used more than once/],
    ];
    for (const [mutate, message] of cases) {
      const data = plain();
      mutate(data);
      const result = parseAppDataJson(asJson(data), now);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(message);
    }
  });

  it('explains files that are not MedRecords backups', () => {
    expect(parseAppDataJson('hello', now)).toEqual({
      ok: false,
      error: "That file isn't valid JSON, so it can't be a MedRecords backup.",
    });
    expect(parseAppDataJson('[1,2,3]', now)).toEqual({ ok: false, error: "This file isn't a MedRecords backup." });
    expect(parseAppDataJson(asJson({ ...plain(), schemaVersion: 2 }), now)).toEqual({
      ok: false,
      error: 'This backup comes from a newer version of MedRecords, so it cannot be imported here.',
    });
    const old = parseAppDataJson(asJson({ ...plain(), schemaVersion: 0 }), now);
    expect(!old.ok && old.error).toMatch(/not supported/);
  });
});

describe('prototype pollution', () => {
  it('ignores __proto__, constructor and prototype keys anywhere', () => {
    const data = plain();
    const json = asJson(data)
      .replace('{', '{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"isAdmin":true}},')
      .replace('"allergies":[{', '"allergies":[{"__proto__":{"polluted":"yes"},')
      .replace('"doseLog":{', '"doseLog":{"__proto__":{"2026-11-14":["x"]},"constructor":{},');
    const result = parseAppDataJson(json, now);

    expect(result.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    if (!result.ok) return;
    expect(Object.getPrototypeOf(result.data)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(result.data, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.data.doseLog, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.data.doseLog, 'constructor')).toBe(false);
    expect(Object.keys(result.data.profiles[0]!.allergies[0]!)).toEqual(['name', 'severity', 'reaction']);
  });

  it('strips dangerous keys while parsing', () => {
    const parsed = safeJsonParse('{"a":1,"__proto__":{"polluted":1},"b":{"constructor":{"prototype":{"polluted":1}}}}') as Record<
      string,
      unknown
    >;
    expect(parsed).toEqual({ a: 1, b: {} });
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
  });

  it('rejects ids that would be dangerous as object keys', () => {
    for (const id of ['__proto__', 'constructor', 'prototype']) {
      const data = plain();
      const old = data.profiles[0].id;
      data.profiles[0].id = id;
      for (const list of ['records', 'labs', 'vitals', 'medications', 'appointments', 'activity']) {
        for (const item of data[list]) if (item.profileId === old) item.profileId = id;
      }
      const result = parseAppDataJson(asJson(data), now);
      expect(result).toEqual({ ok: false, error: 'Person 1: the id is missing or not valid.' });
    }
  });

  it('validates already-parsed objects the same way', () => {
    const data = plain();
    Object.defineProperty(data, 'polluted', { value: 'yes', enumerable: true });
    const result = validateAppData(data, now);
    expect(result.ok && 'polluted' in result.data).toBe(false);
  });
});

describe('size limit', () => {
  it('refuses text over 5 MB before parsing it', () => {
    const huge = `{"schemaVersion":1,"pad":"${'x'.repeat(MAX_IMPORT_BYTES)}"}`;
    expect(parseAppDataJson(huge, now)).toEqual({ ok: false, error: TOO_BIG_MESSAGE });
  });

  it('refuses files over 5 MB without reading them', async () => {
    const file = new Blob([new Uint8Array(MAX_IMPORT_BYTES + 1)]);
    expect(await readFileText(file)).toEqual({ ok: false, error: TOO_BIG_MESSAGE });
    const small = new Blob(['{"ok":true}']);
    expect(await readFileText(small)).toEqual({ ok: true, text: '{"ok":true}' });
  });
});
