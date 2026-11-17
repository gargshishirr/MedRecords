import type {
  ActivityItem,
  Allergy,
  AppData,
  AppSettings,
  Appointment,
  Attachment,
  Condition,
  Doctor,
  DoseLog,
  EmergencyContact,
  HealthRecord,
  ISODate,
  LabResult,
  Medication,
  Profile,
  VitalReading,
} from './types';
import {
  ACTIVITY_KINDS,
  ALLERGY_SEVERITIES,
  AUTO_LOCK_MINUTES,
  BLOOD_GROUPS,
  CARD_SECTIONS,
  CONDITION_STATUSES,
  DEFAULT_AUTO_LOCK_MINUTES,
  DOSE_SLOTS,
  LAB_TEST_IDS,
  MEDICATION_FORMS,
  RECORD_TYPES,
  SEXES,
  VITAL_KINDS,
} from './types';
import { isValidISODate } from './date';

/**
 * Strict validation for stored data and imported backups.
 *
 * The result is rebuilt field by field from a whitelist, so unknown keys are
 * dropped, and keys that could pollute prototypes are rejected while parsing.
 * Every error message is written for people, not developers.
 */

export const SCHEMA_VERSION = 1;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const TOO_BIG_MESSAGE = 'That file is too big. MedRecords backups must be under 5 MB.';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d$/;

const LIMITS = {
  profiles: 50,
  records: 20_000,
  labs: 50_000,
  vitals: 50_000,
  medications: 2_000,
  appointments: 5_000,
  activity: 400,
  perPersonList: 50,
  contacts: 10,
  attachments: 20,
  doseDays: 4_000,
  dosesPerDay: 60,
};

export type ValidationResult = { ok: true; data: AppData } | { ok: false; error: string };

class InvalidData extends Error {}

function fail(message: string): never {
  throw new InvalidData(message);
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (o: Obj, key: string) => Object.prototype.hasOwnProperty.call(o, key);

export const isSafeId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v) && !FORBIDDEN_KEYS.has(v);

/** JSON.parse that strips `__proto__`, `constructor` and `prototype` keys at every depth. */
export function safeJsonParse(text: string): unknown {
  return JSON.parse(text, (key, value: unknown) => (FORBIDDEN_KEYS.has(key) ? undefined : value));
}

/* ------------------------------------------------------------------ */
/* Field readers                                                       */
/* ------------------------------------------------------------------ */

class Reader {
  constructor(
    private readonly o: Obj,
    private readonly where: string,
  ) {}

  private value(key: string): unknown {
    return has(this.o, key) ? this.o[key] : undefined;
  }

  /** A string field. Missing or empty gives `''` unless required. */
  text(key: string, label: string, max: number, required = false): string {
    const v = this.value(key);
    if (v === undefined || v === null || v === '') {
      if (required) fail(`${this.where}: the ${label} is missing.`);
      return '';
    }
    if (typeof v !== 'string') fail(`${this.where}: the ${label} should be text.`);
    const trimmed = v.trim();
    if (required && !trimmed) fail(`${this.where}: the ${label} is missing.`);
    if (trimmed.length > max) fail(`${this.where}: the ${label} is too long (max ${max} characters).`);
    return trimmed;
  }

  optText(key: string, label: string, max: number): string | undefined {
    return this.text(key, label, max) || undefined;
  }

  id(key = 'id', label = 'id'): string {
    const v = this.value(key);
    if (!isSafeId(v)) fail(`${this.where}: the ${label} is missing or not valid.`);
    return v;
  }

  date(key: string, label: string): ISODate {
    const v = this.value(key);
    if (!isValidISODate(v)) fail(`${this.where}: the ${label} is missing or not a valid date.`);
    return v;
  }

  optDate(key: string, label: string): ISODate | undefined {
    const v = this.value(key);
    if (v === undefined || v === null || v === '') return undefined;
    if (!isValidISODate(v)) fail(`${this.where}: the ${label} is not a valid date.`);
    return v;
  }

  num(key: string, label: string, min: number, max: number, integer = false): number {
    const v = this.value(key);
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${this.where}: the ${label} should be a number.`);
    if (v < min || v > max || (integer && !Number.isInteger(v))) fail(`${this.where}: the ${label} is out of range.`);
    return v;
  }

  optNum(key: string, label: string, min: number, max: number): number | undefined {
    const v = this.value(key);
    if (v === undefined || v === null) return undefined;
    return this.num(key, label, min, max);
  }

  oneOf<T extends string>(key: string, label: string, options: readonly T[], fallback?: T): T {
    const v = this.value(key);
    if ((v === undefined || v === null || v === '') && fallback !== undefined) return fallback;
    if (typeof v !== 'string' || !options.includes(v as T)) fail(`${this.where}: the ${label} is not recognised.`);
    return v as T;
  }

  bool(key: string, fallback: boolean): boolean {
    const v = this.value(key);
    return typeof v === 'boolean' ? v : fallback;
  }

  /** A list of objects. Missing gives an empty list. */
  list<T>(key: string, noun: string, max: number, read: (item: Reader, where: string) => T): T[] {
    const v = this.value(key);
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) fail(`${this.where}: the ${noun} list is not valid.`);
    if (v.length > max) fail(`${this.where}: too many ${noun} entries (max ${max}).`);
    return v.map((item: unknown, i) => {
      const where = `${this.where}, ${noun} ${i + 1}`;
      if (!isObj(item)) fail(`${where} is not valid.`);
      return read(new Reader(item, where), where);
    });
  }

  /** A list of known string values. Unknown values are dropped. */
  enumList<T extends string>(key: string, options: readonly T[]): T[] {
    const v = this.value(key);
    if (!Array.isArray(v)) return [];
    return options.filter((option) => v.includes(option));
  }

  object(key: string, label: string): Reader | undefined {
    const v = this.value(key);
    if (v === undefined || v === null) return undefined;
    if (!isObj(v)) fail(`${this.where}: the ${label} is not valid.`);
    return new Reader(v, this.where);
  }
}

/* ------------------------------------------------------------------ */
/* Collections                                                         */
/* ------------------------------------------------------------------ */

function readCollection<T extends { id: string }>(
  root: Obj,
  key: string,
  noun: string,
  max: number,
  read: (item: Reader, where: string) => T,
): T[] {
  const v = has(root, key) ? root[key] : undefined;
  if (v === undefined) return [];
  if (!Array.isArray(v)) fail(`This backup is damaged: the ${noun.toLowerCase()} list is not valid.`);
  if (v.length > max) fail(`This backup has too many ${noun.toLowerCase()} entries (max ${max.toLocaleString('en-IN')}).`);
  const seen = new Set<string>();
  return v.map((item: unknown, i) => {
    const where = `${noun} ${i + 1}`;
    if (!isObj(item)) fail(`${where} is not valid.`);
    const out = read(new Reader(item, where), where);
    if (seen.has(out.id)) fail(`${where}: its id is used more than once.`);
    seen.add(out.id);
    return out;
  });
}

function readDoctor(r: Reader | undefined): Doctor | undefined {
  if (!r) return undefined;
  const doctor: Doctor = {
    name: r.text('name', "doctor's name", 80),
    specialty: r.text('specialty', "doctor's specialty", 80),
    facility: r.text('facility', "doctor's clinic", 120),
    phone: r.text('phone', "doctor's phone", 40),
  };
  return Object.values(doctor).some(Boolean) ? doctor : undefined;
}

function readProfile(r: Reader): Profile {
  const profile: Profile = {
    id: r.id(),
    name: r.text('name', 'name', 80, true),
    relation: r.text('relation', 'relation', 40),
    dob: r.date('dob', 'date of birth'),
    sex: r.oneOf('sex', 'sex', SEXES),
    bloodGroup: r.oneOf('bloodGroup', 'blood group', BLOOD_GROUPS, 'Unknown'),
    hue: r.optNum('hue', 'colour', 0, 360) ?? 174,
    allergies: r.list<Allergy>('allergies', 'allergy', LIMITS.perPersonList, (a) => ({
      name: a.text('name', 'allergy name', 80, true),
      severity: a.oneOf('severity', 'severity', ALLERGY_SEVERITIES, 'moderate'),
      reaction: a.text('reaction', 'reaction', 160),
    })),
    conditions: r.list<Condition>('conditions', 'condition', LIMITS.perPersonList, (c) => {
      const condition: Condition = {
        name: c.text('name', 'condition name', 80, true),
        status: c.oneOf('status', 'status', CONDITION_STATUSES, 'active'),
      };
      const since = c.optDate('since', 'diagnosis date');
      if (since) condition.since = since;
      return condition;
    }),
    emergencyContacts: r.list<EmergencyContact>('emergencyContacts', 'contact', LIMITS.contacts, (c) => ({
      name: c.text('name', 'contact name', 80, true),
      relation: c.text('relation', 'relation', 40),
      phone: c.text('phone', 'phone number', 40),
    })),
  };
  const heightCm = r.optNum('heightCm', 'height', 20, 260);
  if (heightCm !== undefined) profile.heightCm = heightCm;
  const primaryDoctor = readDoctor(r.object('primaryDoctor', 'primary doctor'));
  if (primaryDoctor) profile.primaryDoctor = primaryDoctor;
  const cardHidden = r.enumList('cardHidden', CARD_SECTIONS);
  if (cardHidden.length) profile.cardHidden = cardHidden;
  return profile;
}

function belongsTo(profileIds: Set<string>) {
  return (r: Reader, where: string) => {
    const id = r.id('profileId', 'person id');
    if (!profileIds.has(id)) fail(`${where} belongs to a person who isn't in this backup.`);
    return id;
  };
}

function readSettings(root: Obj): AppSettings {
  const settings = has(root, 'settings') && isObj(root.settings) ? root.settings : {};
  const minutes = has(settings, 'autoLockMinutes') ? settings.autoLockMinutes : undefined;
  const allowed: readonly number[] = AUTO_LOCK_MINUTES;
  return {
    autoLockMinutes: typeof minutes === 'number' && allowed.includes(minutes) ? minutes : DEFAULT_AUTO_LOCK_MINUTES,
  };
}

function readDoseLog(root: Obj, profileIds: Set<string>): DoseLog {
  const value = has(root, 'doseLog') ? root.doseLog : undefined;
  if (value === undefined) return {};
  if (!isObj(value)) fail('This backup is damaged: the medication checklist is not valid.');
  const log: DoseLog = {};
  for (const profileId of Object.keys(value)) {
    // Entries for people who aren't in the backup are dropped.
    if (!profileIds.has(profileId)) continue;
    const days = value[profileId];
    if (!isObj(days)) fail('This backup is damaged: the medication checklist is not valid.');
    const dates = Object.keys(days).filter((d) => isValidISODate(d));
    if (dates.length > LIMITS.doseDays) fail('This backup has too many medication checklist days.');
    const out: Record<ISODate, string[]> = {};
    for (const date of dates) {
      const keys = days[date];
      if (!Array.isArray(keys)) fail('This backup is damaged: the medication checklist is not valid.');
      out[date] = [...new Set(keys.filter((k): k is string => typeof k === 'string' && k.length <= 120))].slice(
        0,
        LIMITS.dosesPerDay,
      );
    }
    log[profileId] = out;
  }
  return log;
}

/* ------------------------------------------------------------------ */
/* Entry points                                                        */
/* ------------------------------------------------------------------ */

const NOT_A_BACKUP = "This file isn't a MedRecords backup.";

export function validateAppData(value: unknown, now: Date = new Date()): ValidationResult {
  try {
    return { ok: true, data: readAppData(value, now) };
  } catch (err) {
    if (err instanceof InvalidData) return { ok: false, error: err.message };
    return { ok: false, error: NOT_A_BACKUP };
  }
}

function readAppData(value: unknown, now: Date): AppData {
  if (!isObj(value) || !has(value, 'schemaVersion')) fail(NOT_A_BACKUP);
  if (value.schemaVersion !== SCHEMA_VERSION) {
    fail(
      typeof value.schemaVersion === 'number' && value.schemaVersion > SCHEMA_VERSION
        ? 'This backup comes from a newer version of MedRecords, so it cannot be imported here.'
        : "This backup's format (schema version) is not supported.",
    );
  }
  const root = new Reader(value, 'This backup');

  const profiles = readCollection(value, 'profiles', 'Person', LIMITS.profiles, (r) => readProfile(r));
  const profileIds = new Set(profiles.map((p) => p.id));
  const owner = belongsTo(profileIds);

  const records = readCollection<HealthRecord>(value, 'records', 'Record', LIMITS.records, (r, where) => {
    const date = r.date('date', 'date');
    const record: HealthRecord = {
      id: r.id(),
      profileId: owner(r, where),
      type: r.oneOf('type', 'record type', RECORD_TYPES),
      title: r.text('title', 'title', 200, true),
      date,
      attachments: r.list<Attachment>('attachments', 'attachment', LIMITS.attachments, (a) => ({
        name: a.text('name', 'file name', 200, true),
        sizeKb: a.num('sizeKb', 'file size', 0, 10_000_000),
      })),
      createdAt: r.text('createdAt', 'added date', 40) || date,
    };
    const doctor = r.optText('doctor', 'doctor', 80);
    if (doctor) record.doctor = doctor;
    const facility = r.optText('facility', 'facility', 120);
    if (facility) record.facility = facility;
    const summary = r.optText('summary', 'summary', 2000);
    if (summary) record.summary = summary;
    const notes = r.optText('notes', 'notes', 5000);
    if (notes) record.notes = notes;
    const cost = r.optNum('cost', 'cost', 0, 100_000_000);
    if (cost !== undefined) record.cost = cost;
    return record;
  });
  const recordIds = new Set(records.map((r) => r.id));

  const labs = readCollection<LabResult>(value, 'labs', 'Lab result', LIMITS.labs, (r, where) => {
    const lab: LabResult = {
      id: r.id(),
      profileId: owner(r, where),
      testId: r.oneOf('testId', 'lab test', LAB_TEST_IDS),
      date: r.date('date', 'date'),
      value: r.num('value', 'result', -1_000_000, 1_000_000),
    };
    const recordId = r.optText('recordId', 'linked record', 100);
    // Links to records that don't exist are dropped rather than rejected.
    if (recordId && recordIds.has(recordId)) lab.recordId = recordId;
    return lab;
  });

  const vitals = readCollection<VitalReading>(value, 'vitals', 'Vital reading', LIMITS.vitals, (r, where) => {
    const vital: VitalReading = {
      id: r.id(),
      profileId: owner(r, where),
      kind: r.oneOf('kind', 'reading type', VITAL_KINDS),
      date: r.date('date', 'date'),
      value: r.num('value', 'reading', 0, 100_000),
    };
    const value2 = r.optNum('value2', 'second reading', 0, 100_000);
    if (value2 !== undefined) vital.value2 = value2;
    return vital;
  });

  const medications = readCollection<Medication>(value, 'medications', 'Medication', LIMITS.medications, (r, where) => {
    const startDate = r.date('startDate', 'start date');
    const med: Medication = {
      id: r.id(),
      profileId: owner(r, where),
      name: r.text('name', 'name', 120, true),
      strength: r.text('strength', 'strength', 60),
      form: r.oneOf('form', 'form', MEDICATION_FORMS, 'other'),
      dose: r.text('dose', 'dose', 60),
      frequency: r.text('frequency', 'frequency', 120),
      schedule: r.enumList('schedule', DOSE_SLOTS),
      purpose: r.text('purpose', 'purpose', 120),
      prescriber: r.text('prescriber', 'prescriber', 80),
      startDate,
      refillDate: r.optDate('refillDate', 'refill date') ?? startDate,
      supplyDays: r.num('supplyDays', 'days of supply', 1, 3650, true),
    };
    const instructions = r.optText('instructions', 'instructions', 500);
    if (instructions) med.instructions = instructions;
    const endDate = r.optDate('endDate', 'end date');
    if (endDate) med.endDate = endDate;
    return med;
  });

  const appointments = readCollection<Appointment>(value, 'appointments', 'Appointment', LIMITS.appointments, (r, where) => {
    const at = r.text('at', 'date and time', 16, true);
    const match = DATE_TIME_RE.exec(at);
    if (!match || !isValidISODate(match[1])) fail(`${where}: the date and time are not valid.`);
    return {
      id: r.id(),
      profileId: owner(r, where),
      at,
      doctor: r.text('doctor', 'doctor', 80),
      specialty: r.text('specialty', 'specialty', 80),
      facility: r.text('facility', 'place', 120),
      reason: r.text('reason', 'reason', 200, true),
    };
  });

  const rawActivity = has(value, 'activity') && Array.isArray(value.activity) ? value.activity.slice(0, LIMITS.activity) : [];
  const activity = readCollection<ActivityItem>(
    { activity: rawActivity },
    'activity',
    'Activity item',
    LIMITS.activity,
    (r, where) => ({
      id: r.id(),
      profileId: owner(r, where),
      at: r.text('at', 'time', 40, true),
      kind: r.oneOf('kind', 'kind', ACTIVITY_KINDS, 'data'),
      text: r.text('text', 'text', 300, true),
    }),
  );

  const requested = has(value, 'activeProfileId') ? value.activeProfileId : undefined;
  const activeProfileId = typeof requested === 'string' && profileIds.has(requested) ? requested : (profiles[0]?.id ?? '');

  return {
    schemaVersion: SCHEMA_VERSION,
    // Older versions only ever held the demo family, so a missing flag means demo data.
    demo: root.bool('demo', true),
    seededAt: root.text('seededAt', 'creation date', 40) || now.toISOString(),
    activeProfileId,
    profiles,
    records,
    labs,
    vitals,
    medications,
    appointments,
    doseLog: readDoseLog(value, profileIds),
    activity,
    settings: readSettings(value),
  };
}

/** Parses and validates JSON text (a backup file or stored data). */
export function parseAppDataJson(text: string, now: Date = new Date()): ValidationResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: TOO_BIG_MESSAGE };
  let parsed: unknown;
  try {
    parsed = safeJsonParse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON, so it can't be a MedRecords backup." };
  }
  return validateAppData(parsed, now);
}
