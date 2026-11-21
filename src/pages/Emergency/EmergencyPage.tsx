import { useEffect, useMemo, useState } from 'react';
import {
  HeartPulse,
  Pencil,
  Phone,
  Printer,
  QrCode,
  ShieldAlert,
  Stethoscope,
  TriangleAlert,
  Pill,
  Activity,
} from 'lucide-react';
import type { CardSection, Medication, Profile } from '../../lib/types';
import { CARD_SECTIONS } from '../../lib/types';
import { ageInYears, formatDate, toISODate } from '../../lib/date';
import { medicationsFor } from '../../lib/selectors';
import { useActiveProfile } from '../../state/store';
import { useProfileEditor } from '../../components/family/ProfileEditor';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { LogoMark } from '../../components/Logo';
import styles from './Emergency.module.css';

const SECTION_LABEL: Record<CardSection, string> = {
  dob: 'Date of birth',
  conditions: 'Conditions',
  medications: 'Current medications',
  doctor: 'Primary doctor',
};

const nameAndStrength = (m: Medication) => [m.name, m.strength].filter(Boolean).join(' ');

/**
 * The plain text inside the QR code. It holds exactly what the card shows
 * (minus the date of birth, which is replaced by the age) and nothing else:
 * no link, no id and no data from other people.
 */
export function buildEmergencySummary(profile: Profile, meds: Medication[], now: Date, demo = false): string {
  const hidden = new Set(profile.cardHidden ?? []);
  const age = ageInYears(profile.dob, now);
  const blood = profile.bloodGroup === 'Unknown' ? 'not known' : profile.bloodGroup;
  const doctor = profile.primaryDoctor;
  const lines = [
    demo ? 'MEDRECORDS EMERGENCY CARD (DEMO DATA)' : 'EMERGENCY MEDICAL INFORMATION',
    `${profile.name} - ${profile.sex}, ${age}y - Blood ${blood}`,
    `ALLERGIES: ${profile.allergies.map((a) => `${a.name} (${a.severity})`).join(', ') || 'None known'}`,
    !hidden.has('conditions') &&
      `CONDITIONS: ${
        profile.conditions
          .filter((c) => c.status !== 'resolved')
          .map((c) => c.name)
          .join('; ') || 'None'
      }`,
    !hidden.has('medications') && `MEDS: ${meds.map(nameAndStrength).join('; ') || 'None'}`,
    ...profile.emergencyContacts.map((c) => `ICE: ${c.name}${c.relation ? ` (${c.relation})` : ''} ${c.phone}`.trim()),
    !hidden.has('doctor') && doctor?.name && `DOCTOR: ${[doctor.name, doctor.phone].filter(Boolean).join(' ')}`,
  ];
  return lines.filter(Boolean).join('\n');
}

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

export function EmergencyPage() {
  const { data, profile, now, updateProfile } = useActiveProfile();
  const { openEdit } = useProfileEditor();
  const [qrSvg, setQrSvg] = useState('');
  useDocumentTitle('Emergency card');

  const { active } = useMemo(() => medicationsFor(data, profile.id, now), [data, profile.id, now]);
  const summary = useMemo(() => buildEmergencySummary(profile, active, now, data.demo), [profile, active, now, data.demo]);
  const conditions = profile.conditions.filter((c) => c.status !== 'resolved');
  const hidden = new Set(profile.cardHidden ?? []);
  const shows = (section: CardSection) => !hidden.has(section);
  const doctor = profile.primaryDoctor;
  const bloodKnown = profile.bloodGroup !== 'Unknown';

  const toggleSection = (section: CardSection) => {
    const next = CARD_SECTIONS.filter((s) => (s === section ? !hidden.has(s) : hidden.has(s)));
    updateProfile(profile.id, { cardHidden: next });
  };

  useEffect(() => {
    let cancelled = false;
    // Loaded on demand so the QR encoder stays out of the main bundle.
    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toString(summary, {
          type: 'svg',
          margin: 0,
          errorCorrectionLevel: 'L',
          color: { dark: '#15212b', light: '#ffffff' },
        }),
      )
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setQrSvg('');
      });
    return () => {
      cancelled = true;
    };
  }, [summary]);

  return (
    <>
      <PageHeader
        title="Emergency card"
        description="Everything a first responder needs, on one card. Print it or keep a photo on your phone."
        actions={
          <>
            <Button icon={<Pencil />} onClick={() => openEdit(profile.id)}>
              Edit details
            </Button>
            <Button variant="primary" icon={<Printer />} onClick={() => window.print()}>
              Print card
            </Button>
          </>
        }
      />

      <div className={styles.layout}>
        <article className={styles.card} data-theme="light" aria-labelledby="ice-name">
          <header className={styles.band}>
            <span className={styles.brand}>
              <span className={styles.brandMark}>
                <LogoMark size={26} />
              </span>
              <span className={styles.brandText}>
                <span className={styles.brandName}>MedRecords</span>
                <span className={styles.brandSub}>Emergency medical information</span>
              </span>
            </span>
            <span className={styles.ice}>
              <HeartPulse size={16} aria-hidden="true" /> ICE
            </span>
          </header>

          <div className={styles.identity}>
            <Avatar profile={profile} size={64} />
            <div className={styles.who}>
              <h2 id="ice-name" className={`${styles.name} display`}>
                {profile.name}
              </h2>
              <p className={styles.meta}>
                {profile.sex} · {ageInYears(profile.dob, now)} years{shows('dob') && ` · DOB ${formatDate(profile.dob)}`}
              </p>
            </div>
            <div className={styles.blood}>
              <span className={styles.bloodLabel}>Blood group</span>
              {bloodKnown ? (
                <span className={`${styles.bloodValue} display`}>{profile.bloodGroup}</span>
              ) : (
                <span className={styles.bloodUnknown}>Not known</span>
              )}
            </div>
            <figure className={styles.qr}>
              {qrSvg ? (
                <div
                  className={styles.qrCode}
                  role="img"
                  aria-label="QR code containing a text summary of this card"
                  // The SVG markup is generated locally by the qrcode library.
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <div className={styles.qrCode} aria-hidden="true" />
              )}
              <figcaption className={styles.qrLabel}>
                <QrCode size={12} aria-hidden="true" /> Scan for summary
              </figcaption>
            </figure>
          </div>

          <div className={styles.body}>
            <section
              className={`${styles.block} ${shows('conditions') ? styles.left : styles.wide} ${styles.alert}`}
              aria-labelledby="ice-allergies"
            >
              <h3 id="ice-allergies" className={styles.blockTitle}>
                <TriangleAlert size={15} aria-hidden="true" /> Allergies
              </h3>
              {profile.allergies.length ? (
                <ul role="list" className={styles.items}>
                  {profile.allergies.map((a) => (
                    <li key={a.name}>
                      <strong>{a.name}</strong>
                      <span className={styles.sev} data-severity={a.severity}>
                        {a.severity}
                      </span>
                      <span className={styles.itemSub}>{a.reaction}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.itemSub}>No known allergies</p>
              )}
            </section>

            {shows('conditions') && (
              <section className={styles.block} aria-labelledby="ice-conditions">
                <h3 id="ice-conditions" className={styles.blockTitle}>
                  <Activity size={15} aria-hidden="true" /> Conditions
                </h3>
                {conditions.length ? (
                  <ul role="list" className={styles.items}>
                    {conditions.map((c) => (
                      <li key={c.name}>
                        <strong>{c.name}</strong>
                        {c.since && <span className={styles.itemSub}>Since {formatDate(c.since).replace(/^\d+ /, '')}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.itemSub}>None recorded</p>
                )}
              </section>
            )}

            {shows('medications') && (
              <section className={`${styles.block} ${styles.wide}`} aria-labelledby="ice-meds">
                <h3 id="ice-meds" className={styles.blockTitle}>
                  <Pill size={15} aria-hidden="true" /> Current medications
                </h3>
                {active.length ? (
                  <ul role="list" className={`${styles.items} ${styles.medItems}`}>
                    {active.map((m) => (
                      <li key={m.id}>
                        <strong>{nameAndStrength(m)}</strong>
                        {m.frequency && <span className={styles.itemSub}>{m.frequency}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.itemSub}>None</p>
                )}
              </section>
            )}

            <section className={`${styles.block} ${shows('doctor') ? styles.left : styles.wide}`} aria-labelledby="ice-contacts">
              <h3 id="ice-contacts" className={styles.blockTitle}>
                <Phone size={15} aria-hidden="true" /> Emergency contacts
              </h3>
              {profile.emergencyContacts.length ? (
                <ul role="list" className={styles.items}>
                  {profile.emergencyContacts.map((c, i) => (
                    <li key={`${c.name}-${i}`}>
                      <strong>
                        {c.name} {c.relation && <span className={styles.relation}>({c.relation})</span>}
                      </strong>
                      {c.phone && (
                        <a href={tel(c.phone)} className={styles.phone}>
                          {c.phone}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.itemSub}>None added</p>
              )}
            </section>

            {shows('doctor') && (
              <section className={styles.block} aria-labelledby="ice-doctor">
                <h3 id="ice-doctor" className={styles.blockTitle}>
                  <Stethoscope size={15} aria-hidden="true" /> Primary doctor
                </h3>
                {doctor ? (
                  <ul role="list" className={styles.items}>
                    <li>
                      <strong>{doctor.name || 'Name not added'}</strong>
                      {(doctor.specialty || doctor.facility) && (
                        <span className={styles.itemSub}>{[doctor.specialty, doctor.facility].filter(Boolean).join(' · ')}</span>
                      )}
                      {doctor.phone && (
                        <a href={tel(doctor.phone)} className={styles.phone}>
                          {doctor.phone}
                        </a>
                      )}
                    </li>
                  </ul>
                ) : (
                  <p className={styles.itemSub}>None added</p>
                )}
              </section>
            )}
          </div>

          <footer className={styles.foot}>
            <ShieldAlert size={14} aria-hidden="true" />
            <span>
              Updated {formatDate(toISODate(now))} ·{' '}
              {data.demo
                ? 'Fictional demo data generated by MedRecords — not a real person.'
                : 'Check with a doctor before acting on this information.'}
            </span>
          </footer>
        </article>

        <aside className={`${styles.aside} no-print`} aria-labelledby="card-options">
          <fieldset className={styles.sections}>
            <legend id="card-options" className={styles.sectionsTitle}>
              Show on the card and QR code
            </legend>
            {CARD_SECTIONS.map((section) => (
              <label key={section} className={styles.sectionToggle}>
                <input type="checkbox" checked={shows(section)} onChange={() => toggleSection(section)} />
                {SECTION_LABEL[section]}
              </label>
            ))}
            <p className={styles.sectionsNote}>Name, blood group, allergies and emergency contacts are always shown.</p>
          </fieldset>
          <details className={styles.qrDetails}>
            <summary className={styles.asideTitle}>What the QR code contains</summary>
            <p className={styles.asideText}>Plain text only — no link, no account, no server. Anyone who scans it sees this:</p>
            <pre className={styles.pre}>{summary}</pre>
          </details>
        </aside>
      </div>
    </>
  );
}
