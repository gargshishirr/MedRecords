import { useId } from 'react';
import type { FormEvent } from 'react';
import type { HealthRecord, LabResult, LabTestId } from '../../lib/types';
import { LAB_TEST_IDS } from '../../lib/types';
import { LAB_TESTS } from '../../lib/ranges';
import { formatDate } from '../../lib/date';
import type { LabFormValues } from '../../lib/forms';
import { LAB_FIELD_ORDER, formToLabInput, labToForm, validateLabForm } from '../../lib/forms';
import type { LabInput } from '../../lib/store';
import { Field, fieldProps, inputClass, selectClass } from '../../components/ui/Field';
import { ErrorSummary, FormActions, formStyles, useFormState } from '../../components/forms/FormBits';

/** Add or edit one lab result. */
export function LabForm({
  initial,
  defaultTest,
  reports,
  today,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial?: LabResult;
  defaultTest?: LabTestId;
  /** This person's records a result can be linked to. */
  reports: HealthRecord[];
  today: string;
  onSubmit: (input: LabInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const form = useFormState<LabFormValues>(
    () => (initial ? labToForm(initial) : { testId: defaultTest ?? '', date: today, value: '', recordId: '' }),
    (v) => validateLabForm(v, today),
  );
  const { values, errors } = form;
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const unit = values.testId ? LAB_TESTS[values.testId].unit : '';
  const errorCount = Object.keys(errors).length;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (form.check(LAB_FIELD_ORDER, id)) onSubmit(formToLabInput(values));
  };

  return (
    <form
      className={formStyles.form}
      onSubmit={handleSubmit}
      noValidate
      aria-describedby={errorCount ? id('summary') : undefined}
    >
      <ErrorSummary id={id('summary')} count={errorCount} />

      <div className={formStyles.row}>
        <Field id={id('testId')} label="Test" required error={errors.testId}>
          <select
            {...fieldProps(id('testId'), { error: errors.testId })}
            className={selectClass}
            value={values.testId}
            onChange={(e) => form.update('testId', e.target.value as LabTestId)}
            aria-required="true"
          >
            <option value="">Choose a test…</option>
            {LAB_TEST_IDS.map((t) => (
              <option key={t} value={t}>
                {LAB_TESTS[t].name} ({LAB_TESTS[t].unit})
              </option>
            ))}
          </select>
        </Field>
        <Field id={id('value')} label={unit ? `Result (${unit})` : 'Result'} required error={errors.value}>
          <input
            {...fieldProps(id('value'), { error: errors.value })}
            className={inputClass}
            type="text"
            inputMode="decimal"
            value={values.value}
            onChange={(e) => form.update('value', e.target.value)}
            aria-required="true"
            autoComplete="off"
          />
        </Field>
      </div>

      <div className={formStyles.row}>
        <Field id={id('date')} label="Test date" required error={errors.date}>
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
        <Field id={id('recordId')} label="From report" optional hint="Link it to a lab report in Records.">
          <select
            {...fieldProps(id('recordId'), { hint: 'Link it to a lab report in Records.' })}
            className={selectClass}
            value={values.recordId}
            onChange={(e) => form.update('recordId', e.target.value)}
          >
            <option value="">Not linked</option>
            {reports.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} · {formatDate(r.date)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <FormActions
        submitLabel={initial ? 'Save changes' : 'Add result'}
        onCancel={onCancel}
        onDelete={onDelete}
        confirmText="Delete this lab result? This cannot be undone."
      />
    </form>
  );
}
