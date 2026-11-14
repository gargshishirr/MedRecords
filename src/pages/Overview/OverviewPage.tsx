import { Link } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ClipboardList,
  FlaskConical,
  History,
  IdCard,
  Minus,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import { useStore } from '../../state/store';
import { useDocumentTitle, PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { ButtonLink } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusPill } from '../../components/ui/Pill';
import { LAB_TESTS, isOutOfRange, labStatus, personContext } from '../../lib/ranges';
import {
  ageInYears,
  daysBetween,
  formatDate,
  formatLongDate,
  formatTime,
  greetingFor,
  parseISODate,
  relativeDays,
  monthShort,
} from '../../lib/date';
import { firstName, formatSigned } from '../../lib/format';
import { activityFor, latestLabs, upcomingAppointments } from '../../lib/selectors';
import { VitalsSnapshot } from './VitalsSnapshot';
import { TodayMeds } from './TodayMeds';
import styles from './Overview.module.css';

function LatestLabs() {
  const { data, profile, now } = useStore();
  const person = personContext(profile, now);
  const rows = latestLabs(data.labs.filter((l) => l.profileId === profile.id)).slice(0, 6);
  const flagged = rows.filter((r) => isOutOfRange(labStatus(r.latest.testId, r.latest.value, person))).length;

  return (
    <Card
      title="Latest lab results"
      description={rows.length ? (flagged ? `${flagged} result${flagged > 1 ? 's' : ''} outside the reference range` : 'All latest results within range') : undefined}
      icon={<FlaskConical />}
      action={
        <ButtonLink to="/labs" variant="ghost" size="sm">
          View trends
        </ButtonLink>
      }
      flush
    >
      {rows.length === 0 ? (
        <EmptyState icon={<FlaskConical />} title="No lab results yet" compact>
          Add a lab report to start tracking trends.
        </EmptyState>
      ) : (
        <ul role="list" className={styles.labList}>
          {rows.map(({ latest, previous }) => {
            const test = LAB_TESTS[latest.testId];
            const status = labStatus(latest.testId, latest.value, person);
            const delta = previous ? latest.value - previous.value : null;
            const DeltaIcon = delta === null || Math.abs(delta) < 10 ** -test.decimals ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
            return (
              <li key={latest.testId}>
                <Link to={`/labs?test=${test.id}`} className={styles.labRow}>
                  <span className={styles.labName}>
                    <span className={styles.labTitle}>{test.name}</span>
                    <span className={styles.labDate}>{formatDate(latest.date)}</span>
                  </span>
                  <span className={styles.labValue}>
                    <span className="num">{latest.value.toFixed(test.decimals)}</span>
                    <span className={styles.labUnit}> {test.unit}</span>
                  </span>
                  <span className={styles.labDelta} title="Change since previous result">
                    {delta !== null && (
                      <>
                        <DeltaIcon size={14} aria-hidden="true" />
                        <span className="num">{formatSigned(delta, test.decimals)}</span>
                        <span className="visually-hidden"> since previous result</span>
                      </>
                    )}
                  </span>
                  <StatusPill status={status} size="sm" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Upcoming() {
  const { data, profile, now } = useStore();
  const items = upcomingAppointments(data, profile.id, now).slice(0, 3);
  return (
    <Card title="Upcoming appointments" icon={<CalendarDays />} flush>
      {items.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title="No upcoming appointments" compact />
      ) : (
        <ul role="list" className={styles.apptList}>
          {items.map((a) => {
            const d = parseISODate(a.at);
            const soon = daysBetween(now, a.at) <= 7;
            return (
              <li key={a.id} className={styles.appt}>
                <span className={styles.apptDate} data-soon={soon || undefined} aria-hidden="true">
                  <span className={styles.apptMonth}>{monthShort(d)}</span>
                  <span className={`${styles.apptDay} display`}>{d.getDate()}</span>
                </span>
                <span className={styles.apptBody}>
                  <span className={styles.apptReason}>{a.reason}</span>
                  <span className={styles.apptMeta}>
                    {a.doctor} · {a.specialty}
                  </span>
                  <span className={styles.apptMeta}>
                    <span className="visually-hidden">{formatDate(a.at)}, </span>
                    {formatTime(a.at)} · {a.facility}
                  </span>
                </span>
                <span className={styles.apptWhen} data-soon={soon || undefined}>
                  {relativeDays(a.at, now)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function AllergiesConditions() {
  const { profile } = useStore();
  return (
    <Card title="Allergies & conditions" icon={<ShieldAlert />}>
      <div className={styles.chipGroups}>
        <div>
          <h3 className={styles.chipHeading}>Allergies</h3>
          {profile.allergies.length === 0 ? (
            <p className={styles.none}>No known allergies</p>
          ) : (
            <ul role="list" className={styles.chips}>
              {profile.allergies.map((a) => (
                <li key={a.name} className={styles.chip} data-severity={a.severity} title={a.reaction}>
                  <span className={styles.chipDot} aria-hidden="true" />
                  {a.name}
                  <span className={styles.chipMeta}>{a.severity}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className={styles.chipHeading}>Conditions</h3>
          {profile.conditions.length === 0 ? (
            <p className={styles.none}>No chronic conditions recorded</p>
          ) : (
            <ul role="list" className={styles.chips}>
              {profile.conditions.map((c) => (
                <li key={c.name} className={styles.chip} data-condition={c.status}>
                  {c.name}
                  <span className={styles.chipMeta}>{c.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

function activityTime(at: string, now: Date): string {
  const diff = daysBetween(at, now);
  if (diff === 0) return `Today, ${formatTime(at)}`;
  if (diff === 1) return `Yesterday, ${formatTime(at)}`;
  return relativeDays(at.slice(0, 10), now);
}

function RecentActivity() {
  const { data, profile, now } = useStore();
  const items = activityFor(data, profile.id, 5);
  return (
    <Card title="Recent activity" icon={<History />}>
      {items.length === 0 ? (
        <EmptyState icon={<History />} title="No activity yet" compact />
      ) : (
        <ol role="list" className={styles.timeline}>
          {items.map((item) => (
            <li key={item.id} className={styles.timelineItem} data-kind={item.kind}>
              <span className={styles.timelineDot} aria-hidden="true" />
              <span className={styles.timelineText}>{item.text}</span>
              <time className={styles.timelineTime} dateTime={item.at}>
                {activityTime(item.at, now)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function OverviewPage() {
  const { data, profile, now } = useStore();
  useDocumentTitle('Overview');
  const owner = data.profiles.find((p) => p.relation === 'Self') ?? profile;
  const isOwner = owner.id === profile.id;

  return (
    <>
      <PageHeader
        eyebrow={formatLongDate(now)}
        title={`${greetingFor(now)}, ${firstName(owner.name)}`}
        description={
          isOwner
            ? "Here's your health at a glance."
            : `You're viewing ${firstName(profile.name)}'s profile — ${profile.relation.toLowerCase()}, ${ageInYears(profile.dob, now)} years.`
        }
        actions={
          <>
            <ButtonLink to="/emergency" icon={<IdCard />}>
              Emergency card
            </ButtonLink>
            <ButtonLink to="/records?new=1" variant="primary" icon={<Plus />}>
              Add record
            </ButtonLink>
          </>
        }
      />

      <VitalsSnapshot profile={profile} />

      <div className={styles.grid}>
        <div className={styles.col}>
          <TodayMeds />
          <LatestLabs />
        </div>
        <div className={styles.col}>
          <Upcoming />
          <AllergiesConditions />
          <RecentActivity />
        </div>
      </div>

      <p className={styles.footnote}>
        <ClipboardList size={14} aria-hidden="true" />
        All people, clinicians and facilities in this demo are fictional. Not medical advice.
      </p>
    </>
  );
}
