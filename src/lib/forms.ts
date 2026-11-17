import type {
  AllergySeverity,
  Appointment,
  BloodGroup,
  ConditionStatus,
  DoseSlot,
  ISODate,
  LabResult,
  LabTestId,
  Medication,
  MedicationForm,
  Profile,
  Sex,
  VitalKind,
} from './types';
import { DOSE_SLOTS, LAB_TEST_IDS, MEDICATION_FORMS, SEXES } from './types';
import { isValidISODate } from './date';
import type { AppointmentInput, LabInput, MedicationInput, ProfileInput, VitalInput } from './store';

/** Errors keyed by field name. List rows use keys like `allergies.0.name`. */
export type FormErrors = Record<string, string>;

const PHONE_RE = /^[+\d][\d\s()-]*$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function checkLength(errors: FormErrors, key: string, value: string, max: number) {
  if (value.trim().length > max) errors[key] = `Keep this under ${max} characters.`;
}

function checkPastDate(errors: FormErrors, key: string, value: string, today: ISODate, required: boolean, what = 'date') {
  if (!value) {
    if (required) errors[key] = `Enter the ${what}.`;
    return;
  }
  if (!isValidISODate(value)) errors[key] = 'Enter a valid date.';
  else if (value > today) errors[key] = "The date can't be in the future.";
  else if (value < '1900-01-01') errors[key] = 'Enter a date after 1900.';
}

function checkPhone(errors: FormErrors, key: string, value: string) {
  const v = value.trim();
  if (!v) return;
  if (v.length > 40) errors[key] = 'Keep this under 40 characters.';
  else if (!PHONE_RE.test(v)) errors[key] = 'Use digits, spaces, + ( ) or - only.';
}

const filled = (row: Record<string, string>, keys: string[]) => keys.some((k) => (row[k] ?? '').trim() !== '');

/* ------------------------------------------------------------------ */
/* Family members                                                      */
/* ------------------------------------------------------------------ */

export interface ProfileFormValues {
  name: string;
  relation: string;
  dob: string;
  sex: Sex | '';
  bloodGroup: BloodGroup;
  heightCm: string;
  allergies: { name: string; severity: AllergySeverity; reaction: string }[];
  conditions: { name: string; since: string; status: ConditionStatus }[];
  contacts: { name: string; relation: string; phone: string }[];
  doctorName: string;
  doctorSpecialty: string;
  doctorFacility: string;
  doctorPhone: string;
}

export const EMPTY_PROFILE_FORM: ProfileFormValues = {
  name: '',
  relation: '',
  dob: '',
  sex: '',
  bloodGroup: 'Unknown',
  heightCm: '',
  allergies: [],
  conditions: [],
  contacts: [],
  doctorName: '',
  doctorSpecialty: '',
  doctorFacility: '',
  doctorPhone: '',
};

export function profileToForm(p: Profile): ProfileFormValues {
  return {
    name: p.name,
    relation: p.relation,
    dob: p.dob,
    sex: p.sex,
    bloodGroup: p.bloodGroup,
    heightCm: p.heightCm ? String(p.heightCm) : '',
    allergies: p.allergies.map((a) => ({ ...a })),
    conditions: p.conditions.map((c) => ({ name: c.name, since: c.since ?? '', status: c.status })),
    contacts: p.emergencyContacts.map((c) => ({ ...c })),
    doctorName: p.primaryDoctor?.name ?? '',
    doctorSpecialty: p.primaryDoctor?.specialty ?? '',
    doctorFacility: p.primaryDoctor?.facility ?? '',
    doctorPhone: p.primaryDoctor?.phone ?? '',
  };
}

export function validateProfileForm(v: ProfileFormValues, today: ISODate): FormErrors {
  const errors: FormErrors = {};
  if (!v.name.trim()) errors.name = 'Enter a name.';
  checkLength(errors, 'name', v.name, 80);
  checkLength(errors, 'relation', v.relation, 40);
  checkPastDate(errors, 'dob', v.dob, today, true, 'date of birth');
  if (!v.sex || !SEXES.includes(v.sex)) errors.sex = 'Choose female or male.';
  const height = v.heightCm.trim();
  if (height) {
    const n = Number(height);
    if (!Number.isFinite(n) || n < 30 || n > 250) errors.heightCm = 'Enter a height between 30 and 250 cm.';
  }

  v.allergies.forEach((a, i) => {
    if (!filled(a, ['name', 'reaction'])) return;
    if (!a.name.trim()) errors[`allergies.${i}.name`] = 'Enter what they are allergic to.';
    checkLength(errors, `allergies.${i}.name`, a.name, 80);
    checkLength(errors, `allergies.${i}.reaction`, a.reaction, 160);
  });
  v.conditions.forEach((c, i) => {
    if (!filled(c, ['name', 'since'])) return;
    if (!c.name.trim()) errors[`conditions.${i}.name`] = 'Enter the condition.';
    checkLength(errors, `conditions.${i}.name`, c.name, 80);
    checkPastDate(errors, `conditions.${i}.since`, c.since, today, false);
  });
  v.contacts.forEach((c, i) => {
    if (!filled(c, ['name', 'relation', 'phone'])) return;
    if (!c.name.trim()) errors[`contacts.${i}.name`] = 'Enter a name.';
    checkLength(errors, `contacts.${i}.name`, c.name, 80);
    checkLength(errors, `contacts.${i}.relation`, c.relation, 40);
    if (!c.phone.trim()) errors[`contacts.${i}.phone`] = 'Enter a phone number.';
    checkPhone(errors, `contacts.${i}.phone`, c.phone);
  });

  checkLength(errors, 'doctorName', v.doctorName, 80);
  checkLength(errors, 'doctorSpecialty', v.doctorSpecialty, 80);
  checkLength(errors, 'doctorFacility', v.doctorFacility, 120);
  checkPhone(errors, 'doctorPhone', v.doctorPhone);
  return errors;
}

/** Field ids in visual order, used to focus the first error. */
export function profileFieldOrder(v: ProfileFormValues): string[] {
  return [
    'name',
    'relation',
    'dob',
    'sex',
    'bloodGroup',
    'heightCm',
    ...v.allergies.flatMap((_, i) => [`allergies.${i}.name`, `allergies.${i}.reaction`]),
    ...v.conditions.flatMap((_, i) => [`conditions.${i}.name`, `conditions.${i}.since`]),
    ...v.contacts.flatMap((_, i) => [`contacts.${i}.name`, `contacts.${i}.relation`, `contacts.${i}.phone`]),
    'doctorName',
    'doctorSpecialty',
    'doctorFacility',
    'doctorPhone',
  ];
}

export function formToProfileInput(v: ProfileFormValues, keep?: Pick<Profile, 'cardHidden'>): ProfileInput {
  const input: ProfileInput = {
    name: v.name.trim(),
    relation: v.relation.trim(),
    dob: v.dob,
    sex: v.sex as Sex,
    bloodGroup: v.bloodGroup,
    allergies: v.allergies
      .filter((a) => a.name.trim())
      .map((a) => ({ name: a.name.trim(), severity: a.severity, reaction: a.reaction.trim() })),
    conditions: v.conditions
      .filter((c) => c.name.trim())
      .map((c) =>
        c.since ? { name: c.name.trim(), since: c.since, status: c.status } : { name: c.name.trim(), status: c.status },
      ),
    emergencyContacts: v.contacts
      .filter((c) => c.name.trim())
      .map((c) => ({ name: c.name.trim(), relation: c.relation.trim(), phone: c.phone.trim() })),
  };
  if (v.heightCm.trim()) input.heightCm = Math.round(Number(v.heightCm) * 10) / 10;
  const doctor = {
    name: v.doctorName.trim(),
    specialty: v.doctorSpecialty.trim(),
    facility: v.doctorFacility.trim(),
    phone: v.doctorPhone.trim(),
  };
  if (Object.values(doctor).some(Boolean)) input.primaryDoctor = doctor;
  if (keep?.cardHidden?.length) input.cardHidden = keep.cardHidden;
  return input;
}

/* ------------------------------------------------------------------ */
/* Medications                                                         */
/* ------------------------------------------------------------------ */

export interface MedicationFormValues {
  name: string;
  strength: string;
  form: MedicationForm;
  dose: string;
  frequency: string;
  schedule: DoseSlot[];
  purpose: string;
  instructions: string;
  prescriber: string;
  startDate: string;
  endDate: string;
  refillDate: string;
  supplyDays: string;
}

export const MEDICATION_FIELD_ORDER = [
  'name',
  'strength',
  'form',
  'dose',
  'frequency',
  'purpose',
  'prescriber',
  'startDate',
  'endDate',
  'refillDate',
  'supplyDays',
  'instructions',
];

export function emptyMedicationForm(today: ISODate): MedicationFormValues {
  return {
    name: '',
    strength: '',
    form: 'tablet',
    dose: '',
    frequency: '',
    schedule: [],
    purpose: '',
    instructions: '',
    prescriber: '',
    startDate: today,
    endDate: '',
    refillDate: today,
    supplyDays: '30',
  };
}

export function medicationToForm(m: Medication): MedicationFormValues {
  return {
    name: m.name,
    strength: m.strength,
    form: m.form,
    dose: m.dose,
    frequency: m.frequency,
    schedule: [...m.schedule],
    purpose: m.purpose,
    instructions: m.instructions ?? '',
    prescriber: m.prescriber,
    startDate: m.startDate,
    endDate: m.endDate ?? '',
    refillDate: m.refillDate,
    supplyDays: String(m.supplyDays),
  };
}

export function validateMedicationForm(v: MedicationFormValues, today: ISODate): FormErrors {
  const errors: FormErrors = {};
  if (!v.name.trim()) errors.name = 'Enter the medicine name.';
  checkLength(errors, 'name', v.name, 120);
  checkLength(errors, 'strength', v.strength, 60);
  if (!MEDICATION_FORMS.includes(v.form)) errors.form = 'Choose a form.';
  checkLength(errors, 'dose', v.dose, 60);
  checkLength(errors, 'frequency', v.frequency, 120);
  checkLength(errors, 'purpose', v.purpose, 120);
  checkLength(errors, 'prescriber', v.prescriber, 80);
  checkLength(errors, 'instructions', v.instructions, 500);
  if (!v.startDate) errors.startDate = 'Enter the start date.';
  else if (!isValidISODate(v.startDate)) errors.startDate = 'Enter a valid date.';
  if (v.endDate) {
    if (!isValidISODate(v.endDate)) errors.endDate = 'Enter a valid date.';
    else if (v.startDate && v.endDate < v.startDate) errors.endDate = "The end date can't be before the start date.";
  }
  checkPastDate(errors, 'refillDate', v.refillDate, today, true, 'last refill date');
  const days = Number(v.supplyDays.trim());
  if (!v.supplyDays.trim() || !Number.isInteger(days) || days < 1 || days > 3650) {
    errors.supplyDays = 'Enter a whole number of days between 1 and 3650.';
  }
  return errors;
}

export function formToMedicationInput(v: MedicationFormValues): MedicationInput {
  const input: MedicationInput = {
    name: v.name.trim(),
    strength: v.strength.trim(),
    form: v.form,
    dose: v.dose.trim(),
    frequency: v.frequency.trim(),
    schedule: DOSE_SLOTS.filter((s) => v.schedule.includes(s)),
    purpose: v.purpose.trim(),
    prescriber: v.prescriber.trim(),
    startDate: v.startDate,
    refillDate: v.refillDate,
    supplyDays: Number(v.supplyDays.trim()),
  };
  if (v.instructions.trim()) input.instructions = v.instructions.trim();
  if (v.endDate) input.endDate = v.endDate;
  return input;
}

/* ------------------------------------------------------------------ */
/* Lab results                                                         */
/* ------------------------------------------------------------------ */

export interface LabFormValues {
  testId: LabTestId | '';
  date: string;
  value: string;
  recordId: string;
}

export const LAB_FIELD_ORDER = ['testId', 'value', 'date', 'recordId'];

export function labToForm(l: LabResult): LabFormValues {
  return { testId: l.testId, date: l.date, value: String(l.value), recordId: l.recordId ?? '' };
}

export function validateLabForm(v: LabFormValues, today: ISODate): FormErrors {
  const errors: FormErrors = {};
  if (!v.testId || !LAB_TEST_IDS.includes(v.testId)) errors.testId = 'Choose a test.';
  const raw = v.value.trim().replace(',', '.');
  const n = Number(raw);
  if (!raw) errors.value = 'Enter the result.';
  else if (!Number.isFinite(n) || n < 0 || n > 100_000) errors.value = 'Enter the result as a number, e.g. 5.8.';
  checkPastDate(errors, 'date', v.date, today, true, 'test date');
  return errors;
}

export function formToLabInput(v: LabFormValues): LabInput {
  const input: LabInput = { testId: v.testId as LabTestId, date: v.date, value: Number(v.value.trim().replace(',', '.')) };
  if (v.recordId) input.recordId = v.recordId;
  return input;
}

/* ------------------------------------------------------------------ */
/* Vitals                                                              */
/* ------------------------------------------------------------------ */

export interface VitalFormValues {
  kind: VitalKind;
  date: string;
  value: string;
  value2: string;
}

export const VITAL_LIMITS: Record<VitalKind, { min: number; max: number; example: string }> = {
  bp: { min: 40, max: 300, example: '120' },
  hr: { min: 20, max: 250, example: '72' },
  glucose: { min: 20, max: 700, example: '95' },
  weight: { min: 1, max: 400, example: '62.5' },
  spo2: { min: 50, max: 100, example: '98' },
};

export function validateVitalForm(v: VitalFormValues, today: ISODate): FormErrors {
  const errors: FormErrors = {};
  const { min, max, example } = VITAL_LIMITS[v.kind];
  const check = (key: 'value' | 'value2', min2 = min, max2 = max) => {
    const raw = v[key].trim().replace(',', '.');
    const n = Number(raw);
    if (!raw) errors[key] = 'Enter the reading.';
    else if (!Number.isFinite(n) || n < min2 || n > max2)
      errors[key] = `Enter a number between ${min2} and ${max2}, e.g. ${example}.`;
  };
  check('value');
  if (v.kind === 'bp') check('value2', 20, 200);
  checkPastDate(errors, 'date', v.date, today, true);
  return errors;
}

export function formToVitalInput(v: VitalFormValues): VitalInput {
  const num = (s: string) => Number(s.trim().replace(',', '.'));
  const decimals = v.kind === 'weight' ? 10 : 1;
  const input: VitalInput = { kind: v.kind, date: v.date, value: Math.round(num(v.value) * decimals) / decimals };
  if (v.kind === 'bp') input.value2 = Math.round(num(v.value2));
  return input;
}

/* ------------------------------------------------------------------ */
/* Appointments                                                        */
/* ------------------------------------------------------------------ */

export interface AppointmentFormValues {
  date: string;
  time: string;
  reason: string;
  doctor: string;
  specialty: string;
  facility: string;
}

export const APPOINTMENT_FIELD_ORDER = ['date', 'time', 'reason', 'doctor', 'specialty', 'facility'];

export function appointmentToForm(a: Appointment): AppointmentFormValues {
  const [date = '', time = ''] = a.at.split('T');
  return { date, time: time.slice(0, 5), reason: a.reason, doctor: a.doctor, specialty: a.specialty, facility: a.facility };
}

export function validateAppointmentForm(v: AppointmentFormValues, today: ISODate): FormErrors {
  const errors: FormErrors = {};
  if (!v.date) errors.date = 'Enter the date.';
  else if (!isValidISODate(v.date)) errors.date = 'Enter a valid date.';
  else if (v.date < today) errors.date = 'Pick today or a later date.';
  if (!v.time) errors.time = 'Enter the time.';
  else if (!TIME_RE.test(v.time)) errors.time = 'Enter a valid time.';
  if (!v.reason.trim()) errors.reason = 'Say what the appointment is for.';
  checkLength(errors, 'reason', v.reason, 200);
  checkLength(errors, 'doctor', v.doctor, 80);
  checkLength(errors, 'specialty', v.specialty, 80);
  checkLength(errors, 'facility', v.facility, 120);
  return errors;
}

export function formToAppointmentInput(v: AppointmentFormValues): AppointmentInput {
  return {
    at: `${v.date}T${v.time}`,
    reason: v.reason.trim(),
    doctor: v.doctor.trim(),
    specialty: v.specialty.trim(),
    facility: v.facility.trim(),
  };
}

/* ------------------------------------------------------------------ */
/* Passcodes                                                           */
/* ------------------------------------------------------------------ */

export const PASSCODE_MIN = 8;
export const PASSCODE_MAX = 128;

export function validateNewPasscode(passcode: string, confirm: string): FormErrors {
  const errors: FormErrors = {};
  if (passcode.length < PASSCODE_MIN) errors.passcode = `Use at least ${PASSCODE_MIN} characters.`;
  else if (passcode.length > PASSCODE_MAX) errors.passcode = `Keep it under ${PASSCODE_MAX} characters.`;
  if (!errors.passcode && confirm !== passcode) errors.confirm = "The two passcodes don't match.";
  return errors;
}
