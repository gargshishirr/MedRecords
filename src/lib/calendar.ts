/**
 * Calendar files (.ics, RFC 5545) for medicines and appointments. Phones and
 * calendar apps then remind people even when MedRecords is closed.
 *
 * Times are "floating" local times (no time zone), so 08:00 stays 08:00
 * wherever the calendar is.
 */
import type { Appointment, ClockTime, DoseSlot, ISODate, Medication } from './types';
import { addDays, parseISODate, toISODate } from './date';
import { SLOT_LABEL } from './meds';

const CRLF = '\r\n';
const encoder = new TextEncoder();

export function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

/** Folds a content line to 75 octets, never splitting a character. */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    // The first line holds 75 octets; continuation lines start with a space, leaving 74.
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

const pad = (n: number) => String(n).padStart(2, '0');
const localStamp = (date: ISODate, time: ClockTime) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
const utcStamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

interface EventSpec {
  uid: string;
  start: string;
  minutes: number;
  summary: string;
  description?: string;
  location?: string;
  rrule?: string;
  /** Alarm offsets, e.g. `PT0M` (at the start) or `-P1D`. */
  alarms: string[];
}

function event(spec: EventSpec, now: Date): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${spec.uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${spec.start}`,
    `DURATION:PT${spec.minutes}M`,
    `SUMMARY:${escapeText(spec.summary)}`,
  ];
  if (spec.rrule) lines.push(`RRULE:${spec.rrule}`);
  if (spec.description) lines.push(`DESCRIPTION:${escapeText(spec.description)}`);
  if (spec.location) lines.push(`LOCATION:${escapeText(spec.location)}`);
  for (const trigger of spec.alarms) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${trigger}`, `DESCRIPTION:${escapeText(spec.summary)}`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

function calendar(events: string[][]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MedRecords//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events.flat(), 'END:VCALENDAR'];
  return lines.map(foldLine).join(CRLF) + CRLF;
}

const medLabel = (med: Medication) => [med.name, med.strength].filter(Boolean).join(' ');

/** Daily dose reminders for each scheduled time, plus a refill reminder two days before supply runs out. */
export function medicationCalendar(
  med: Medication,
  personName: string,
  times: Record<DoseSlot, ClockTime>,
  now: Date,
): string {
  const today = toISODate(now);
  const start = med.startDate > today ? med.startDate : today;
  const label = medLabel(med);
  const details = [med.dose, med.frequency, med.instructions].filter(Boolean).join(' · ');
  const events = med.schedule.map((slot) =>
    event(
      {
        uid: `${med.id}-${slot}@medrecords`,
        start: localStamp(start, times[slot]),
        minutes: 10,
        summary: `${label} (${personName})`,
        description: [`${SLOT_LABEL[slot]} dose`, details].filter(Boolean).join(' · '),
        rrule: med.endDate ? `FREQ=DAILY;UNTIL=${localStamp(med.endDate, '23:59')}` : 'FREQ=DAILY',
        alarms: ['PT0M'],
      },
      now,
    ),
  );
  const refillOn = toISODate(addDays(parseISODate(med.refillDate), Math.max(0, med.supplyDays - 2)));
  if (refillOn >= today && (!med.endDate || refillOn <= med.endDate)) {
    events.push(
      event(
        {
          uid: `${med.id}-refill-${refillOn}@medrecords`,
          start: localStamp(refillOn, times.morning),
          minutes: 15,
          summary: `Refill ${label} (${personName})`,
          description: 'About two days of supply left.',
          alarms: ['PT0M'],
        },
        now,
      ),
    );
  }
  return calendar(events);
}

/** One appointment, with reminders a day and two hours before. */
export function appointmentCalendar(appt: Appointment, personName: string, now: Date): string {
  const [date, time] = appt.at.split('T') as [ISODate, ClockTime];
  const who = [appt.doctor, appt.specialty].filter(Boolean).join(', ');
  return calendar([
    event(
      {
        uid: `${appt.id}@medrecords`,
        start: localStamp(date, time),
        minutes: 30,
        summary: `${appt.reason} (${personName})`,
        description: who || undefined,
        location: appt.facility || undefined,
        alarms: ['-P1D', '-PT2H'],
      },
      now,
    ),
  ]);
}

export function calendarFileName(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${slug || 'medrecords'}.ics`;
}
