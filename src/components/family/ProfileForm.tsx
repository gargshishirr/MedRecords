import { useEffect, useId, useRef } from 'react';
import type { FormEvent } from 'react';
import { CircleAlert, Plus, X } from 'lucide-react';
import type { Profile } from '../../lib/types';
import { ALLERGY_SEVERITIES, BLOOD_GROUPS, CONDITION_STATUSES, SEXES } from '../../lib/types';
import type { ProfileFormValues } from '../../lib/forms';
import { EMPTY_PROFILE_FORM, formToProfileInput, profileFieldOrder, profileToForm, validateProfileForm } from '../../lib/forms';
import type { ProfileInput } from '../../lib/store';
import { Field, fieldProps, inputClass, selectClass } from '../ui/Field';
import { Button, IconButton } from '../ui/Button';
import { ErrorSummary, FormActions, formStyles, useFormState } from '../forms/FormBits';

const RELATIONS = [
  'Self',
  'Spouse',
  'Partner',
  'Mother',
  'Father',
  'Daughter',
  'Son',
  'Sister',
  'Brother',
  'Grandmother',
  'Grandfather',
];

type ListKey = 'allergies' | 'conditions' | 'contacts';

const NEW_ROW = {
  allergies: { name: '', severity: 'moderate', reaction: '' },
  conditions: { name: '', since: '', status: 'active' },
  contacts: { name: '', relation: '', phone: '' },
} as const;

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type TextKey = 'name' | 'relation' | 'heightCm' | 'doctorName' | 'doctorSpecialty' | 'doctorFacility' | 'doctorPhone';

export function ProfileForm({
  initial,
  today,
  onSubmit,
  onCancel,
  onDelete,
  deleteText,
}: {
  initial?: Profile;
  today: string;
  onSubmit: (input: ProfileInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
  deleteText?: string;
}) {
  const form = useFormState<ProfileFormValues>(
    () => (initial ? profileToForm(initial) : EMPTY_PROFILE_FORM),
    (v) => validateProfileForm(v, today),
  );
  const { values, errors } = form;
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const focusNext = useRef<string | null>(null);

  // After adding a row, move focus to its first field.
  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(id(focusNext.current))?.focus();
    focusNext.current = null;
  });

  const addRow = (list: ListKey) => {
    focusNext.current = `${list}.${values[list].length}.name`;
    form.set({ ...values, [list]: [...values[list], { ...NEW_ROW[list] }] });
  };

  const removeRow = (list: ListKey, index: number) => {
    form.set({ ...values, [list]: values[list].filter((_, i) => i !== index) });
    document.getElementById(id(`${list}-add`))?.focus();
  };

  const updateRow = <L extends ListKey>(list: L, index: number, patch: Partial<ProfileFormValues[L][number]>) => {
    const rows = values[list].map((row, i) => (i === index ? { ...row, ...patch } : row));
    form.set({ ...values, [list]: rows });
  };

  const text = (
    key: TextKey,
    label: string,
    opts: {
      required?: boolean;
      optional?: boolean;
      hint?: string;
      placeholder?: string;
      list?: string;
      inputMode?: 'numeric' | 'decimal' | 'tel';
    } = {},
  ) => (
    <Field id={id(key)} label={label} required={opts.required} optional={opts.optional} error={errors[key]} hint={opts.hint}>
      <input
        {...fieldProps(id(key), { error: errors[key], hint: opts.hint })}
        className={inputClass}
        type={opts.inputMode === 'tel' ? 'tel' : 'text'}
        inputMode={opts.inputMode}
        value={values[key]}
        onChange={(e) => form.update(key, e.target.value)}
        placeholder={opts.placeholder}
        list={opts.list}
        autoComplete="off"
        aria-required={opts.required || undefined}
      />
    </Field>
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (form.check(profileFieldOrder(values), id)) onSubmit(formToProfileInput(values, initial));
  };

  const errorCount = Object.keys(errors).length;

  return (
    <form
      className={formStyles.form}
      onSubmit={handleSubmit}
      noValidate
      aria-describedby={errorCount ? id('summary') : undefined}
    >
      <ErrorSummary id={id('summary')} count={errorCount} />

      <div className={formStyles.row}>
        {text('name', 'Full name', { required: true })}
        {text('relation', 'Relation to you', { optional: true, placeholder: 'e.g. Self, Mother, Son', list: id('relations') })}
        <datalist id={id('relations')}>
          {RELATIONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </div>

      <div className={formStyles.row}>
        <Field id={id('dob')} label="Date of birth" required error={errors.dob}>
          <input
            {...fieldProps(id('dob'), { error: errors.dob })}
            className={inputClass}
            type="date"
            max={today}
            value={values.dob}
            onChange={(e) => form.update('dob', e.target.value)}
            aria-required="true"
          />
        </Field>
        <fieldset className={formStyles.checks} aria-describedby={errors.sex ? `${id('sex')}-error` : `${id('sex')}-hint`}>
          <legend className={formStyles.checkLegend}>
            Sex<span aria-hidden="true"> *</span>
          </legend>
          {SEXES.map((s, i) => (
            <label key={s} className={formStyles.check}>
              <input
                id={i === 0 ? id('sex') : undefined}
                type="radio"
                name={id('sex')}
                value={s}
                checked={values.sex === s}
                onChange={() => form.update('sex', s)}
                aria-invalid={errors.sex ? true : undefined}
                required
              />
              {s}
            </label>
          ))}
          {errors.sex ? (
            <p id={`${id('sex')}-error`} className={formStyles.checksError}>
              <CircleAlert size={14} aria-hidden="true" />
              {errors.sex}
            </p>
          ) : (
            <p id={`${id('sex')}-hint`} className={formStyles.checksNote}>
              Used to choose lab reference ranges.
            </p>
          )}
        </fieldset>
      </div>

      <div className={formStyles.row}>
        <Field id={id('bloodGroup')} label="Blood group">
          <select
            id={id('bloodGroup')}
            className={selectClass}
            value={values.bloodGroup}
            onChange={(e) => form.update('bloodGroup', e.target.value as ProfileFormValues['bloodGroup'])}
          >
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g === 'Unknown' ? 'Not known' : g}
              </option>
            ))}
          </select>
        </Field>
        {text('heightCm', 'Height (cm)', { optional: true, inputMode: 'decimal', hint: 'Used to work out BMI.' })}
      </div>

      <fieldset className={formStyles.fieldset}>
        <legend className={formStyles.legend}>Allergies</legend>
        {values.allergies.length === 0 && <p className={formStyles.help}>No allergies added. Add one if there are any.</p>}
        {values.allergies.map((a, i) => (
          <div key={i} className={formStyles.listRow}>
            <div className={formStyles.listFields}>
              <Field id={id(`allergies.${i}.name`)} label="Allergic to" error={errors[`allergies.${i}.name`]}>
                <input
                  {...fieldProps(id(`allergies.${i}.name`), { error: errors[`allergies.${i}.name`] })}
                  className={inputClass}
                  value={a.name}
                  onChange={(e) => updateRow('allergies', i, { name: e.target.value })}
                  placeholder="e.g. Penicillin"
                  autoComplete="off"
                />
              </Field>
              <Field id={id(`allergies.${i}.severity`)} label="Severity">
                <select
                  id={id(`allergies.${i}.severity`)}
                  className={selectClass}
                  value={a.severity}
                  onChange={(e) => updateRow('allergies', i, { severity: e.target.value as typeof a.severity })}
                >
                  {ALLERGY_SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {capital(s)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={id(`allergies.${i}.reaction`)} label="Reaction" optional error={errors[`allergies.${i}.reaction`]}>
                <input
                  {...fieldProps(id(`allergies.${i}.reaction`), { error: errors[`allergies.${i}.reaction`] })}
                  className={inputClass}
                  value={a.reaction}
                  onChange={(e) => updateRow('allergies', i, { reaction: e.target.value })}
                  placeholder="e.g. Hives"
                  autoComplete="off"
                />
              </Field>
            </div>
            <IconButton label={`Remove allergy ${i + 1}`} className={formStyles.remove} onClick={() => removeRow('allergies', i)}>
              <X />
            </IconButton>
          </div>
        ))}
        <Button
          id={id('allergies-add')}
          size="sm"
          icon={<Plus />}
          className={formStyles.addRow}
          onClick={() => addRow('allergies')}
        >
          Add allergy
        </Button>
      </fieldset>

      <fieldset className={formStyles.fieldset}>
        <legend className={formStyles.legend}>Conditions</legend>
        {values.conditions.length === 0 && <p className={formStyles.help}>Long-term conditions, e.g. diabetes or asthma.</p>}
        {values.conditions.map((c, i) => (
          <div key={i} className={formStyles.listRow}>
            <div className={formStyles.listFields}>
              <Field id={id(`conditions.${i}.name`)} label="Condition" error={errors[`conditions.${i}.name`]}>
                <input
                  {...fieldProps(id(`conditions.${i}.name`), { error: errors[`conditions.${i}.name`] })}
                  className={inputClass}
                  value={c.name}
                  onChange={(e) => updateRow('conditions', i, { name: e.target.value })}
                  placeholder="e.g. Asthma"
                  autoComplete="off"
                />
              </Field>
              <Field id={id(`conditions.${i}.since`)} label="Since" optional error={errors[`conditions.${i}.since`]}>
                <input
                  {...fieldProps(id(`conditions.${i}.since`), { error: errors[`conditions.${i}.since`] })}
                  className={inputClass}
                  type="date"
                  max={today}
                  value={c.since}
                  onChange={(e) => updateRow('conditions', i, { since: e.target.value })}
                />
              </Field>
              <Field id={id(`conditions.${i}.status`)} label="Status">
                <select
                  id={id(`conditions.${i}.status`)}
                  className={selectClass}
                  value={c.status}
                  onChange={(e) => updateRow('conditions', i, { status: e.target.value as typeof c.status })}
                >
                  {CONDITION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {capital(s)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <IconButton
              label={`Remove condition ${i + 1}`}
              className={formStyles.remove}
              onClick={() => removeRow('conditions', i)}
            >
              <X />
            </IconButton>
          </div>
        ))}
        <Button
          id={id('conditions-add')}
          size="sm"
          icon={<Plus />}
          className={formStyles.addRow}
          onClick={() => addRow('conditions')}
        >
          Add condition
        </Button>
      </fieldset>

      <fieldset className={formStyles.fieldset}>
        <legend className={formStyles.legend}>Emergency contacts</legend>
        {values.contacts.length === 0 && (
          <p className={formStyles.help}>People to call in an emergency. They appear on the emergency card.</p>
        )}
        {values.contacts.map((c, i) => (
          <div key={i} className={formStyles.listRow}>
            <div className={formStyles.listFields}>
              <Field id={id(`contacts.${i}.name`)} label="Name" error={errors[`contacts.${i}.name`]}>
                <input
                  {...fieldProps(id(`contacts.${i}.name`), { error: errors[`contacts.${i}.name`] })}
                  className={inputClass}
                  value={c.name}
                  onChange={(e) => updateRow('contacts', i, { name: e.target.value })}
                  autoComplete="off"
                />
              </Field>
              <Field id={id(`contacts.${i}.relation`)} label="Relation" optional error={errors[`contacts.${i}.relation`]}>
                <input
                  {...fieldProps(id(`contacts.${i}.relation`), { error: errors[`contacts.${i}.relation`] })}
                  className={inputClass}
                  value={c.relation}
                  onChange={(e) => updateRow('contacts', i, { relation: e.target.value })}
                  placeholder="e.g. Husband"
                  autoComplete="off"
                />
              </Field>
              <Field id={id(`contacts.${i}.phone`)} label="Phone" error={errors[`contacts.${i}.phone`]}>
                <input
                  {...fieldProps(id(`contacts.${i}.phone`), { error: errors[`contacts.${i}.phone`] })}
                  className={inputClass}
                  type="tel"
                  value={c.phone}
                  onChange={(e) => updateRow('contacts', i, { phone: e.target.value })}
                  autoComplete="off"
                />
              </Field>
            </div>
            <IconButton label={`Remove contact ${i + 1}`} className={formStyles.remove} onClick={() => removeRow('contacts', i)}>
              <X />
            </IconButton>
          </div>
        ))}
        <Button
          id={id('contacts-add')}
          size="sm"
          icon={<Plus />}
          className={formStyles.addRow}
          onClick={() => addRow('contacts')}
        >
          Add contact
        </Button>
      </fieldset>

      <fieldset className={formStyles.fieldset}>
        <legend className={formStyles.legend}>Primary doctor</legend>
        <div className={formStyles.row}>
          {text('doctorName', 'Name', { optional: true, placeholder: 'Dr. …' })}
          {text('doctorSpecialty', 'Specialty', { optional: true, placeholder: 'e.g. General physician' })}
        </div>
        <div className={formStyles.row}>
          {text('doctorFacility', 'Clinic or hospital', { optional: true })}
          {text('doctorPhone', 'Phone', { optional: true, inputMode: 'tel' })}
        </div>
      </fieldset>

      <FormActions
        submitLabel={initial ? 'Save changes' : 'Add person'}
        onCancel={onCancel}
        onDelete={onDelete}
        confirmText={deleteText}
      />
    </form>
  );
}
