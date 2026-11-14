import type { RecordType } from './types';

export interface RecordTypeMeta {
  label: string;
  plural: string;
  noun: string;
}

export const RECORD_TYPE_META: Record<RecordType, RecordTypeMeta> = {
  visit: { label: 'Visit', plural: 'Visits', noun: 'visit' },
  lab: { label: 'Lab report', plural: 'Lab reports', noun: 'lab report' },
  prescription: { label: 'Prescription', plural: 'Prescriptions', noun: 'prescription' },
  imaging: { label: 'Imaging', plural: 'Imaging', noun: 'imaging report' },
  vaccination: { label: 'Vaccination', plural: 'Vaccinations', noun: 'vaccination' },
  document: { label: 'Document', plural: 'Documents', noun: 'document' },
};
