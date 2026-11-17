import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  Check,
  Droplet,
  Droplets,
  History,
  Pencil,
  Pill,
  PillBottle,
  Plus,
  RotateCcw,
  SprayCan,
  Syringe,
  Tablets,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Medication } from '../../lib/types';
import { DOSE_SLOTS } from '../../lib/types';
import { SLOT_LABEL, computeAdherence, refillStatus } from '../../lib/meds';
import { formatDate, parseISODate, toISODate, weekdayShort } from '../../lib/date';
import { firstName, pluralize } from '../../lib/format';
import { medicationsFor } from '../../lib/selectors';
import { doseLogFor } from '../../lib/store';
import type { NavIntent } from '../../lib/hooks';
import { useNavIntent } from '../../lib/hooks';
import { useActiveProfile } from '../../state/store';
import { useToast } from '../../state/toast';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Ring } from '../../components/charts/Ring';
import { TodayMeds, SLOT_ICONS } from '../Overview/TodayMeds';
import { MedicationForm } from './MedicationForm';
import styles from './Medications.module.css';

const FORM_ICONS: Record<Medication['form'], LucideIcon> = {
  tablet: Tablets,
  capsule: Pill,
  syrup: PillBottle,
  drops: Droplets,
  sachet: PillBottle,
  inhaler: SprayCan,
  injection: Syringe,
  cream: Droplet,
  other: Pill,
};

const orDash = (value: string) => value || '—';

function AdherenceCard({ meds }: { meds: Medication[] }) {
  const { data, profile, now } = useActiveProfile();
  const summary = computeAdherence(meds, doseLogFor(data, profile.id), now, 7);
  const pct = summary.ratio === null ? null : Math.round(summary.ratio * 100);
  const verdict =
    pct === null ? 'No doses were due' : pct >= 90 ? 'Excellent consistency' : pct >= 75 ? 'Mostly on track' : 'Several missed doses';

  return (
    <Card title="7-day adherence" description="Based on the daily checklist" icon={<CalendarClock />}>
      <div className={styles.adherence}>
        <Ring value={summary.ratio} label={pct === null ? 'No adherence data' : `${pct}% of doses taken in the last 7 days`}>
          <span className={`${styles.ringValue} display num`}>{pct === null ? '—' : `${pct}%`}</span>
          <span className={styles.ringLabel}>taken</span>
        </Ring>
        <div className={styles.adherenceText}>
          <p className={styles.verdict}>{verdict}</p>
          <p className={styles.adherenceMeta}>
            {summary.taken} of {pluralize(summary.expected, 'dose')} taken this week
          </p>
          <ol role="list" className={styles.days} aria-label="Doses taken per day">
            {summary.days.map((d) => {
              const ratio = d.expected ? d.taken / d.expected : null;
              const tone = ratio === null ? 'none' : ratio === 1 ? 'full' : ratio > 0 ? 'partial' : 'missed';
              return (
                <li key={d.date} className={styles.day} data-tone={tone}>
                  <span className={styles.dayBar} aria-hidden="true">
                    <span style={{ height: `${Math.max(ratio ?? 0, 0.08) * 100}%` }} />
                  </span>
                  <span className={styles.dayLabel} aria-hidden="true">
                    {weekdayShort(d.date).slice(0, 1)}
                  </span>
                  <span className="visually-hidden">
                    {weekdayShort(d.date)} {formatDate(d.date)}: {d.expected ? `${d.taken} of ${d.expected} doses` : 'no doses due'}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </Card>
  );
}

function RefillsCard({ meds }: { meds: Medication[] }) {
  const { now } = useActiveProfile();
  const rows = meds
    .map((m) => ({ med: m, refill: refillStatus(m, now) }))
    .sort((a, b) => a.refill.daysLeft - b.refill.daysLeft)
    .slice(0, 4);
  return (
    <Card title="Refills" description="Days of supply left, soonest first" icon={<PillBottle />}>
      {rows.length === 0 ? (
        <p className={styles.none}>No active medications.</p>
      ) : (
        <ul role="list" className={styles.refills}>
          {rows.map(({ med, refill }) => (
            <li key={med.id}>
              <Link
                to="/medications"
                state={{ med: med.id } satisfies NavIntent}
                className={styles.refillRow}
                data-level={refill.level}
              >
                <span className={styles.refillName}>
                  {med.name} <span className={styles.strength}>{med.strength}</span>
                </span>
                <span className={styles.refillWhen}>{refill.label}</span>
                <span className={styles.refillTrack} aria-hidden="true">
                  <span style={{ width: `${refill.remaining * 100}%` }} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MedicationCard({ med, highlighted, onEdit }: { med: Medication; highlighted: boolean; onEdit: () => void }) {
  const { now, markRefilled } = useActiveProfile();
  const { notify } = useToast();
  const refill = refillStatus(med, now);
  const Icon = FORM_ICONS[med.form];

  return (
    <article id={`med-${med.id}`} className={styles.med} data-highlight={highlighted || undefined} aria-labelledby={`med-title-${med.id}`}>
      <header className={styles.medHead}>
        <span className={styles.medIcon} aria-hidden="true">
          <Icon size={20} />
        </span>
        <div className={styles.medTitleWrap}>
          <h3 id={`med-title-${med.id}`} className={styles.medTitle}>
            {med.name} <span className={styles.strength}>{med.strength}</span>
          </h3>
          {med.purpose && <p className={styles.purpose}>{med.purpose}</p>}
        </div>
        <IconButton label={`Edit ${med.name}`} className={styles.medEdit} onClick={onEdit}>
          <Pencil />
        </IconButton>
      </header>

      <ul role="list" className={styles.schedule} aria-label="Schedule">
        {DOSE_SLOTS.map((slot) => {
          const on = med.schedule.includes(slot);
          const SlotIcon = SLOT_ICONS[slot];
          return (
            <li key={slot} className={styles.slot} data-on={on || undefined}>
              <SlotIcon size={14} aria-hidden="true" />
              {SLOT_LABEL[slot]}
              <span className="visually-hidden">{on ? ': yes' : ': no'}</span>
            </li>
          );
        })}
      </ul>

      <dl className={styles.facts}>
        <div>
          <dt>Dose</dt>
          <dd>{orDash(med.dose)}</dd>
        </div>
        <div>
          <dt>Frequency</dt>
          <dd>{orDash(med.frequency)}</dd>
        </div>
        <div>
          <dt>Prescriber</dt>
          <dd>{orDash(med.prescriber)}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{formatDate(med.startDate)}</dd>
        </div>
      </dl>

      {med.instructions && <p className={styles.instructions}>{med.instructions}</p>}

      <footer className={styles.refill} data-level={refill.level}>
        <div className={styles.refillText}>
          <span className={styles.refillLabel}>{refill.label}</span>
          <div
            className={styles.refillBar}
            role="meter"
            aria-label={`${med.name} supply remaining`}
            aria-valuemin={0}
            aria-valuemax={med.supplyDays}
            aria-valuenow={Math.max(0, refill.daysLeft)}
            aria-valuetext={`${Math.max(0, refill.daysLeft)} of ${med.supplyDays} days of supply left`}
          >
            <span style={{ width: `${refill.remaining * 100}%` }} />
          </div>
        </div>
        <Button
          size="sm"
          variant={refill.level === 'ok' ? 'ghost' : 'secondary'}
          icon={<RotateCcw />}
          onClick={() => {
            markRefilled(med.id);
            notify(`${med.name} marked as refilled`);
          }}
          aria-label={`Mark ${med.name} as refilled`}
        >
          Refilled
        </Button>
      </footer>
    </article>
  );
}

export function MedicationsPage() {
  const { data, profile, now, addMedication, updateMedication, deleteMedication } = useActiveProfile();
  const { notify } = useToast();
  const [highlight, setHighlight] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  useDocumentTitle('Medications');

  const { active, past } = useMemo(() => medicationsFor(data, profile.id, now), [data, profile.id, now]);
  const lowCount = active.filter((m) => refillStatus(m, now).level !== 'ok').length;
  const editing = [...active, ...past].find((m) => m.id === editingId) ?? null;
  const today = toISODate(now);

  useNavIntent((intent) => {
    if (intent.med) setHighlight(intent.med);
    if (intent.add) setAdding(true);
  });

  // Scroll a highlighted medication into view, then fade the highlight.
  useEffect(() => {
    if (!highlight) return;
    requestAnimationFrame(() => {
      document.getElementById(`med-${highlight}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    const t = window.setTimeout(() => setHighlight(null), 2600);
    return () => window.clearTimeout(t);
  }, [highlight]);

  return (
    <>
      <PageHeader
        title="Medications"
        description={`${pluralize(active.length, 'active medication')} for ${firstName(profile.name)}${
          lowCount ? ` · ${lowCount} need${lowCount === 1 ? 's' : ''} a refill soon` : ''
        }`}
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>
            Add medication
          </Button>
        }
      />

      <div className={styles.top}>
        <div className={styles.topCol}>
          <AdherenceCard meds={[...active, ...past]} />
          <RefillsCard meds={active} />
        </div>
        <TodayMeds showLink={false} />
      </div>

      <section aria-labelledby="active-heading" className={styles.section}>
        <h2 id="active-heading" className={styles.sectionTitle}>
          Active <span className={styles.sectionCount}>{active.length}</span>
        </h2>
        {active.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Pill />}
              title="No active medications"
              action={
                <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>
                  Add medication
                </Button>
              }
            >
              Medicines you add will appear here with refill reminders and a daily checklist.
            </EmptyState>
          </Card>
        ) : (
          <div className={styles.grid}>
            {active.map((m) => (
              <MedicationCard key={m.id} med={m} highlighted={highlight === m.id} onEdit={() => setEditingId(m.id)} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="past-heading" className={styles.section}>
        <h2 id="past-heading" className={styles.sectionTitle}>
          Past <span className={styles.sectionCount}>{past.length}</span>
        </h2>
        {past.length === 0 ? (
          <p className={styles.none}>No past medications recorded.</p>
        ) : (
          <ul role="list" className={styles.pastList}>
            {past.map((m) => (
              <li key={m.id} id={`med-${m.id}`} className={styles.past} data-highlight={highlight === m.id || undefined}>
                <span className={styles.pastIcon} aria-hidden="true">
                  <History size={16} />
                </span>
                <span className={styles.pastMain}>
                  <span className={styles.pastName}>
                    {m.name} <span className={styles.strength}>{m.strength}</span>
                  </span>
                  <span className={styles.pastMeta}>{[m.purpose, m.prescriber].filter(Boolean).join(' · ') || '—'}</span>
                </span>
                <span className={styles.pastDates}>
                  {formatDate(m.startDate)} – {m.endDate ? formatDate(m.endDate) : 'ongoing'}
                  <span className={styles.pastDuration}>
                    {m.endDate ? durationLabel(m.startDate, m.endDate) : ''}
                  </span>
                </span>
                {m.instructions && <span className={styles.pastNote}>{m.instructions}</span>}
                <span className={styles.pastDone} aria-hidden="true">
                  <Check size={14} /> Completed
                </span>
                <IconButton label={`Edit ${m.name}`} className={styles.pastEdit} onClick={() => setEditingId(m.id)}>
                  <Pencil />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a medication"
        description={`Saved to ${firstName(profile.name)}'s medications in this browser.`}
        size="lg"
      >
        <MedicationForm
          today={today}
          onCancel={() => setAdding(false)}
          onSubmit={(input) => {
            const med = addMedication(input);
            setAdding(false);
            setHighlight(med.id);
            notify(`${input.name} added`);
          }}
        />
      </Dialog>

      <Dialog open={editing !== null} onClose={() => setEditingId(null)} title="Edit medication" size="lg">
        {editing && (
          <MedicationForm
            key={editing.id}
            initial={editing}
            today={today}
            onCancel={() => setEditingId(null)}
            onSubmit={(input) => {
              updateMedication(editing.id, input);
              setEditingId(null);
              setHighlight(editing.id);
              notify(`${input.name} saved`);
            }}
            onDelete={() => {
              deleteMedication(editing.id);
              setEditingId(null);
              notify(`${editing.name} deleted`);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function durationLabel(start: string, end: string): string {
  const days = Math.max(1, Math.round((parseISODate(end).getTime() - parseISODate(start).getTime()) / 86_400_000));
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  const months = Math.round(days / 30);
  if (months < 24) return `${months} months`;
  return `${Math.round(months / 12)} years`;
}
