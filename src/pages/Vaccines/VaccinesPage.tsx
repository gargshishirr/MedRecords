import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, ChevronDown, Syringe } from 'lucide-react';
import type { VaccineRow, VaccineStage } from '../../lib/vaccines';
import { SCHEDULE_MAX_AGE_YEARS, hasSchedule, vaccineRows, vaccineSummary } from '../../lib/vaccines';
import { formatDate, toISODate } from '../../lib/date';
import { firstName, pluralize } from '../../lib/format';
import { useActiveProfile } from '../../state/store';
import { useToast } from '../../state/toast';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusPill } from '../../components/ui/Pill';
import { Field, fieldProps, inputClass } from '../../components/ui/Field';
import { formStyles } from '../../components/forms/FormBits';
import styles from './Vaccines.module.css';

function StatusTag({ row }: { row: VaccineRow }) {
  if (row.status === 'given') return <StatusPill status="normal" size="sm" label={`Given ${formatDate(row.givenOn!)}`} />;
  if (row.status === 'overdue') return <StatusPill status="high" size="sm" label="Overdue" />;
  if (row.status === 'due') return <StatusPill status="watch" size="sm" label="Due now" />;
  return <span className={styles.upcoming}>From {formatDate(row.dueDate)}</span>;
}

/** Overview card for children: what's due, or when the next dose is. */
export function VaccinesCard() {
  const { profile, now } = useActiveProfile();
  const summary = vaccineSummary(profile, now);
  const pending = [...summary.overdue, ...summary.due];
  const next = summary.next[0];

  return (
    <Card
      title="Vaccines"
      description={`${summary.given} of ${summary.total} given`}
      icon={<Syringe />}
      action={
        <ButtonLink to="/vaccines" variant="ghost" size="sm">
          Schedule
        </ButtonLink>
      }
    >
      {pending.length ? (
        <ul role="list" className={styles.mini}>
          {pending.slice(0, 3).map((row) => (
            <li key={row.dose.id} className={styles.miniRow}>
              <span>{row.dose.name}</span>
              <StatusTag row={row} />
            </li>
          ))}
          {pending.length > 3 && <li className={styles.more}>and {pending.length - 3} more</li>}
        </ul>
      ) : (
        <p className={styles.upToDate}>
          <Check size={16} aria-hidden="true" />
          <span>
            Up to date.
            {next && (
              <>
                {' '}
                Next: <strong>{next.dose.name}</strong> from {formatDate(next.dueDate)}.
              </>
            )}
          </span>
        </p>
      )}
    </Card>
  );
}

function GivenForm({ row, onDone }: { row: VaccineRow; onDone: () => void }) {
  const { profile, now, setVaccine } = useActiveProfile();
  const { notify } = useToast();
  const uid = useId();
  const today = toISODate(now);
  const [date, setDate] = useState(row.givenOn ?? (row.dueDate < today ? today : row.dueDate));
  const [error, setError] = useState<string | undefined>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!date || date > today) return setError('Choose a date that is not in the future.');
    if (date < profile.dob) return setError(`Choose a date after ${firstName(profile.name)} was born.`);
    setVaccine(row.dose.id, date);
    notify(`${row.dose.name} marked as given`);
    onDone();
  };

  return (
    <form className={formStyles.form} onSubmit={submit} noValidate>
      <Field id={`${uid}-d`} label="Date given" required error={error}>
        <input
          {...fieldProps(`${uid}-d`, { error })}
          type="date"
          className={inputClass}
          value={date}
          max={today}
          min={profile.dob}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <div className={formStyles.actions}>
        {row.givenOn && (
          <Button
            variant="danger"
            className={formStyles.actionsStart}
            onClick={() => {
              setVaccine(row.dose.id, null);
              notify(`${row.dose.name} marked as not given`);
              onDone();
            }}
          >
            Not given
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" icon={<Check />}>
          Save
        </Button>
      </div>
    </form>
  );
}

function Stage({ stage, rows, open, onPick }: { stage: VaccineStage; rows: VaccineRow[]; open: boolean; onPick: (r: VaccineRow) => void }) {
  const given = rows.filter((r) => r.status === 'given').length;
  const worst = rows.some((r) => r.status === 'overdue') ? 'overdue' : rows.some((r) => r.status === 'due') ? 'due' : given === rows.length ? 'done' : 'later';
  return (
    <details className={styles.stage} open={open} data-state={worst}>
      <summary className={styles.stageHead}>
        <span className={styles.stageDot} aria-hidden="true" />
        <span className={styles.stageLabel}>{stage.label}</span>
        <span className={styles.stageMeta}>
          {given === rows.length ? 'All given' : `${given} of ${rows.length} given`}
        </span>
        <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
      </summary>
      <ul role="list" className={styles.doses}>
        {rows.map((row) => (
          <li key={row.dose.id}>
            <button type="button" className={styles.dose} onClick={() => onPick(row)} data-status={row.status}>
              <span className={styles.check} aria-hidden="true">
                {row.status === 'given' && <Check size={14} />}
              </span>
              <span className={styles.doseText}>
                <span className={styles.doseName}>{row.dose.name}</span>
                <span className={styles.doseAgainst}>{row.dose.against}</span>
              </span>
              <StatusTag row={row} />
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function VaccinesPage() {
  const { profile, now } = useActiveProfile();
  const [picked, setPicked] = useState<VaccineRow | null>(null);
  useDocumentTitle('Vaccines');
  const name = firstName(profile.name);

  if (!hasSchedule(profile, now)) {
    return (
      <>
        <PageHeader title="Vaccines" />
        <Card>
          <EmptyState
            icon={<Syringe />}
            title={`The schedule is for children under ${SCHEDULE_MAX_AGE_YEARS}`}
            action={
              <ButtonLink to="/records" variant="primary">
                Go to records
              </ButtonLink>
            }
          >
            Keep {name}&apos;s vaccines (like the yearly flu shot) as vaccination records instead.
          </EmptyState>
        </Card>
      </>
    );
  }

  const rows = vaccineRows(profile, now);
  const summary = vaccineSummary(profile, now);
  const nextStage = summary.next[0]?.stage.id;
  const attention = summary.overdue.length + summary.due.length;
  const groups = groupByStage(rows);
  // Leading stages that are complete fold into one row.
  const firstOpen = groups.findIndex((g) => g.rows.some((r) => r.status !== 'given'));
  const done = firstOpen === -1 ? groups : groups.slice(0, firstOpen);
  const rest = firstOpen === -1 ? [] : groups.slice(firstOpen);

  return (
    <>
      <PageHeader
        title="Vaccines"
        description={
          attention
            ? `${name}: ${[summary.overdue.length && `${summary.overdue.length} overdue`, summary.due.length && `${summary.due.length} due now`].filter(Boolean).join(' · ')}. Tap a vaccine to mark it as given.`
            : `${name} is up to date: ${summary.given} of ${pluralize(summary.total, 'dose')} given.`
        }
      />

      <div className={styles.list}>
        {done.length > 1 && (
          <details className={styles.stage} data-state="done">
            <summary className={styles.stageHead}>
              <span className={styles.stageDot} aria-hidden="true" />
              <span className={styles.stageLabel}>
                {done[0]!.stage.label} to {done[done.length - 1]!.stage.label}
              </span>
              <span className={styles.stageMeta}>All {done.reduce((n, g) => n + g.rows.length, 0)} given</span>
              <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
            </summary>
            <div className={styles.nested}>
              {done.map(({ stage, rows: stageRows }) => (
                <Stage key={stage.id} stage={stage} rows={stageRows} open={false} onPick={setPicked} />
              ))}
            </div>
          </details>
        )}
        {(done.length > 1 ? rest : groups).map(({ stage, rows: stageRows }) => (
          <Stage
            key={stage.id}
            stage={stage}
            rows={stageRows}
            open={stageRows.some((r) => r.status === 'due' || r.status === 'overdue') || stage.id === nextStage}
            onPick={setPicked}
          />
        ))}
      </div>

      <p className={styles.footnote}>
        Based on the Indian Academy of Pediatrics (IAP) schedule. {name}&apos;s doctor may follow a different plan, such as the
        government&apos;s UIP schedule. Not medical advice.
      </p>

      <Dialog
        open={picked !== null}
        onClose={() => setPicked(null)}
        size="sm"
        title={picked?.dose.name ?? ''}
        description={picked ? `${picked.dose.against}. Recommended from ${formatDate(picked.dueDate)}.` : undefined}
      >
        {picked && <GivenForm key={picked.dose.id} row={picked} onDone={() => setPicked(null)} />}
      </Dialog>
    </>
  );
}

function groupByStage(rows: VaccineRow[]) {
  const groups: { stage: VaccineStage; rows: VaccineRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.stage.id === row.stage.id) last.rows.push(row);
    else groups.push({ stage: row.stage, rows: [row] });
  }
  return groups;
}
