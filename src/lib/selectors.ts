import type { AppData, Appointment, HealthRecord, LabResult, LabTestId, Medication, VitalKind, VitalReading } from './types';
import { LAB_TEST_IDS } from './types';
import { toISODate } from './date';
import { isCurrentlyActive } from './meds';

const byDateDesc = <T extends { date: string }>(a: T, b: T) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const byDateAsc = <T extends { date: string }>(a: T, b: T) => -byDateDesc(a, b);

export function recordsFor(data: AppData, profileId: string): HealthRecord[] {
  return data.records
    .filter((r) => r.profileId === profileId)
    .sort((a, b) => byDateDesc(a, b) || (a.createdAt < b.createdAt ? 1 : -1));
}

export function labsFor(data: AppData, profileId: string): LabResult[] {
  return data.labs.filter((l) => l.profileId === profileId);
}

export function labSeries(labs: LabResult[], testId: LabTestId): LabResult[] {
  return labs.filter((l) => l.testId === testId).sort(byDateAsc);
}

/** Tests that have at least one result, in catalogue order. */
export function availableTests(labs: LabResult[]): LabTestId[] {
  const present = new Set(labs.map((l) => l.testId));
  return LAB_TEST_IDS.filter((id) => present.has(id));
}

/** Latest result per test, most recent first. */
export function latestLabs(labs: LabResult[]): { latest: LabResult; previous?: LabResult }[] {
  return availableTests(labs)
    .map((id) => {
      const series = labSeries(labs, id);
      return { latest: series[series.length - 1]!, previous: series[series.length - 2] };
    })
    .sort((a, b) => byDateDesc(a.latest, b.latest));
}

export function vitalSeries(data: AppData, profileId: string, kind: VitalKind): VitalReading[] {
  return data.vitals.filter((v) => v.profileId === profileId && v.kind === kind).sort(byDateAsc);
}

export function medicationsFor(data: AppData, profileId: string, now: Date) {
  const meds = data.medications.filter((m) => m.profileId === profileId);
  const active: Medication[] = [];
  const past: Medication[] = [];
  for (const m of meds) (isCurrentlyActive(m, now) ? active : past).push(m);
  past.sort((a, b) => ((a.endDate ?? '') < (b.endDate ?? '') ? 1 : -1));
  return { active, past };
}

export function upcomingAppointments(data: AppData, profileId: string, now: Date): Appointment[] {
  const today = toISODate(now);
  return data.appointments
    .filter((a) => a.profileId === profileId && a.at.slice(0, 10) >= today)
    .sort((a, b) => (a.at < b.at ? -1 : 1));
}

export function activityFor(data: AppData, profileId: string, limit = 6) {
  return data.activity
    .filter((a) => a.profileId === profileId)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit);
}
