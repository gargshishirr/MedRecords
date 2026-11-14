import { useEffect, useMemo, useState } from 'react';
import { HeartPulse, Phone, Printer, QrCode, ShieldAlert, Stethoscope, TriangleAlert, Pill, Activity } from 'lucide-react';
import type { Medication, Profile } from '../../lib/types';
import { ageInYears, formatDate, toISODate } from '../../lib/date';
import { medicationsFor } from '../../lib/selectors';
import { useStore } from '../../state/store';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { LogoMark } from '../../components/Logo';
import styles from './Emergency.module.css';

export function buildEmergencySummary(profile: Profile, meds: Medication[], now: Date): string {
  const age = ageInYears(profile.dob, now);
  const lines = [
    'MEDRECORDS EMERGENCY CARD (DEMO DATA)',
    `${profile.name} - ${profile.sex}, ${age}y - Blood ${profile.bloodGroup}`,
    `ALLERGIES: ${profile.allergies.map((a) => `${a.name} (${a.severity})`).join(', ') || 'None known'}`,
    `CONDITIONS: ${profile.conditions.filter((c) => c.status !== 'resolved').map((c) => c.name).join('; ') || 'None'}`,
    `MEDS: ${meds.map((m) => `${m.name} ${m.strength}`).join('; ') || 'None'}`,
    ...profile.emergencyContacts.map((c) => `ICE: ${c.name} (${c.relation}) ${c.phone}`),
    `DOCTOR: ${profile.primaryDoctor.name} ${profile.primaryDoctor.phone}`,
  ];
  return lines.join('\n');
}

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

export function EmergencyPage() {
  const { data, profile, now } = useStore();
  const [qrSvg, setQrSvg] = useState('');
  useDocumentTitle('Emergency card');

  const { active } = useMemo(() => medicationsFor(data, profile.id, now), [data, profile.id, now]);
  const summary = useMemo(() => buildEmergencySummary(profile, active, now), [profile, active, now]);
  const conditions = profile.conditions.filter((c) => c.status !== 'resolved');

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
          <Button variant="primary" icon={<Printer />} onClick={() => window.print()}>
            Print card
          </Button>
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
                {profile.sex} · {ageInYears(profile.dob, now)} years · DOB {formatDate(profile.dob)}
              </p>
            </div>
            <div className={styles.blood}>
              <span className={styles.bloodLabel}>Blood group</span>
              <span className={`${styles.bloodValue} display`}>{profile.bloodGroup}</span>
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
            <section className={`${styles.block} ${styles.left} ${styles.alert}`} aria-labelledby="ice-allergies">
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

            <section className={styles.block} aria-labelledby="ice-conditions">
              <h3 id="ice-conditions" className={styles.blockTitle}>
                <Activity size={15} aria-hidden="true" /> Conditions
              </h3>
              {conditions.length ? (
                <ul role="list" className={styles.items}>
                  {conditions.map((c) => (
                    <li key={c.name}>
                      <strong>{c.name}</strong>
                      <span className={styles.itemSub}>Since {formatDate(c.since).replace(/^\d+ /, '')}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.itemSub}>None recorded</p>
              )}
            </section>

            <section className={`${styles.block} ${styles.wide}`} aria-labelledby="ice-meds">
              <h3 id="ice-meds" className={styles.blockTitle}>
                <Pill size={15} aria-hidden="true" /> Current medications
              </h3>
              {active.length ? (
                <ul role="list" className={`${styles.items} ${styles.medItems}`}>
                  {active.map((m) => (
                    <li key={m.id}>
                      <strong>
                        {m.name} {m.strength}
                      </strong>
                      <span className={styles.itemSub}>{m.frequency}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.itemSub}>None</p>
              )}
            </section>

            <section className={`${styles.block} ${styles.left}`} aria-labelledby="ice-contacts">
              <h3 id="ice-contacts" className={styles.blockTitle}>
                <Phone size={15} aria-hidden="true" /> Emergency contacts
              </h3>
              <ul role="list" className={styles.items}>
                {profile.emergencyContacts.map((c) => (
                  <li key={c.name}>
                    <strong>
                      {c.name} <span className={styles.relation}>({c.relation})</span>
                    </strong>
                    <a href={tel(c.phone)} className={styles.phone}>
                      {c.phone}
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.block} aria-labelledby="ice-doctor">
              <h3 id="ice-doctor" className={styles.blockTitle}>
                <Stethoscope size={15} aria-hidden="true" /> Primary doctor
              </h3>
              <ul role="list" className={styles.items}>
                <li>
                  <strong>{profile.primaryDoctor.name}</strong>
                  <span className={styles.itemSub}>
                    {profile.primaryDoctor.specialty} · {profile.primaryDoctor.facility}
                  </span>
                  <a href={tel(profile.primaryDoctor.phone)} className={styles.phone}>
                    {profile.primaryDoctor.phone}
                  </a>
                </li>
              </ul>
            </section>
          </div>

          <footer className={styles.foot}>
            <ShieldAlert size={14} aria-hidden="true" />
            <span>
              Updated {formatDate(toISODate(now))} · Fictional demo data generated by MedRecords — not a real person.
            </span>
          </footer>
        </article>

        <aside className={`${styles.aside} no-print`} aria-labelledby="qr-contents">
          <h2 id="qr-contents" className={styles.asideTitle}>
            What the QR code contains
          </h2>
          <p className={styles.asideText}>
            Plain text only — no link, no account and no server. Anyone who scans it sees exactly this:
          </p>
          <pre className={styles.pre}>{summary}</pre>
          <ul className={styles.tips}>
            <li>Keep a printed copy in your wallet or child's school bag.</li>
            <li>Save it as your phone's lock-screen image for paramedics.</li>
            <li>Re-print whenever medications change.</li>
          </ul>
        </aside>
      </div>
    </>
  );
}
