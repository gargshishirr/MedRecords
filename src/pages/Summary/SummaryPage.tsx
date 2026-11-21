import { Printer } from 'lucide-react';
import type { VitalKind } from '../../lib/types';
import { VITAL_KINDS } from '../../lib/types';
import { LAB_TESTS, STATUS_LABEL, VITALS, bmi, formatRange, labStatus, personContext, vitalStatus } from '../../lib/ranges';
import { RECORD_TYPE_META } from '../../lib/recordMeta';
import { labsFor, latestLabs, medicationsFor, recordsFor, vitalSeries } from '../../lib/selectors';
import { addMonths, ageInYears, formatDate, toISODate } from '../../lib/date';
import { formatSigned } from '../../lib/format';
import { hasSchedule, vaccineSummary } from '../../lib/vaccines';
import { useActiveProfile } from '../../state/store';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import styles from './Summary.module.css';

const MONTHS_BACK = 12;
const MAX_EVENTS = 8;

function Section({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={styles.section} data-wide={wide || undefined}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

const None = ({ children }: { children: React.ReactNode }) => <p className={styles.none}>{children}</p>;

/** A one-page summary to show a doctor, or print / save as PDF. */
export function SummaryPage() {
  const { data, profile, now } = useActiveProfile();
  useDocumentTitle('Doctor summary');
  const person = personContext(profile, now);
  const since = toISODate(addMonths(now, -MONTHS_BACK));

  const { active } = medicationsFor(data, profile.id, now);
  const labs = latestLabs(labsFor(data, profile.id));
  const events = recordsFor(data, profile.id)
    .filter((r) => r.date >= since && r.type !== 'lab')
    .slice(0, MAX_EVENTS);
  const vitals = VITAL_KINDS.map((kind) => ({ kind, latest: vitalSeries(data, profile.id, kind).at(-1) })).filter(
    (v): v is { kind: VitalKind; latest: NonNullable<typeof v.latest> } => !!v.latest,
  );
  const vaccines = hasSchedule(profile, now) ? vaccineSummary(profile, now) : null;
  const facts = [
    `${ageInYears(profile.dob, now)} years`,
    profile.sex,
    `Born ${formatDate(profile.dob)}`,
    profile.bloodGroup !== 'Unknown' && `Blood group ${profile.bloodGroup}`,
    profile.heightCm && `Height ${profile.heightCm} cm`,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="Doctor summary"
        description="One page with what a doctor usually asks for. Print it or save it as a PDF."
        actions={
          <Button variant="primary" icon={<Printer />} onClick={() => window.print()}>
            Print or save PDF
          </Button>
        }
      />

      <article className={styles.sheet} aria-label={`Health summary for ${profile.name}`}>
        <header className={styles.head}>
          <div>
            <p className={styles.kicker}>Health summary</p>
            <h2 className={`${styles.name} display`}>{profile.name}</h2>
            <p className={styles.facts}>{facts.join(' · ')}</p>
          </div>
          <p className={styles.date}>
            Prepared {formatDate(toISODate(now))}
            {profile.primaryDoctor?.name && (
              <>
                <br />
                Primary doctor: {profile.primaryDoctor.name}
              </>
            )}
          </p>
        </header>

        <div className={styles.grid}>
          <Section title="Allergies">
            {profile.allergies.length ? (
              <ul className={styles.list}>
                {profile.allergies.map((a) => (
                  <li key={a.name}>
                    <strong>{a.name}</strong> <span className={styles.tag} data-severity={a.severity}>{a.severity}</span>
                    {a.reaction && <span className={styles.muted}> — {a.reaction}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <None>No known allergies.</None>
            )}
          </Section>

          <Section title="Conditions">
            {profile.conditions.length ? (
              <ul className={styles.list}>
                {profile.conditions.map((c) => (
                  <li key={c.name}>
                    <strong>{c.name}</strong>
                    <span className={styles.muted}>
                      {' '}
                      — {c.status}
                      {c.since && `, since ${formatDate(c.since)}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <None>None recorded.</None>
            )}
          </Section>

          <Section title="Current medicines" wide>
            {active.length ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Medicine</th>
                    <th scope="col">Dose</th>
                    <th scope="col">How often</th>
                    <th scope="col">For</th>
                    <th scope="col">Since</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((m) => (
                    <tr key={m.id}>
                      <th scope="row">
                        {m.name} <span className={styles.muted}>{m.strength}</span>
                      </th>
                      <td>{m.dose || '—'}</td>
                      <td>{m.frequency || '—'}</td>
                      <td>{m.purpose || '—'}</td>
                      <td className={styles.nowrap}>{formatDate(m.startDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <None>No current medicines.</None>
            )}
          </Section>

          <Section title="Latest lab results" wide>
            {labs.length ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Test</th>
                    <th scope="col" className={styles.right}>
                      Result
                    </th>
                    <th scope="col" className={styles.right}>
                      Change
                    </th>
                    <th scope="col">Reference</th>
                    <th scope="col">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {labs.map(({ latest, previous }) => {
                    const test = LAB_TESTS[latest.testId];
                    const status = labStatus(latest.testId, latest.value, person);
                    return (
                      <tr key={latest.testId} data-flag={status !== 'normal' || undefined}>
                        <th scope="row">{test.name}</th>
                        <td className={`${styles.right} num`}>
                          <strong>{latest.value.toFixed(test.decimals)}</strong> <span className={styles.muted}>{test.unit}</span>
                          {status !== 'normal' && <span className={styles.flag}> {STATUS_LABEL[status]}</span>}
                        </td>
                        <td className={`${styles.right} num ${styles.muted}`}>
                          {previous ? formatSigned(latest.value - previous.value, test.decimals) : '—'}
                        </td>
                        <td className={styles.muted}>{formatRange(test.range(person), test.unit, test.decimals)}</td>
                        <td className={styles.nowrap}>{formatDate(latest.date)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <None>No lab results recorded.</None>
            )}
          </Section>

          <Section title="Latest readings">
            {vitals.length ? (
              <ul className={styles.list}>
                {vitals.map(({ kind, latest }) => {
                  const meta = VITALS[kind];
                  const value =
                    kind === 'bp' ? `${latest.value}/${latest.value2 ?? '—'}` : latest.value.toFixed(meta.decimals);
                  const status = vitalStatus(kind, latest, { ...person, heightCm: profile.heightCm });
                  return (
                    <li key={kind}>
                      {meta.label}: <strong className="num">{value}</strong> {meta.unit}
                      {kind === 'weight' && profile.heightCm && (
                        <span className={styles.muted}> (BMI {bmi(latest.value, profile.heightCm).toFixed(1)})</span>
                      )}
                      {status && status !== 'normal' && <span className={styles.flag}> {STATUS_LABEL[status]}</span>}
                      <span className={styles.muted}> · {formatDate(latest.date)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <None>No readings recorded.</None>
            )}
          </Section>

          <Section title={vaccines ? 'Vaccines' : 'Emergency contact'}>
            {vaccines ? (
              <p>
                {vaccines.given} of {vaccines.total} scheduled doses given.
                {vaccines.overdue.length > 0 && (
                  <>
                    {' '}
                    <span className={styles.flag}>Overdue:</span> {vaccines.overdue.map((r) => r.dose.name).join(', ')}.
                  </>
                )}
                {vaccines.due.length > 0 && <> Due now: {vaccines.due.map((r) => r.dose.name).join(', ')}.</>}
              </p>
            ) : profile.emergencyContacts.length ? (
              <ul className={styles.list}>
                {profile.emergencyContacts.map((c) => (
                  <li key={c.name}>
                    <strong>{c.name}</strong> {c.relation && <span className={styles.muted}>({c.relation})</span>} {c.phone}
                  </li>
                ))}
              </ul>
            ) : (
              <None>None recorded.</None>
            )}
          </Section>

          <Section title={`Visits, scans and other records (last ${MONTHS_BACK} months)`} wide>
            {events.length ? (
              <ul className={styles.events}>
                {events.map((r) => (
                  <li key={r.id}>
                    <span className={styles.eventDate}>{formatDate(r.date)}</span>
                    <span>
                      <strong>{r.title}</strong>{' '}
                      <span className={styles.muted}>
                        ({RECORD_TYPE_META[r.type].label.toLowerCase()}
                        {r.doctor && `, ${r.doctor}`})
                      </span>
                      {r.summary && <span className={styles.eventSummary}>{r.summary}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <None>Nothing in the last {MONTHS_BACK} months.</None>
            )}
          </Section>
        </div>

        <footer className={styles.foot}>
          Made with MedRecords from information entered by the patient or family. Please confirm details before relying on
          them.
        </footer>
      </article>
    </>
  );
}
