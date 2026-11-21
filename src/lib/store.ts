import type {
  ActivityItem,
  AppData,
  AppSettings,
  Appointment,
  Attachment,
  HealthRecord,
  ISODate,
  LabResult,
  LabTestId,
  Medication,
  Profile,
  RecordType,
  ReminderSettings,
  VitalReading,
} from './types';
import { DEFAULT_AUTO_LOCK_MINUTES, DEFAULT_REMINDERS } from './types';
import type { Envelope } from './crypto';
import { parseEnvelope } from './crypto';
import { MAX_ATTACHMENTS } from './files';
import { toISODate, toLocalISO } from './date';
import { RECORD_TYPE_META } from './recordMeta';
import { LAB_TESTS } from './ranges';
import { SCHEMA_VERSION, parseAppDataJson, safeJsonParse } from './validate';

/** Plain data (when no passcode is set). Versioned: bump the suffix and add a migration if the schema changes. */
export const STORAGE_KEY = 'medrecords:data:v1';
/** Encrypted data (when a passcode is set). Holds only `{ v, salt, iv, ct }`. */
export const VAULT_KEY = 'medrecords:vault:v1';
/** Written by "Lock now" so other open tabs lock too. Holds no data. */
export const LOCK_SIGNAL_KEY = 'medrecords:lock-signal';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export const DEFAULT_SETTINGS: AppSettings = { autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES, reminders: DEFAULT_REMINDERS };

/** An empty dataset for someone starting fresh: no people yet. */
export function createEmptyData(now: Date = new Date(), settings: AppSettings = DEFAULT_SETTINGS): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    demo: false,
    seededAt: now.toISOString(),
    activeProfileId: '',
    profiles: [],
    records: [],
    labs: [],
    vitals: [],
    medications: [],
    appointments: [],
    doseLog: {},
    activity: [],
    settings: { ...settings, reminders: { ...settings.reminders, times: { ...settings.reminders.times } } },
  };
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

export function safeStorage(): StorageLike | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

export type StoredState =
  | { kind: 'empty' }
  | { kind: 'plain'; data: AppData }
  | { kind: 'vault'; envelope: Envelope }
  | { kind: 'damaged'; what: 'plain' | 'vault' };

/** Reads what is saved. An encrypted vault always wins over plain data. */
export function readStored(storage: StorageLike | undefined, now: Date = new Date()): StoredState {
  const vaultRaw = storage?.getItem(VAULT_KEY);
  if (vaultRaw != null) {
    let envelope: Envelope | null = null;
    try {
      envelope = parseEnvelope(safeJsonParse(vaultRaw));
    } catch {
      envelope = null;
    }
    return envelope ? { kind: 'vault', envelope } : { kind: 'damaged', what: 'vault' };
  }
  const raw = storage?.getItem(STORAGE_KEY);
  if (raw == null) return { kind: 'empty' };
  const result = parseAppDataJson(raw, now);
  return result.ok ? { kind: 'plain', data: result.data } : { kind: 'damaged', what: 'plain' };
}

/* ------------------------------------------------------------------ */
/* Pure updates                                                        */
/* ------------------------------------------------------------------ */

function withActivity(data: AppData, item: Omit<ActivityItem, 'id'>): ActivityItem[] {
  return [{ ...item, id: newId('act') }, ...data.activity].slice(0, 400);
}

/** Replaces the dataset but keeps this device's settings (like the auto-lock time). */
export function withSettings(next: AppData, current: AppData): AppData {
  return { ...next, settings: { ...current.settings } };
}

export function setAutoLockMinutes(data: AppData, minutes: number): AppData {
  return { ...data, settings: { ...data.settings, autoLockMinutes: minutes } };
}

export function setReminders(data: AppData, reminders: ReminderSettings): AppData {
  return { ...data, settings: { ...data.settings, reminders: { enabled: reminders.enabled, times: { ...reminders.times } } } };
}

/* ---------- Attached files ---------- */

/** Adds file metadata to a record (the encrypted bytes are stored separately), up to the per-record limit. */
export function addAttachments(data: AppData, recordId: string, files: Attachment[]): AppData {
  return {
    ...data,
    records: data.records.map((r) =>
      r.id === recordId ? { ...r, attachments: [...r.attachments, ...files].slice(0, MAX_ATTACHMENTS) } : r,
    ),
  };
}

/** Removes one attachment from a record, by its stored-file id or (for older name-only files) its index. */
export function removeAttachment(data: AppData, recordId: string, index: number): AppData {
  return {
    ...data,
    records: data.records.map((r) =>
      r.id === recordId ? { ...r, attachments: r.attachments.filter((_, i) => i !== index) } : r,
    ),
  };
}

/** Every stored-file id the data still points to. */
export function referencedFileIds(data: AppData): Set<string> {
  const ids = new Set<string>();
  for (const r of data.records) for (const a of r.attachments) if (a.fileId) ids.add(a.fileId);
  return ids;
}

/* ---------- Vaccine schedule ---------- */

/** Marks a scheduled vaccine as given on `date`, or clears it when `date` is null. */
export function setVaccine(data: AppData, profileId: string, vaccineId: string, date: ISODate | null): AppData {
  return {
    ...data,
    profiles: data.profiles.map((p) => {
      if (p.id !== profileId) return p;
      const { vaccines: current, ...rest } = p;
      const vaccines = { ...(current ?? {}) };
      if (date) vaccines[vaccineId] = date;
      else delete vaccines[vaccineId];
      return Object.keys(vaccines).length ? { ...rest, vaccines } : rest;
    }),
  };
}

/** Reads one person's medication checklist without touching inherited properties. */
export function doseLogFor(data: AppData, profileId: string): Record<ISODate, string[]> | undefined {
  return Object.prototype.hasOwnProperty.call(data.doseLog, profileId) ? data.doseLog[profileId] : undefined;
}

/* ---------- People ---------- */

export type ProfileInput = Omit<Profile, 'id' | 'hue'>;

const AVATAR_HUES = [174, 22, 232, 330, 95, 270, 45, 200];

export function createProfile(input: ProfileInput, existing: Profile[]): Profile {
  const used = new Set(existing.map((p) => p.hue));
  const hue = AVATAR_HUES.find((h) => !used.has(h)) ?? AVATAR_HUES[existing.length % AVATAR_HUES.length]!;
  return { ...input, id: newId('p'), hue };
}

/** Adds a person and switches to them. */
export function insertProfile(data: AppData, profile: Profile): AppData {
  return { ...data, profiles: [...data.profiles, profile], activeProfileId: profile.id };
}

export function addProfile(data: AppData, input: ProfileInput): { data: AppData; profile: Profile } {
  const profile = createProfile(input, data.profiles);
  return { data: insertProfile(data, profile), profile };
}

export function updateProfile(data: AppData, id: string, input: Partial<ProfileInput>): AppData {
  return { ...data, profiles: data.profiles.map((p) => (p.id === id ? { ...p, ...input, id: p.id, hue: p.hue } : p)) };
}

/** Removes a person and everything that belongs to them. */
export function deleteProfile(data: AppData, id: string): AppData {
  const profiles = data.profiles.filter((p) => p.id !== id);
  const keep = <T extends { profileId: string }>(list: T[]) => list.filter((item) => item.profileId !== id);
  const doseLog = { ...data.doseLog };
  delete doseLog[id];
  return {
    ...data,
    profiles,
    activeProfileId:
      data.activeProfileId === id || !profiles.some((p) => p.id === data.activeProfileId)
        ? (profiles[0]?.id ?? '')
        : data.activeProfileId,
    records: keep(data.records),
    labs: keep(data.labs),
    vitals: keep(data.vitals),
    medications: keep(data.medications),
    appointments: keep(data.appointments),
    activity: keep(data.activity),
    doseLog,
  };
}

/* ---------- Records ---------- */

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

export function updateRecord(data: AppData, id: string, input: NewRecordInput): AppData {
  return {
    ...data,
    records: data.records.map((r) =>
      r.id === id
        ? {
            ...r,
            type: input.type,
            title: input.title.trim(),
            date: input.date,
            doctor: input.doctor?.trim() || undefined,
            facility: input.facility?.trim() || undefined,
            notes: input.notes?.trim() || undefined,
            cost: input.cost,
          }
        : r,
    ),
  };
}

/** Deletes a record and the lab results that came from it. */
export function deleteRecord(data: AppData, id: string): AppData {
  return {
    ...data,
    records: data.records.filter((r) => r.id !== id),
    labs: data.labs.filter((l) => l.recordId !== id),
  };
}

/* ---------- Lab results ---------- */

export interface LabInput {
  testId: LabTestId;
  date: ISODate;
  value: number;
  recordId?: string;
}

export function createLab(profileId: string, input: LabInput): LabResult {
  const lab: LabResult = { id: newId('lab'), profileId, testId: input.testId, date: input.date, value: input.value };
  if (input.recordId) lab.recordId = input.recordId;
  return lab;
}

export function insertLab(data: AppData, lab: LabResult, now: Date = new Date()): AppData {
  return {
    ...data,
    labs: [...data.labs, lab],
    activity: withActivity(data, {
      profileId: lab.profileId,
      at: toLocalISO(now),
      kind: 'data',
      text: `Added ${LAB_TESTS[lab.testId].name} result`,
    }),
  };
}

export function addLab(data: AppData, profileId: string, input: LabInput, now: Date = new Date()) {
  const lab = createLab(profileId, input);
  return { lab, data: insertLab(data, lab, now) };
}

export function updateLab(data: AppData, id: string, input: LabInput): AppData {
  return {
    ...data,
    labs: data.labs.map((l) => {
      if (l.id !== id) return l;
      const next: LabResult = { id: l.id, profileId: l.profileId, testId: input.testId, date: input.date, value: input.value };
      if (input.recordId) next.recordId = input.recordId;
      return next;
    }),
  };
}

export function deleteLab(data: AppData, id: string): AppData {
  return { ...data, labs: data.labs.filter((l) => l.id !== id) };
}

/* ---------- Vitals ---------- */

export type VitalInput = Omit<VitalReading, 'id' | 'profileId'>;

export function addVital(data: AppData, profileId: string, input: VitalInput): AppData {
  return { ...data, vitals: [...data.vitals, { ...input, id: newId('vit'), profileId }] };
}

export function deleteVital(data: AppData, id: string): AppData {
  return { ...data, vitals: data.vitals.filter((v) => v.id !== id) };
}

/* ---------- Medications ---------- */

export type MedicationInput = Omit<Medication, 'id' | 'profileId'>;

export function createMedication(profileId: string, input: MedicationInput): Medication {
  return { ...input, id: newId('med'), profileId };
}

export function insertMedication(data: AppData, medication: Medication, now: Date = new Date()): AppData {
  return {
    ...data,
    medications: [...data.medications, medication],
    activity: withActivity(data, {
      profileId: medication.profileId,
      at: toLocalISO(now),
      kind: 'data',
      text: `Added medication: ${[medication.name, medication.strength].filter(Boolean).join(' ')}`,
    }),
  };
}

export function addMedication(data: AppData, profileId: string, input: MedicationInput, now: Date = new Date()) {
  const medication = createMedication(profileId, input);
  return { medication, data: insertMedication(data, medication, now) };
}

export function updateMedication(data: AppData, id: string, input: MedicationInput): AppData {
  return {
    ...data,
    medications: data.medications.map((m) => (m.id === id ? { ...input, id: m.id, profileId: m.profileId } : m)),
  };
}

/** Deletes a medication and its ticks in the daily checklist. */
export function deleteMedication(data: AppData, id: string): AppData {
  const med = data.medications.find((m) => m.id === id);
  if (!med) return data;
  const personLog = doseLogFor(data, med.profileId);
  const doseLog = { ...data.doseLog };
  if (personLog) {
    const cleaned: Record<ISODate, string[]> = {};
    for (const [date, keys] of Object.entries(personLog)) {
      const left = keys.filter((k) => !k.startsWith(`${id}:`));
      if (left.length) cleaned[date] = left;
    }
    doseLog[med.profileId] = cleaned;
  }
  return { ...data, medications: data.medications.filter((m) => m.id !== id), doseLog };
}

/* ---------- Appointments ---------- */

export type AppointmentInput = Omit<Appointment, 'id' | 'profileId'>;

export function createAppointment(profileId: string, input: AppointmentInput): Appointment {
  return { ...input, id: newId('apt'), profileId };
}

export function insertAppointment(data: AppData, appointment: Appointment, now: Date = new Date()): AppData {
  return {
    ...data,
    appointments: [...data.appointments, appointment],
    activity: withActivity(data, {
      profileId: appointment.profileId,
      at: toLocalISO(now),
      kind: 'appointment',
      text: `Added appointment: ${appointment.reason}`,
    }),
  };
}

export function addAppointment(data: AppData, profileId: string, input: AppointmentInput, now: Date = new Date()) {
  const appointment = createAppointment(profileId, input);
  return { appointment, data: insertAppointment(data, appointment, now) };
}

export function updateAppointment(data: AppData, id: string, input: AppointmentInput): AppData {
  return {
    ...data,
    appointments: data.appointments.map((a) => (a.id === id ? { ...input, id: a.id, profileId: a.profileId } : a)),
  };
}

export function deleteAppointment(data: AppData, id: string): AppData {
  return { ...data, appointments: data.appointments.filter((a) => a.id !== id) };
}

/* ---------- Daily checklist and refills ---------- */

export function toggleDose(
  data: AppData,
  profileId: string,
  date: ISODate,
  key: string,
  label: string,
  now: Date = new Date(),
): AppData {
  const profileLog = doseLogFor(data, profileId) ?? {};
  const taken = Object.prototype.hasOwnProperty.call(profileLog, date) ? (profileLog[date] ?? []) : [];
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
      text: `Refilled ${[med.name, med.strength].filter(Boolean).join(' ')}`,
    }),
  };
}
