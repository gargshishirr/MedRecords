import type { HealthRecord, ISODate, RecordType } from './types';
import { RECORD_TYPES } from './types';
import { isValidISODate } from './date';
import type { NewRecordInput } from './store';

export interface RecordFormValues {
  type: RecordType | '';
  title: string;
  date: string;
  doctor: string;
  facility: string;
  cost: string;
  notes: string;
}

export type RecordFormErrors = Partial<Record<keyof RecordFormValues, string>>;

export const TITLE_MAX = 80;
export const NAME_MAX = 80;
export const FACILITY_MAX = 120;
export const NOTES_MAX = 1000;
export const COST_MAX = 10_00_000;

export const EMPTY_RECORD_FORM: RecordFormValues = {
  type: '',
  title: '',
  date: '',
  doctor: '',
  facility: '',
  cost: '',
  notes: '',
};

export function recordToForm(r: HealthRecord): RecordFormValues {
  return {
    type: r.type,
    title: r.title,
    date: r.date,
    doctor: r.doctor ?? '',
    facility: r.facility ?? '',
    cost: r.cost !== undefined ? String(r.cost) : '',
    notes: r.notes ?? '',
  };
}

export function validateRecordForm(values: RecordFormValues, today: ISODate): RecordFormErrors {
  const errors: RecordFormErrors = {};

  if (!values.type || !RECORD_TYPES.includes(values.type)) errors.type = 'Choose a record type.';

  const title = values.title.trim();
  if (!title) errors.title = 'Enter a title, e.g. "Thyroid profile".';
  else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`;

  if (!values.date) errors.date = 'Enter the date of the record.';
  else if (!isValidISODate(values.date)) errors.date = 'Enter a valid date.';
  else if (values.date > today) errors.date = "The date can't be in the future.";
  else if (values.date < '1900-01-01') errors.date = 'Enter a date after 1900.';

  if (values.doctor.trim().length > NAME_MAX) errors.doctor = `Keep this under ${NAME_MAX} characters.`;
  if (values.facility.trim().length > FACILITY_MAX) errors.facility = `Keep this under ${FACILITY_MAX} characters.`;

  const cost = values.cost.trim().replace(/[,₹\s]/g, '');
  if (cost) {
    const n = Number(cost);
    if (!Number.isFinite(n) || n < 0) errors.cost = 'Enter the cost in rupees as a number, e.g. 1200.';
    else if (n > COST_MAX) errors.cost = 'That cost looks too high — enter up to ₹10,00,000.';
  }

  if (values.notes.length > NOTES_MAX) errors.notes = `Notes can be up to ${NOTES_MAX} characters.`;

  return errors;
}

export function toRecordInput(values: RecordFormValues): NewRecordInput {
  const cost = values.cost.trim().replace(/[,₹\s]/g, '');
  return {
    type: values.type as RecordType,
    title: values.title.trim(),
    date: values.date,
    doctor: values.doctor.trim() || undefined,
    facility: values.facility.trim() || undefined,
    notes: values.notes.trim() || undefined,
    cost: cost ? Math.round(Number(cost)) : undefined,
  };
}
