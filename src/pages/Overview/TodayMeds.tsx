import { Check, Moon, Pill, Sun, Sunrise } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DoseSlot } from '../../lib/types';
import { DOSE_SLOTS } from '../../lib/types';
import { SLOT_LABEL, dosesForDay } from '../../lib/meds';
import { toISODate } from '../../lib/date';
import { medicationsFor } from '../../lib/selectors';
import { useStore } from '../../state/store';
import { Card } from '../../components/ui/Card';
import { ButtonLink } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import styles from './TodayMeds.module.css';

export const SLOT_ICONS: Record<DoseSlot, LucideIcon> = { morning: Sunrise, afternoon: Sun, night: Moon };

export function TodayMeds({ showLink = true }: { showLink?: boolean }) {
  const { data, profile, now, toggleDose } = useStore();
  const today = toISODate(now);
  const { active } = medicationsFor(data, profile.id, now);
  const doses = dosesForDay(active, today);
  const taken = new Set(data.doseLog[profile.id]?.[today] ?? []);
  const takenCount = doses.filter((d) => taken.has(d.key)).length;
  const pct = doses.length ? Math.round((takenCount / doses.length) * 100) : 0;

  return (
    <Card
      title="Today's medications"
      description={doses.length ? `${takenCount} of ${doses.length} doses taken` : undefined}
      icon={<Pill />}
      action={
        showLink && (
          <ButtonLink to="/medications" variant="ghost" size="sm">
            All medications
          </ButtonLink>
        )
      }
    >
      {doses.length === 0 ? (
        <EmptyState icon={<Pill />} title="Nothing scheduled today" compact>
          Active medications with a daily schedule will show up here as a checklist.
        </EmptyState>
      ) : (
        <>
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="Doses taken today"
            aria-valuemin={0}
            aria-valuemax={doses.length}
            aria-valuenow={takenCount}
            aria-valuetext={`${takenCount} of ${doses.length} doses taken`}
          >
            <span className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.slots}>
            {DOSE_SLOTS.map((slot) => {
              const items = doses.filter((d) => d.slot === slot);
              if (items.length === 0) return null;
              const Icon = SLOT_ICONS[slot];
              return (
                <fieldset key={slot} className={styles.slot}>
                  <legend className={styles.slotLabel}>
                    <Icon size={15} aria-hidden="true" />
                    {SLOT_LABEL[slot]}
                  </legend>
                  <ul role="list" className={styles.doses}>
                    {items.map((d) => {
                      const isTaken = taken.has(d.key);
                      const label = `${d.med.name} ${d.med.strength} (${SLOT_LABEL[slot].toLowerCase()})`;
                      return (
                        <li key={d.key}>
                          <label className={styles.dose} data-taken={isTaken || undefined}>
                            <input
                              type="checkbox"
                              className={styles.input}
                              checked={isTaken}
                              onChange={() => toggleDose(today, d.key, label)}
                            />
                            <span className={styles.box} aria-hidden="true">
                              <Check size={14} strokeWidth={3} />
                            </span>
                            <span className={styles.doseText}>
                              <span className={styles.doseName}>
                                {d.med.name} <span className={styles.strength}>{d.med.strength}</span>
                              </span>
                              <span className={styles.doseMeta}>
                                {d.med.dose} · {d.med.frequency}
                              </span>
                            </span>
                            <span className={styles.status} aria-hidden="true">
                              {isTaken ? 'Taken' : 'Due'}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
