import type { ActivityItem, AppData, HealthRecord, ISODate, RecordType } from './types';
import { LAB_TEST_IDS, RECORD_TYPES, VITAL_KINDS } from './types';
import { createSeedData } from './seed';
import { isValidISODate, toISODate, toLocalISO } from './date';
import { RECORD_TYPE_META } from './recordMeta';

/** Versioned key — bump the suffix (and add a migration) if the schema changes. */
export const STORAGE_KEY = 'medrecords:data:v1';
export const SCHEMA_VERSION = 1;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type ValidationResult = { ok: true; data: AppData } | { ok: false; error: string };

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function checkArray(
  data: Record<string, unknown>,
  key: string,
  check: (item: Record<string, unknown>, path: string) => string | null,
): string | null {
  const list = data[key];
  if (!Array.isArray(list)) return `"${key}" must be a list`;
  for (let i = 0; i < list.length; i++) {
    const item: unknown = list[i];
    const path = `${key}[${i}]`;
    if (!isObject(item)) return `${path} must be an object`;
    const err = check(item, path);
    if (err) return err;
  }
  return null;
}

/**
 * Structural validation for persisted or imported data. It is intentionally
 * pragmatic: it checks everything the UI relies on, not every optional field.
 */
export function validateAppData(value: unknown): ValidationResult {
  if (!isObject(value)) return { ok: false, error: 'The file does not contain a MedRecords export.' };
  if (value.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, error: `Unsupported schema version (expected ${SCHEMA_VERSION}).` };
  }

  const profileIds = new Set<string>();
  const errors = [
    checkArray(value, 'profiles', (p, path) => {
      if (!isString(p.id) || !isString(p.name)) return `${path} needs an id and a name`;
      if (!isValidISODate(p.dob)) return `${path}.dob is not a valid date`;
      if (!Array.isArray(p.allergies) || !Array.isArray(p.conditions) || !Array.isArray(p.emergencyContacts)) {
        return `${path} is missing allergies, conditions or emergency contacts`;
      }
      if (!isObject(p.primaryDoctor)) return `${path}.primaryDoctor is missing`;
      profileIds.add(p.id);
      return null;
    }),
  ];
  if (errors[0]) return { ok: false, error: errors[0] };
  if (profileIds.size === 0) return { ok: false, error: 'At least one profile is required.' };

  const belongs = (item: Record<string, unknown>, path: string) =>
    isString(item.profileId) && profileIds.has(item.profileId) ? null : `${path}.profileId does not match a profile`;

  const rest = [
    checkArray(value, 'records', (r, path) => {
      if (!isString(r.id)) return `${path}.id is missing`;
      if (!RECORD_TYPES.includes(r.type as RecordType)) return `${path}.type is not a known record type`;
      if (!isString(r.title)) return `${path}.title is missing`;
      if (!isValidISODate(r.date)) return `${path}.date is not a valid date`;
      if (!Array.isArray(r.attachments)) return `${path}.attachments must be a list`;
      return belongs(r, path);
    }),
    checkArray(value, 'labs', (l, path) => {
      if (!LAB_TEST_IDS.includes(l.testId as never)) return `${path}.testId is not a known lab test`;
      if (typeof l.value !== 'number' || !Number.isFinite(l.value)) return `${path}.value must be a number`;
      if (!isValidISODate(l.date)) return `${path}.date is not a valid date`;
      return belongs(l, path);
    }),
    checkArray(value, 'vitals', (v, path) => {
      if (!VITAL_KINDS.includes(v.kind as never)) return `${path}.kind is not a known vital`;
      if (typeof v.value !== 'number' || !Number.isFinite(v.value)) return `${path}.value must be a number`;
      if (!isValidISODate(v.date)) return `${path}.date is not a valid date`;
      return belongs(v, path);
    }),
    checkArray(value, 'medications', (m, path) => {
      if (!isString(m.id) || !isString(m.name)) return `${path} needs an id and a name`;
      if (!Array.isArray(m.schedule)) return `${path}.schedule must be a list`;
      if (!isValidISODate(m.startDate) || !isValidISODate(m.refillDate)) return `${path} has an invalid date`;
      if (typeof m.supplyDays !== 'number' || m.supplyDays <= 0) return `${path}.supplyDays must be positive`;
      return belongs(m, path);
    }),
    checkArray(value, 'appointments', (a, path) => (isString(a.at) ? belongs(a, path) : `${path}.at is missing`)),
    checkArray(value, 'activity', (a, path) => (isString(a.text) ? belongs(a, path) : `${path}.text is missing`)),
  ].find(Boolean);
  if (rest) return { ok: false, error: rest };

  if (!isObject(value.doseLog)) return { ok: false, error: '"doseLog" must be an object' };

  const data = value as unknown as AppData;
  const activeProfileId = profileIds.has(data.activeProfileId) ? data.activeProfileId : [...profileIds][0]!;
  return { ok: true, data: { ...data, activeProfileId } };
}

export function parseImport(text: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  return validateAppData(parsed);
}

export function serialize(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

function safeStorage(): StorageLike | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

/** Loads saved data, seeding (and saving) the demo dataset on first run or if data is unreadable. */
export function loadData(storage: StorageLike | undefined = safeStorage(), now: Date = new Date()): AppData {
  const raw = storage?.getItem(STORAGE_KEY);
  if (raw) {
    const result = parseImport(raw);
    if (result.ok) return result.data;
  }
  const seeded = createSeedData(now);
  saveData(seeded, storage);
  return seeded;
}

export function saveData(data: AppData, storage: StorageLike | undefined = safeStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage may be full or unavailable (private mode); the app keeps working in memory.
  }
}

export function resetData(storage: StorageLike | undefined = safeStorage(), now: Date = new Date()): AppData {
  storage?.removeItem(STORAGE_KEY);
  return loadData(storage, now);
}

/* ------------------------------------------------------------------ */
/* Pure updates                                                        */
/* ------------------------------------------------------------------ */

function withActivity(data: AppData, item: Omit<ActivityItem, 'id'>): ActivityItem[] {
  return [{ ...item, id: newId('act') }, ...data.activity].slice(0, 400);
}

export interface NewRecordInput {
  type: RecordType;
  title: string;
  date: ISODate;
  doctor?: string;
  facility?: string;
  notes?: string;
  cost?: number;
}

export function createRecord(profileId: string, input: NewRecordInput, now: Date = new Date()): HealthRecord {
  return {
    id: newId('rec'),
    profileId,
    type: input.type,
    title: input.title.trim(),
    date: input.date,
    doctor: input.doctor?.trim() || undefined,
    facility: input.facility?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    cost: input.cost,
    attachments: [],
    createdAt: toLocalISO(now),
  };
}

export function insertRecord(data: AppData, record: HealthRecord): AppData {
  return {
    ...data,
    records: [record, ...data.records],
    activity: withActivity(data, {
      profileId: record.profileId,
      at: record.createdAt,
      kind: 'record',
      text: `Added ${RECORD_TYPE_META[record.type].noun}: ${record.title}`,
    }),
  };
}

export function addRecord(data: AppData, profileId: string, input: NewRecordInput, now: Date = new Date()) {
  const record = createRecord(profileId, input, now);
  return { data: insertRecord(data, record), record };
}

export function toggleDose(
  data: AppData,
  profileId: string,
  date: ISODate,
  key: string,
  label: string,
  now: Date = new Date(),
): AppData {
  const profileLog = data.doseLog[profileId] ?? {};
  const taken = profileLog[date] ?? [];
  const isTaken = taken.includes(key);
  const nextTaken = isTaken ? taken.filter((k) => k !== key) : [...taken, key];
  return {
    ...data,
    doseLog: { ...data.doseLog, [profileId]: { ...profileLog, [date]: nextTaken } },
    activity: isTaken
      ? data.activity
      : withActivity(data, { profileId, at: toLocalISO(now), kind: 'dose', text: `Took ${label}` }),
  };
}

export function markRefilled(data: AppData, medicationId: string, now: Date = new Date()): AppData {
  const med = data.medications.find((m) => m.id === medicationId);
  if (!med) return data;
  return {
    ...data,
    medications: data.medications.map((m) => (m.id === medicationId ? { ...m, refillDate: toISODate(now) } : m)),
    activity: withActivity(data, {
      profileId: med.profileId,
      at: toLocalISO(now),
      kind: 'refill',
      text: `Refilled ${med.name} ${med.strength}`,
    }),
  };
}
