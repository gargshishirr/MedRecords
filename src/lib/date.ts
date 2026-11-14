import type { ISODate } from './types';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as `YYYY-MM-DD`. */
export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local date-time as `YYYY-MM-DDTHH:mm:ss` (no timezone), so values sort as strings. */
export function toLocalISO(d: Date): string {
  return `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Parses `YYYY-MM-DD` (or `YYYY-MM-DDTHH:mm`) as a local date. */
export function parseISODate(iso: string): Date {
  const [datePart = '', timePart] = iso.split('T');
  const [y = 1970, m = 1, d = 1] = datePart.split('-').map(Number);
  const [hh = 0, mm = 0] = (timePart ?? '').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}

export function isValidISODate(iso: unknown): iso is ISODate {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = parseISODate(iso);
  return toISODate(d) === iso;
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(d: Date, months: number): Date {
  const next = new Date(d);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days from `a` to `b` (positive if `b` is later). */
export function daysBetween(a: Date | string, b: Date | string): number {
  const da = startOfDay(typeof a === 'string' ? parseISODate(a) : a);
  const db = startOfDay(typeof b === 'string' ? parseISODate(b) : b);
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/** `14 Nov 2026` */
export function formatDate(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** `14 Nov` */
export function formatDayMonth(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** `November 2026` */
export function formatMonthLong(iso: string): string {
  const d = parseISODate(iso);
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function monthShort(d: Date): string {
  return MONTHS_SHORT[d.getMonth()] ?? '';
}

/** `Saturday, 14 Nov 2026` */
export function formatLongDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${formatDate(toISODate(d))}`;
}

export function weekdayShort(iso: string): string {
  return (WEEKDAYS[parseISODate(iso).getDay()] ?? '').slice(0, 3);
}

/** `10:30 AM` */
export function formatTime(isoDateTime: string): string {
  const d = parseISODate(isoDateTime);
  const h = d.getHours();
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(d.getMinutes())} ${suffix}`;
}

/** Human-friendly relative day label: "Today", "Tomorrow", "in 5 days", "3 days ago". */
export function relativeDays(iso: string, now: Date = new Date()): string {
  const diff = daysBetween(now, iso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1) {
    if (diff < 14) return `in ${diff} days`;
    if (diff < 60) return `in ${Math.round(diff / 7)} weeks`;
    return `in ${Math.round(diff / 30)} months`;
  }
  const ago = -diff;
  if (ago < 14) return `${ago} days ago`;
  if (ago < 60) return `${Math.round(ago / 7)} weeks ago`;
  if (ago < 365) return `${Math.round(ago / 30)} months ago`;
  const years = Math.floor(ago / 365);
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

export function ageInYears(dob: ISODate, now: Date = new Date()): number {
  const birth = parseISODate(dob);
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
