import { useId } from 'react';
import type { FormEvent } from 'react';
import type { DoseSlot, Medication, MedicationForm as MedForm } from '../../lib/types';
import { DOSE_SLOTS, MEDICATION_FORMS } from '../../lib/types';
import { SLOT_LABEL } from '../../lib/meds';
import type { MedicationFormValues } from '../../lib/forms';
import {
  MEDICATION_FIELD_ORDER,
  emptyMedicationForm,
  formToMedicationInput,
  medicationToForm,
  validateMedicationForm,
} from '../../lib/forms';
import type { MedicationInput } from '../../lib/store';
import { Field, fieldProps, inputClass, selectClass, textareaClass } from '../../components/ui/Field';
import { ErrorSummary, FormActions, Warning, formStyles, useFormState } from '../../components/forms/FormBits';
import { medicationWarnings } from '../../lib/safety';
import { useActiveProfile } from '../../state/store';

const FORM_LABEL: Record<MedForm, string> = {
  tablet: 'Tablet',
  capsule: 'Capsule',
  syrup: 'Syrup',
  drops: 'Drops',
  sachet: 'Sachet',
  inhaler: 'Inhaler',
  injection: 'Injection',
  cream: 'Cream or gel',
  other: 'Other',
};

type TextKey = 'name' | 'strength' | 'dose' | 'frequency' | 'purpose' | 'prescriber' | 'supplyDays';

/** Add or edit a medication. */
export function MedicationForm({
  initial,
  today,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial?: Medication;
  today: string;
  onSubmit: (input: MedicationInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const form = useFormState<MedicationFormValues>(
    () => (initial ? medicationToForm(initial) : emptyMedicationForm(today)),
    (v) => validateMedicationForm(v, today),
  );
  const { values, errors } = form;
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const errorCount = Object.keys(errors).length;
  const { data, profile, now } = useActiveProfile();
  const warnings = medicationWarnings(
    values.name,
    profile.allergies,
    data.medications.filter((m) => m.profileId === profile.id),
    now,
    initial?.id,
  );

  const text = (
    key: TextKey,
    label: string,
    opts: { required?: boolean; placeholder?: string; hint?: string; inputMode?: 'numeric' } = {},
  ) => (
    <Field id={id(key)} label={label} required={opts.required} optional={!opts.required} error={errors[key]} hint={opts.hint}>
      <input
        {...fieldProps(id(key), { error: errors[key], hint: opts.hint })}
        className={inputClass}
        type="text"
        inputMode={opts.inputMode}
        value={values[key]}
        onChange={(e) => form.update(key, e.target.value)}
        placeholder={opts.placeholder}
        autoComplete="off"
        aria-required={opts.required || undefined}
      />
    </Field>
  );

  const date = (key: 'startDate' | 'endDate' | 'refillDate', label: string, required: boolean, max?: string) => (
    <Field id={id(key)} label={label} required={required} optional={!required} error={errors[key]}>
      <input
        {...fieldProps(id(key), { error: errors[key] })}
        className={inputClass}
        type="date"
        max={max}
        value={values[key]}
        onChange={(e) => form.update(key, e.target.value)}
        aria-required={required || undefined}
      />
    </Field>
  );

  const toggleSlot = (slot: DoseSlot) => {
    const next = values.schedule.includes(slot) ? values.schedule.filter((s) => s !== slot) : [...values.schedule, slot];
    form.update('schedule', next);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (form.check(MEDICATION_FIELD_ORDER, id)) onSubmit(formToMedicationInput(values));
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
        {text('name', 'Medicine', { required: true, placeholder: 'e.g. Metformin' })}
        {text('strength', 'Strength', { placeholder: 'e.g. 500 mg' })}
      </div>

      {warnings.length > 0 && (
        <div role="status">
          <Warning>
            {warnings.map((w) => (
              <p key={w.message}>{w.message}</p>
            ))}
          </Warning>
        </div>
      )}

      <div className={formStyles.row3}>
        <Field id={id('form')} label="Form" error={errors.form}>
          <select
            {...fieldProps(id('form'), { error: errors.form })}
            className={selectClass}
            value={values.form}
            onChange={(e) => form.update('form', e.target.value as MedForm)}
          >
            {MEDICATION_FORMS.map((f) => (
              <option key={f} value={f}>
                {FORM_LABEL[f]}
              </option>
            ))}
          </select>
        </Field>
        {text('dose', 'Dose', { placeholder: 'e.g. 1 tablet' })}
        {text('frequency', 'How often', { placeholder: 'e.g. Twice daily' })}
      </div>

      <fieldset className={formStyles.checks}>
        <legend className={formStyles.checkLegend}>Daily checklist</legend>
        {DOSE_SLOTS.map((slot) => (
          <label key={slot} className={formStyles.check}>
            <input type="checkbox" checked={values.schedule.includes(slot)} onChange={() => toggleSlot(slot)} />
            {SLOT_LABEL[slot]}
          </label>
        ))}
        <p className={formStyles.checksNote}>
          Pick when it is taken to show it on the daily checklist. Leave empty for “as needed”.
        </p>
      </fieldset>

      <div className={formStyles.row}>
        {text('purpose', 'What it is for', { placeholder: 'e.g. Blood pressure' })}
        {text('prescriber', 'Prescribed by', { placeholder: 'Dr. …' })}
      </div>

      <div className={formStyles.row}>
        {date('startDate', 'Started', true)}
        {date('endDate', 'Stopped or ends', false)}
      </div>

      <div className={formStyles.row}>
        {date('refillDate', 'Last refill', true, today)}
        {text('supplyDays', 'Days one refill lasts', {
          required: true,
          inputMode: 'numeric',
          hint: 'Used for refill reminders.',
        })}
      </div>

      <Field id={id('instructions')} label="Instructions" optional error={errors.instructions}>
        <textarea
          {...fieldProps(id('instructions'), { error: errors.instructions })}
          className={textareaClass}
          rows={2}
          value={values.instructions}
          onChange={(e) => form.update('instructions', e.target.value)}
          placeholder="e.g. Take after food"
          autoComplete="off"
        />
      </Field>

      <FormActions
        submitLabel={initial ? 'Save changes' : 'Add medication'}
        onCancel={onCancel}
        onDelete={onDelete}
        confirmText="Delete this medication and its checklist history? This cannot be undone."
      />
    </form>
  );
}
