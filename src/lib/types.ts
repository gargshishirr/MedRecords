/** ISO calendar date, e.g. `2026-11-14` (local time, no timezone). */
export type ISODate = string;
/** ISO local date-time without timezone, e.g. `2026-11-14T10:30`. */
export type ISODateTime = string;

export const SEXES = ['Female', 'Male'] as const;
export type Sex = (typeof SEXES)[number];

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const ALLERGY_SEVERITIES = ['mild', 'moderate', 'severe'] as const;
export type AllergySeverity = (typeof ALLERGY_SEVERITIES)[number];

export interface Allergy {
  name: string;
  severity: AllergySeverity;
  reaction: string;
}

export const CONDITION_STATUSES = ['active', 'managed', 'resolved'] as const;
export type ConditionStatus = (typeof CONDITION_STATUSES)[number];

export interface Condition {
  name: string;
  /** When it was diagnosed, if known. */
  since?: ISODate;
  status: ConditionStatus;
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

/** Parts of the emergency card (and its QR code) a person can choose to hide. */
export const CARD_SECTIONS = ['dob', 'conditions', 'medications', 'doctor'] as const;
export type CardSection = (typeof CARD_SECTIONS)[number];

export interface Profile {
  id: string;
  name: string;
  /** Free text, e.g. "Self", "Mother", "Son". */
  relation: string;
  dob: ISODate;
  sex: Sex;
  bloodGroup: BloodGroup;
  /** Used for BMI. Optional because many people don't know it. */
  heightCm?: number;
  /** Hue (0–360) used for the avatar tint. */
  hue: number;
  allergies: Allergy[];
  conditions: Condition[];
  emergencyContacts: EmergencyContact[];
  primaryDoctor?: Doctor;
  /** Sections hidden from the emergency card and its QR code. */
  cardHidden?: CardSection[];
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

export const MEDICATION_FORMS = [
  'tablet',
  'capsule',
  'syrup',
  'drops',
  'sachet',
  'inhaler',
  'injection',
  'cream',
  'other',
] as const;
export type MedicationForm = (typeof MEDICATION_FORMS)[number];

export interface Medication {
  id: string;
  profileId: string;
  name: string;
  strength: string;
  form: MedicationForm;
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

export const ACTIVITY_KINDS = ['record', 'dose', 'refill', 'appointment', 'data'] as const;

export interface ActivityItem {
  id: string;
  profileId: string;
  at: string;
  kind: (typeof ACTIVITY_KINDS)[number];
  text: string;
}

/** profileId → ISO date → list of `${medicationId}:${slot}` keys taken that day. */
export type DoseLog = Record<string, Record<ISODate, string[]>>;

export const AUTO_LOCK_MINUTES = [1, 2, 5, 10, 15, 30, 60] as const;
export const DEFAULT_AUTO_LOCK_MINUTES = 5;

export interface AppSettings {
  /** Minutes of inactivity before the app locks (only used when a passcode is set). */
  autoLockMinutes: number;
}

export interface AppData {
  schemaVersion: 1;
  /** True for the fictional demo family, false for a person's own data. */
  demo: boolean;
  /** When this dataset was created (demo seed or "start fresh"). */
  seededAt: string;
  /** Empty when there are no people yet. */
  activeProfileId: string;
  profiles: Profile[];
  records: HealthRecord[];
  labs: LabResult[];
  vitals: VitalReading[];
  medications: Medication[];
  appointments: Appointment[];
  doseLog: DoseLog;
  activity: ActivityItem[];
  settings: AppSettings;
}

export type RangeStatus = 'normal' | 'watch' | 'high' | 'low';
