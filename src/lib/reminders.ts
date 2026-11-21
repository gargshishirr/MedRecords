/**
 * Reminders shown while MedRecords is open (as a notification and a toast).
 * Browsers can't wake a closed web app on a schedule without a server, so for
 * reminders that always arrive, people add medicines and appointments to
 * their calendar instead (see calendar.ts).
 */
import type { AppData, ClockTime, DoseSlot, Profile } from './types';
import { DOSE_SLOTS } from './types';
import { addDays, toISODate } from './date';
import { SLOT_LABEL, dosesForDay, isCurrentlyActive, refillStatus } from './meds';
import { doseLogFor } from './store';
import { firstName } from './format';

export interface Reminder {
  /** Unique per reminder, so each one is shown once. Holds ids and dates only. */
  key: string;
  title: string;
  body: string;
}

/** Dose reminders show during the hour after the dose time. */
const DOSE_WINDOW_MIN = 60;
const APPT_SOON_MIN = 120;
const EVENING_HOUR = 18;

const minutesOf = (t: ClockTime) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const minutesNow = (now: Date) => now.getHours() * 60 + now.getMinutes();

/**
 * Works out what to remind about right now. `discreet` leaves names of
 * medicines and people out of the text (used when the lock is on, since
 * notifications can show on a phone's lock screen).
 */
export function dueReminders(data: AppData, now: Date, sent: ReadonlySet<string>, discreet: boolean): Reminder[] {
  const out: Reminder[] = [];
  const today = toISODate(now);
  const tomorrow = toISODate(addDays(now, 1));
  const minute = minutesNow(now);
  const { times } = data.settings.reminders;
  const add = (r: Reminder) => {
    if (!sent.has(r.key)) out.push(r);
  };
  const who = (p: Profile) => firstName(p.name);

  for (const profile of data.profiles) {
    const meds = data.medications.filter((m) => m.profileId === profile.id);
    const taken = new Set(doseLogFor(data, profile.id)?.[today] ?? []);

    for (const slot of DOSE_SLOTS) {
      const start = minutesOf(times[slot]);
      if (minute < start || minute >= start + DOSE_WINDOW_MIN) continue;
      const due = dosesForDay(meds, today).filter((d) => d.slot === slot && !taken.has(d.key));
      if (!due.length) continue;
      add({
        key: `dose:${today}:${slot}:${profile.id}`,
        title: discreet ? `${SLOT_LABEL[slot]} medicines are due` : `${who(profile)}'s ${slotWord(slot)} medicines`,
        body: discreet
          ? 'Open MedRecords to see what to take.'
          : due.map((d) => [d.med.name, d.med.strength].filter(Boolean).join(' ')).join(', '),
      });
    }

    if (minute >= minutesOf(times.morning)) {
      const low = meds.filter((m) => isCurrentlyActive(m, now) && refillStatus(m, now).daysLeft <= 2);
      if (low.length) {
        add({
          key: `refill:${today}:${profile.id}`,
          title: discreet ? 'A medicine needs a refill soon' : `Refill soon for ${who(profile)}`,
          body: discreet ? 'Open MedRecords to see which one.' : low.map((m) => `${m.name}: ${refillStatus(m, now).label.toLowerCase()}`).join(', '),
        });
      }
    }

    for (const appt of data.appointments) {
      if (appt.profileId !== profile.id) continue;
      const at = new Date(`${appt.at}:00`);
      const minsAway = (at.getTime() - now.getTime()) / 60_000;
      const place = [appt.at.slice(11, 16), appt.facility].filter(Boolean).join(' · ');
      if (minsAway > 0 && minsAway <= APPT_SOON_MIN) {
        add({
          key: `appt:${appt.id}:soon`,
          title: discreet ? 'Appointment soon' : `${who(profile)}: ${appt.reason}`,
          body: discreet ? 'Open MedRecords for details.' : `Today at ${place}`,
        });
      } else if (appt.at.slice(0, 10) === tomorrow && now.getHours() >= EVENING_HOUR) {
        add({
          key: `appt:${appt.id}:day`,
          title: discreet ? 'Appointment tomorrow' : `Tomorrow: ${appt.reason}`,
          body: discreet ? 'Open MedRecords for details.' : `${who(profile)} · ${place}`,
        });
      }
    }
  }
  return out;
}

function slotWord(slot: DoseSlot): string {
  return SLOT_LABEL[slot].toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Remembering what was shown                                          */
/* ------------------------------------------------------------------ */

export const REMINDED_KEY = 'medrecords:reminded';
const MAX_REMEMBERED = 300;

export function readSent(storage: Pick<Storage, 'getItem'> | undefined): Set<string> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(REMINDED_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string' && k.length < 200) : []);
  } catch {
    return new Set();
  }
}

export function writeSent(storage: Pick<Storage, 'setItem'> | undefined, sent: Set<string>): void {
  try {
    storage?.setItem(REMINDED_KEY, JSON.stringify([...sent].slice(-MAX_REMEMBERED)));
  } catch {
    /* storage full: at worst a reminder repeats */
  }
}
