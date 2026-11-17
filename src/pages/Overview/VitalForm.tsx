import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import type { VitalKind, VitalReading } from '../../lib/types';
import { VITAL_KINDS } from '../../lib/types';
import { VITALS } from '../../lib/ranges';
import { formatDate } from '../../lib/date';
import type { VitalFormValues } from '../../lib/forms';
import { formToVitalInput, validateVitalForm } from '../../lib/forms';
import type { VitalInput } from '../../lib/store';
import { Field, fieldProps, inputClass, selectClass } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { ErrorSummary, FormActions, formStyles, useFormState } from '../../components/forms/FormBits';
import styles from './Overview.module.css';

const ORDER = ['kind', 'value', 'value2', 'date'];

function readingText(r: VitalReading): string {
  const meta = VITALS[r.kind];
  const value = r.kind === 'bp' ? `${r.value}/${r.value2 ?? '—'}` : r.value.toFixed(meta.decimals);
  return `${value} ${meta.unit}`;
}

/** Add a vital reading. Recent readings of the chosen kind are listed below so mistakes can be removed. */
export function VitalForm({
  today,
  initialKind = 'bp',
  readings,
  onSubmit,
  onDeleteReading,
  onCancel,
}: {
  today: string;
  initialKind?: VitalKind;
  /** This person's readings, any kind. */
  readings: VitalReading[];
  onSubmit: (input: VitalInput) => void;
  onDeleteReading: (id: string) => void;
  onCancel: () => void;
}) {
  const form = useFormState<VitalFormValues>({ kind: initialKind, date: today, value: '', value2: '' }, (v) =>
    validateVitalForm(v, today),
  );
  const { values, errors } = form;
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const errorCount = Object.keys(errors).length;
  const meta = VITALS[values.kind];
  const recent = readings
    .filter((r) => r.kind === values.kind)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (form.check(ORDER, id)) onSubmit(formToVitalInput(values));
  };

  const number = (key: 'value' | 'value2', label: string) => (
    <Field id={id(key)} label={label} required error={errors[key]}>
      <input
        {...fieldProps(id(key), { error: errors[key] })}
        className={inputClass}
        type="text"
        inputMode="decimal"
        value={values[key]}
        onChange={(e) => form.update(key, e.target.value)}
        aria-required="true"
        autoComplete="off"
      />
    </Field>
  );

  return (
    <form
      className={formStyles.form}
      onSubmit={handleSubmit}
      noValidate
      aria-describedby={errorCount ? id('summary') : undefined}
    >
      <ErrorSummary id={id('summary')} count={errorCount} />

      <div className={formStyles.row}>
        <Field id={id('kind')} label="Reading">
          <select
            id={id('kind')}
            className={selectClass}
            value={values.kind}
            onChange={(e) => form.set({ ...values, kind: e.target.value as VitalKind, value: '', value2: '' })}
          >
            {VITAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {VITALS[k].label}
              </option>
            ))}
          </select>
        </Field>
        <Field id={id('date')} label="Date" required error={errors.date}>
          <input
            {...fieldProps(id('date'), { error: errors.date })}
            className={inputClass}
            type="date"
            max={today}
            value={values.date}
            onChange={(e) => form.update('date', e.target.value)}
            aria-required="true"
          />
        </Field>
      </div>

      {values.kind === 'bp' ? (
        <div className={formStyles.row}>
          {number('value', 'Systolic (top, mmHg)')}
          {number('value2', 'Diastolic (bottom, mmHg)')}
        </div>
      ) : (
        number('value', `${meta.label} (${meta.unit})`)
      )}

      {recent.length > 0 && (
        <section className={formStyles.fieldset} aria-labelledby={id('recent')}>
          <h3 id={id('recent')} className={formStyles.legend}>
            Recent {meta.label.toLowerCase()} readings
          </h3>
          <ul role="list" className={styles.readingList}>
            {recent.map((r) => (
              <li key={r.id} className={styles.readingRow}>
                <span>
                  <strong className="num">{readingText(r)}</strong> · {formatDate(r.date)}
                </span>
                {pendingDelete === r.id ? (
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 />}
                    onClick={() => {
                      onDeleteReading(r.id);
                      setPendingDelete(null);
                    }}
                  >
                    Confirm delete
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 />}
                    onClick={() => setPendingDelete(r.id)}
                    aria-label={`Delete reading ${readingText(r)} from ${formatDate(r.date)}`}
                  >
                    Delete
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <FormActions submitLabel="Add reading" onCancel={onCancel} />
    </form>
  );
}
