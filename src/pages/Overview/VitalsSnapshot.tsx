import { useState } from 'react';
import { Activity, Droplet, HeartPulse, Plus, Scale, Wind } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Profile, VitalKind } from '../../lib/types';
import { VITAL_KINDS } from '../../lib/types';
import { VITALS, personContext, vitalRangeLabel, vitalStatus } from '../../lib/ranges';
import { formatDate, relativeDays, toISODate } from '../../lib/date';
import { firstName } from '../../lib/format';
import { vitalSeries } from '../../lib/selectors';
import { useActiveProfile } from '../../state/store';
import { useToast } from '../../state/toast';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { Sparkline } from '../../components/charts/Sparkline';
import { StatusPill } from '../../components/ui/Pill';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { VitalForm } from './VitalForm';
import styles from './Overview.module.css';

const VITAL_ICONS: Record<VitalKind, LucideIcon> = {
  bp: HeartPulse,
  hr: Activity,
  glucose: Droplet,
  weight: Scale,
  spo2: Wind,
};

function VitalCard({ kind, profile }: { kind: VitalKind; profile: Profile }) {
  const { data, now } = useActiveProfile();
  const meta = VITALS[kind];
  const Icon = VITAL_ICONS[kind];
  const series = vitalSeries(data, profile.id, kind);
  const latest = series[series.length - 1];
  const person = { ...personContext(profile, now), heightCm: profile.heightCm };

  if (!latest) {
    return (
      <li className={styles.vital} data-empty="">
        <div className={styles.vitalTop}>
          <span className={styles.vitalIcon} aria-hidden="true">
            <Icon size={16} />
          </span>
          <span className={styles.vitalHeading}>
            <h3 className={styles.vitalLabel}>{meta.label}</h3>
            <span className={styles.vitalRange}>{vitalRangeLabel(kind, person)}</span>
          </span>
        </div>
        <p className={styles.vitalEmptyTitle}>No readings yet</p>
        <p className={styles.vitalMeta}>Readings from home devices or clinic visits will appear here.</p>
      </li>
    );
  }

  // Weight has no status until a height is known (BMI needs it).
  const status = vitalStatus(kind, latest, person);
  const tone = status ?? 'normal';
  const recent = series.slice(-14);
  const sparkSeries = kind === 'bp' ? [recent.map((r) => r.value), recent.map((r) => r.value2 ?? 0)] : [recent.map((r) => r.value)];
  const valueText =
    kind === 'bp' ? `${latest.value}/${latest.value2}` : `${latest.value.toFixed(meta.decimals)}`;

  return (
    <li className={styles.vital} data-status={status ?? undefined}>
      <div className={styles.vitalTop}>
        <span className={styles.vitalIcon} aria-hidden="true">
          <Icon size={16} />
        </span>
        <span className={styles.vitalHeading}>
          <h3 className={styles.vitalLabel}>{meta.label}</h3>
          <span className={styles.vitalRange}>{vitalRangeLabel(kind, person, latest)}</span>
        </span>
      </div>
      <p className={styles.vitalValue}>
        {kind === 'bp' ? (
          <>
            <AnimatedNumber value={latest.value} className={`${styles.big} display num`} />
            <span className={styles.slash} aria-hidden="true">
              /
            </span>
            <span className="visually-hidden"> over </span>
            <AnimatedNumber value={latest.value2 ?? 0} className={`${styles.big} display num`} />
          </>
        ) : (
          <AnimatedNumber value={latest.value} decimals={meta.decimals} className={`${styles.big} display num`} />
        )}
        <span className={styles.unit}>{meta.unit}</span>
      </p>
      <Sparkline
        series={sparkSeries}
        status={tone}
        label={`${meta.label} trend over the last ${recent.length} readings, latest ${valueText} ${meta.unit} on ${formatDate(latest.date)}`}
      />
      <div className={styles.vitalFoot}>
        {status && <StatusPill status={status} size="sm" />}
        <span className={styles.vitalMeta}>{relativeDays(latest.date, now)}</span>
      </div>
    </li>
  );
}

export function VitalsSnapshot({ profile }: { profile: Profile }) {
  const { data, now, addVital, deleteVital } = useActiveProfile();
  const { notify } = useToast();
  const [adding, setAdding] = useState(false);
  const readings = data.vitals.filter((v) => v.profileId === profile.id);

  return (
    <section aria-labelledby="snapshot-heading" className={styles.snapshot}>
      <div className={styles.sectionHead}>
        <h2 id="snapshot-heading" className={styles.sectionTitle}>
          Health snapshot
        </h2>
        <p className={styles.sectionHint}>Latest readings with a 14-reading trend</p>
        <Button variant="ghost" size="sm" icon={<Plus />} className={styles.sectionAction} onClick={() => setAdding(true)}>
          Add reading
        </Button>
      </div>
      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a reading"
        description={`Blood pressure, heart rate, glucose, weight or oxygen for ${firstName(profile.name)}.`}
      >
        <VitalForm
          today={toISODate(now)}
          readings={readings}
          onCancel={() => setAdding(false)}
          onSubmit={(input) => {
            addVital(input);
            setAdding(false);
            notify(`${VITALS[input.kind].label} reading added`);
          }}
          onDeleteReading={(id) => {
            deleteVital(id);
            notify('Reading deleted');
          }}
        />
      </Dialog>
      <ul role="list" className={styles.vitals}>
        {VITAL_KINDS.map((kind) => (
          <VitalCard key={kind} kind={kind} profile={profile} />
        ))}
      </ul>
    </section>
  );
}
