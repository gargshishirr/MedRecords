/** ISO calendar date, e.g. `2026-11-14` (local time, no timezone). */
export type ISODate = string;
/** ISO local date-time without timezone, e.g. `2026-11-14T10:30`. */
export type ISODateTime = string;

export type Sex = 'Female' | 'Male';
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export interface Allergy {
  name: string;
  severity: 'mild' | 'moderate' | 'severe';
  reaction: string;
}

export interface Condition {
  name: string;
  since: ISODate;
  status: 'active' | 'managed' | 'resolved';
}

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
}

export interface Doctor {
  name: string;
  specialty: string;
  facility: string;
  phone: string;
}

export interface Profile {
  id: string;
  name: string;
  relation: string;
  dob: ISODate;
  sex: Sex;
  bloodGroup: BloodGroup;
  heightCm: number;
  /** Hue (0–360) used for the avatar tint. */
  hue: number;
  allergies: Allergy[];
  conditions: Condition[];
  emergencyContacts: EmergencyContact[];
  primaryDoctor: Doctor;
}

export const RECORD_TYPES = ['visit', 'lab', 'prescription', 'imaging', 'vaccination', 'document'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export interface Attachment {
  name: string;
  sizeKb: number;
}

export interface HealthRecord {
  id: string;
  profileId: string;
  type: RecordType;
  title: string;
  date: ISODate;
  doctor?: string;
  facility?: string;
  summary?: string;
  notes?: string;
  /** Out-of-pocket cost in INR. */
  cost?: number;
  attachments: Attachment[];
  /** ISO timestamp of when the record was added to MedRecords. */
  createdAt: string;
}

export const LAB_TEST_IDS = ['hba1c', 'fbs', 'ldl', 'hb', 'vitd', 'tsh', 'creatinine'] as const;
export type LabTestId = (typeof LAB_TEST_IDS)[number];

export interface LabResult {
  id: string;
  profileId: string;
  testId: LabTestId;
  date: ISODate;
  value: number;
  recordId?: string;
}

export const VITAL_KINDS = ['bp', 'hr', 'glucose', 'weight', 'spo2'] as const;
export type VitalKind = (typeof VITAL_KINDS)[number];

export interface VitalReading {
  id: string;
  profileId: string;
  kind: VitalKind;
  date: ISODate;
  /** Systolic for blood pressure. */
  value: number;
  /** Diastolic for blood pressure. */
  value2?: number;
}

export const DOSE_SLOTS = ['morning', 'afternoon', 'night'] as const;
export type DoseSlot = (typeof DOSE_SLOTS)[number];

export interface Medication {
  id: string;
  profileId: string;
  name: string;
  strength: string;
  form: 'tablet' | 'capsule' | 'syrup' | 'drops' | 'sachet';
  dose: string;
  frequency: string;
  schedule: DoseSlot[];
  purpose: string;
  instructions?: string;
  prescriber: string;
  startDate: ISODate;
  endDate?: ISODate;
  /** Date of the last refill. */
  refillDate: ISODate;
  /** How many days one refill lasts. */
  supplyDays: number;
}

export interface Appointment {
  id: string;
  profileId: string;
  at: ISODateTime;
  doctor: string;
  specialty: string;
  facility: string;
  reason: string;
}

export interface ActivityItem {
  id: string;
  profileId: string;
  at: string;
  kind: 'record' | 'dose' | 'refill' | 'appointment' | 'data';
  text: string;
}

/** profileId → ISO date → list of `${medicationId}:${slot}` keys taken that day. */
export type DoseLog = Record<string, Record<ISODate, string[]>>;

export interface AppData {
  schemaVersion: 1;
  seededAt: string;
  activeProfileId: string;
  profiles: Profile[];
  records: HealthRecord[];
  labs: LabResult[];
  vitals: VitalReading[];
  medications: Medication[];
  appointments: Appointment[];
  doseLog: DoseLog;
  activity: ActivityItem[];
}

export type RangeStatus = 'normal' | 'watch' | 'high' | 'low';
