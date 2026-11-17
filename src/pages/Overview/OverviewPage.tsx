import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  FlaskConical,
  History,
  IdCard,
  Minus,
  Pencil,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import { useActiveProfile } from '../../state/store';
import { useToast } from '../../state/toast';
import { useProfileEditor } from '../../components/family/ProfileEditor';
import { useDocumentTitle, PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button, ButtonLink, IconButton } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
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
  toISODate,
} from '../../lib/date';
import { firstName, formatSigned } from '../../lib/format';
import { activityFor, latestLabs, upcomingAppointments } from '../../lib/selectors';
import type { NavIntent } from '../../lib/hooks';
import { VitalsSnapshot } from './VitalsSnapshot';
import { TodayMeds } from './TodayMeds';
import { AppointmentForm } from './AppointmentForm';
import styles from './Overview.module.css';

function LatestLabs() {
  const { data, profile, now } = useActiveProfile();
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
        <EmptyState
          icon={<FlaskConical />}
          title="No lab results yet"
          compact
          action={
            <ButtonLink to="/labs" state={{ add: true } satisfies NavIntent} size="sm" icon={<Plus />}>
              Add a lab result
            </ButtonLink>
          }
        >
          Add results to start tracking trends.
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
                <Link to="/labs" state={{ test: test.id } satisfies NavIntent} className={styles.labRow}>
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
  const { data, profile, now, addAppointment, updateAppointment, deleteAppointment } = useActiveProfile();
  const { notify } = useToast();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const items = upcomingAppointments(data, profile.id, now);
  const editing = items.find((a) => a.id === editingId) ?? null;
  const today = toISODate(now);

  return (
    <Card
      title="Upcoming appointments"
      icon={<CalendarDays />}
      action={
        <Button variant="ghost" size="sm" icon={<CalendarPlus />} onClick={() => setAdding(true)}>
          Add
        </Button>
      }
      flush
    >
      {items.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title="No upcoming appointments" compact>
          Add check-ups and follow-ups so they show here.
        </EmptyState>
      ) : (
        <ul role="list" className={styles.apptList}>
          {items.map((a) => {
            const d = parseISODate(a.at);
            const soon = daysBetween(now, a.at) <= 7;
            const who = [a.doctor, a.specialty].filter(Boolean).join(' · ');
            return (
              <li key={a.id} className={styles.appt}>
                <span className={styles.apptDate} data-soon={soon || undefined} aria-hidden="true">
                  <span className={styles.apptMonth}>{monthShort(d)}</span>
                  <span className={`${styles.apptDay} display`}>{d.getDate()}</span>
                </span>
                <span className={styles.apptBody}>
                  <span className={styles.apptReason}>{a.reason}</span>
                  {who && <span className={styles.apptMeta}>{who}</span>}
                  <span className={styles.apptMeta}>
                    <span className="visually-hidden">{formatDate(a.at)}, </span>
                    {[formatTime(a.at), a.facility].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className={styles.apptSide}>
                  <span className={styles.apptWhen} data-soon={soon || undefined}>
                    {relativeDays(a.at, now)}
                  </span>
                  <IconButton label={`Edit appointment: ${a.reason}`} onClick={() => setEditingId(a.id)}>
                    <Pencil />
                  </IconButton>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add an appointment"
        description={`For ${firstName(profile.name)}. It shows here until the day has passed.`}
      >
        <AppointmentForm
          today={today}
          onCancel={() => setAdding(false)}
          onSubmit={(input) => {
            addAppointment(input);
            setAdding(false);
            notify('Appointment added');
          }}
        />
      </Dialog>
      <Dialog open={editing !== null} onClose={() => setEditingId(null)} title="Edit appointment">
        {editing && (
          <AppointmentForm
            key={editing.id}
            initial={editing}
            today={today}
            onCancel={() => setEditingId(null)}
            onSubmit={(input) => {
              updateAppointment(editing.id, input);
              setEditingId(null);
              notify('Appointment saved');
            }}
            onDelete={() => {
              deleteAppointment(editing.id);
              setEditingId(null);
              notify('Appointment deleted');
            }}
          />
        )}
      </Dialog>
    </Card>
  );
}

function AllergiesConditions() {
  const { profile } = useActiveProfile();
  const { openEdit } = useProfileEditor();
  return (
    <Card
      title="Allergies & conditions"
      icon={<ShieldAlert />}
      action={
        <Button variant="ghost" size="sm" icon={<Pencil />} onClick={() => openEdit(profile.id)}>
          Edit
        </Button>
      }
    >
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
  const { data, profile, now } = useActiveProfile();
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
  const { data, profile, now } = useActiveProfile();
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
            : `You're viewing ${firstName(profile.name)}'s profile — ${[profile.relation.toLowerCase(), `${ageInYears(profile.dob, now)} years`].filter(Boolean).join(', ')}.`
        }
        actions={
          <>
            <ButtonLink to="/emergency" icon={<IdCard />}>
              Emergency card
            </ButtonLink>
            <ButtonLink to="/records" state={{ add: true } satisfies NavIntent} variant="primary" icon={<Plus />}>
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
        {data.demo
          ? 'All people, clinicians and facilities in this demo are fictional. Not medical advice.'
          : 'Stored only in this browser. Not medical advice: talk to your doctor about your results.'}
      </p>
    </>
  );
}
