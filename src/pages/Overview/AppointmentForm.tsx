import { useId } from 'react';
import type { FormEvent } from 'react';
import type { Appointment } from '../../lib/types';
import type { AppointmentFormValues } from '../../lib/forms';
import { APPOINTMENT_FIELD_ORDER, appointmentToForm, formToAppointmentInput, validateAppointmentForm } from '../../lib/forms';
import type { AppointmentInput } from '../../lib/store';
import { Field, fieldProps, inputClass } from '../../components/ui/Field';
import { ErrorSummary, FormActions, formStyles, useFormState } from '../../components/forms/FormBits';

type TextKey = 'reason' | 'doctor' | 'specialty' | 'facility';

/** Add or edit an upcoming appointment. */
export function AppointmentForm({
  initial,
  today,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial?: Appointment;
  today: string;
  onSubmit: (input: AppointmentInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const form = useFormState<AppointmentFormValues>(
    () =>
      initial ? appointmentToForm(initial) : { date: today, time: '10:00', reason: '', doctor: '', specialty: '', facility: '' },
    (v) => validateAppointmentForm(v, today),
  );
  const { values, errors } = form;
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const errorCount = Object.keys(errors).length;

  const text = (key: TextKey, label: string, opts: { required?: boolean; placeholder?: string } = {}) => (
    <Field id={id(key)} label={label} required={opts.required} optional={!opts.required} error={errors[key]}>
      <input
        {...fieldProps(id(key), { error: errors[key] })}
        className={inputClass}
        type="text"
        value={values[key]}
        onChange={(e) => form.update(key, e.target.value)}
        placeholder={opts.placeholder}
        autoComplete="off"
        aria-required={opts.required || undefined}
      />
    </Field>
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (form.check(APPOINTMENT_FIELD_ORDER, id)) onSubmit(formToAppointmentInput(values));
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
        <Field id={id('date')} label="Date" required error={errors.date}>
          <input
            {...fieldProps(id('date'), { error: errors.date })}
            className={inputClass}
            type="date"
            min={today}
            value={values.date}
            onChange={(e) => form.update('date', e.target.value)}
            aria-required="true"
          />
        </Field>
        <Field id={id('time')} label="Time" required error={errors.time}>
          <input
            {...fieldProps(id('time'), { error: errors.time })}
            className={inputClass}
            type="time"
            value={values.time}
            onChange={(e) => form.update('time', e.target.value)}
            aria-required="true"
          />
        </Field>
      </div>

      {text('reason', 'What it is for', { required: true, placeholder: 'e.g. Diabetes review' })}

      <div className={formStyles.row}>
        {text('doctor', 'Doctor', { placeholder: 'Dr. …' })}
        {text('specialty', 'Specialty', { placeholder: 'e.g. Cardiology' })}
      </div>

      {text('facility', 'Place', { placeholder: 'Clinic or hospital' })}

      <FormActions
        submitLabel={initial ? 'Save changes' : 'Add appointment'}
        onCancel={onCancel}
        onDelete={onDelete}
        confirmText="Delete this appointment? This cannot be undone."
      />
    </form>
  );
}
