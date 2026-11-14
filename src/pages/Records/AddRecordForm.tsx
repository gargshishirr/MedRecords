import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CircleAlert } from 'lucide-react';
import type { RecordType } from '../../lib/types';
import { RECORD_TYPES } from '../../lib/types';
import { RECORD_TYPE_META } from '../../lib/recordMeta';
import type { NewRecordInput } from '../../lib/store';
import type { RecordFormErrors, RecordFormValues } from '../../lib/recordForm';
import { EMPTY_RECORD_FORM, NOTES_MAX, toRecordInput, validateRecordForm } from '../../lib/recordForm';
import { Field, errorId, fieldProps, inputClass, textareaClass } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { RECORD_ICONS, typeColorStyle } from '../../components/RecordTypeIcon';
import styles from './AddRecordForm.module.css';

const TITLE_HINT = 'e.g. “Thyroid profile” or “Dermatology follow-up”';
const FIELD_ORDER: (keyof RecordFormValues)[] = ['type', 'title', 'date', 'cost', 'doctor', 'facility', 'notes'];

interface AddRecordFormProps {
  today: string;
  onSubmit: (input: NewRecordInput) => void;
  onCancel: () => void;
}

export function AddRecordForm({ today, onSubmit, onCancel }: AddRecordFormProps) {
  const [values, setValues] = useState<RecordFormValues>({ ...EMPTY_RECORD_FORM, date: today });
  const [errors, setErrors] = useState<RecordFormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  const update = <K extends keyof RecordFormValues>(key: K, value: RecordFormValues[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    // After the first submit attempt, re-validate live so errors clear as they're fixed.
    if (submitted) setErrors(validateRecordForm(next, today));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const found = validateRecordForm(values, today);
    setErrors(found);
    const first = FIELD_ORDER.find((k) => found[k]);
    if (first) {
      const target =
        first === 'type'
          ? formRef.current?.querySelector<HTMLInputElement>(`input[name="${id('type')}"]`)
          : document.getElementById(id(first));
      target?.focus();
      return;
    }
    onSubmit(toRecordInput(values));
  };

  const errorCount = Object.keys(errors).length;
  const notesHint = `${values.notes.length}/${NOTES_MAX} characters`;

  return (
    <form ref={formRef} className={styles.form} onSubmit={handleSubmit} noValidate aria-describedby={errorCount ? id('summary') : undefined}>
      {errorCount > 0 && (
        <div id={id('summary')} className={styles.summary} role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span>
            Please fix {errorCount === 1 ? '1 field' : `${errorCount} fields`} before saving.
          </span>
        </div>
      )}

      <fieldset
        className={styles.typeFieldset}
        aria-describedby={errors.type ? errorId(id('type')) : undefined}
        aria-invalid={errors.type ? true : undefined}
      >
        <legend className={styles.legend}>
          Record type<span aria-hidden="true" className={styles.req}>*</span>
        </legend>
        <div className={styles.types} data-invalid={errors.type ? '' : undefined}>
          {RECORD_TYPES.map((t: RecordType) => {
            const Icon = RECORD_ICONS[t];
            return (
              <label key={t} className={styles.typeOption} style={typeColorStyle(t)}>
                <input
                  type="radio"
                  name={id('type')}
                  value={t}
                  checked={values.type === t}
                  onChange={() => update('type', t)}
                  className={styles.typeInput}
                  required
                />
                <span className={styles.typeIcon} aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className={styles.typeLabel}>{RECORD_TYPE_META[t].label}</span>
              </label>
            );
          })}
        </div>
        {errors.type && (
          <p id={errorId(id('type'))} className={styles.inlineError}>
            <CircleAlert size={14} aria-hidden="true" />
            {errors.type}
          </p>
        )}
      </fieldset>

      <Field id={id('title')} label="Title" required error={errors.title} hint={TITLE_HINT}>
        <input
          {...fieldProps(id('title'), { error: errors.title, hint: TITLE_HINT })}
          className={inputClass}
          type="text"
          value={values.title}
          onChange={(e) => update('title', e.target.value)}
          aria-required="true"
          autoComplete="off"
        />
      </Field>

      <div className={styles.row}>
        <Field id={id('date')} label="Date" required error={errors.date}>
          <input
            {...fieldProps(id('date'), { error: errors.date })}
            className={inputClass}
            type="date"
            max={today}
            value={values.date}
            onChange={(e) => update('date', e.target.value)}
            aria-required="true"
          />
        </Field>
        <Field id={id('cost')} label="Cost (₹)" optional error={errors.cost}>
          <input
            {...fieldProps(id('cost'), { error: errors.cost })}
            className={inputClass}
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={values.cost}
            onChange={(e) => update('cost', e.target.value)}
          />
        </Field>
      </div>

      <div className={styles.row}>
        <Field id={id('doctor')} label="Doctor" optional error={errors.doctor}>
          <input
            {...fieldProps(id('doctor'), { error: errors.doctor })}
            className={inputClass}
            type="text"
            placeholder="Dr. …"
            value={values.doctor}
            onChange={(e) => update('doctor', e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field id={id('facility')} label="Facility" optional error={errors.facility}>
          <input
            {...fieldProps(id('facility'), { error: errors.facility })}
            className={inputClass}
            type="text"
            placeholder="Clinic, hospital or lab"
            value={values.facility}
            onChange={(e) => update('facility', e.target.value)}
            autoComplete="off"
          />
        </Field>
      </div>

      <Field id={id('notes')} label="Notes" optional error={errors.notes} hint={notesHint}>
        <textarea
          {...fieldProps(id('notes'), { error: errors.notes, hint: notesHint })}
          className={textareaClass}
          rows={3}
          value={values.notes}
          onChange={(e) => update('notes', e.target.value)}
        />
      </Field>

      <div className={styles.actions}>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit">
          Save record
        </Button>
      </div>
    </form>
  );
}
