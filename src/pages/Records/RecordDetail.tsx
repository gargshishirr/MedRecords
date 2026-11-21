import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  CalendarDays,
  IndianRupee,
  ChartLine,
  Pencil,
  Stethoscope,
  Clock,
  Trash2,
} from 'lucide-react';
import type { HealthRecord } from '../../lib/types';
import type { NavIntent } from '../../lib/hooks';
import { useActiveProfile } from '../../state/store';
import { LAB_TESTS, formatRange, labStatus, personContext } from '../../lib/ranges';
import { formatDate, formatTime, relativeDays } from '../../lib/date';
import { formatINR } from '../../lib/format';
import { Attachments } from '../../components/files/Attachments';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/Pill';
import { RecordTypeBadge } from '../../components/RecordTypeIcon';
import styles from './RecordDetail.module.css';

export function RecordDetail({
  record,
  onClose,
  onEdit,
  onDelete,
  deleteText,
}: {
  record: HealthRecord | null;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  deleteText: string;
}) {
  const { data, profile, now } = useActiveProfile();
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const person = personContext(profile, now);
  const results = record ? data.labs.filter((l) => l.recordId === record.id) : [];
  const recordId = record?.id;

  // Each record starts without a pending delete.
  useEffect(() => setConfirming(false), [recordId]);
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const footer =
    record && confirming ? (
      <div className={styles.confirm} role="group" aria-labelledby="detail-confirm">
        <p id="detail-confirm" className={styles.confirmText}>
          {deleteText}
        </p>
        <Button variant="ghost" onClick={() => setConfirming(false)}>
          Keep it
        </Button>
        <Button ref={confirmRef} variant="danger" icon={<Trash2 />} onClick={() => onDelete(record.id)}>
          Yes, delete
        </Button>
      </div>
    ) : (
      <>
        <Button variant="danger" icon={<Trash2 />} className={styles.footerStart} onClick={() => setConfirming(true)}>
          Delete
        </Button>
        <Button variant="secondary" icon={<Pencil />} onClick={() => record && onEdit(record.id)}>
          Edit
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </>
    );

  return (
    <Dialog
      open={record !== null}
      onClose={onClose}
      variant="sheet"
      eyebrow={record && <RecordTypeBadge type={record.type} />}
      title={record?.title ?? ''}
      description={record ? `${formatDate(record.date)} · ${relativeDays(record.date, now)}` : undefined}
      footer={footer}
    >
      {record && (
        <div className={styles.detail}>
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>
                <CalendarDays size={15} aria-hidden="true" /> Date
              </dt>
              <dd>{formatDate(record.date)}</dd>
            </div>
            <div className={styles.fact}>
              <dt>
                <Stethoscope size={15} aria-hidden="true" /> Doctor
              </dt>
              <dd>{record.doctor ?? '—'}</dd>
            </div>
            <div className={styles.fact}>
              <dt>
                <Building2 size={15} aria-hidden="true" /> Facility
              </dt>
              <dd>{record.facility ?? '—'}</dd>
            </div>
            <div className={styles.fact}>
              <dt>
                <IndianRupee size={15} aria-hidden="true" /> Cost
              </dt>
              <dd className="num">{record.cost !== undefined ? formatINR(record.cost) : '—'}</dd>
            </div>
          </dl>

          {record.summary && results.length === 0 && (
            <section className={styles.section} aria-labelledby="detail-summary">
              <h3 id="detail-summary" className={styles.sectionTitle}>
                Summary
              </h3>
              <p className={styles.prose}>{record.summary}</p>
            </section>
          )}

          {results.length > 0 && (
            <section className={styles.section} aria-labelledby="detail-results">
              <h3 id="detail-results" className={styles.sectionTitle}>
                Results
              </h3>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Test</th>
                      <th scope="col" className={styles.right}>
                        Result
                      </th>
                      <th scope="col">Reference</th>
                      <th scope="col">
                        <span className="visually-hidden">Status</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => {
                      const test = LAB_TESTS[r.testId];
                      return (
                        <tr key={r.id}>
                          <th scope="row">
                            <Link
                              to="/labs"
                              state={{ test: test.id } satisfies NavIntent}
                              className={styles.testLink}
                              onClick={onClose}
                            >
                              {test.name}
                            </Link>
                          </th>
                          <td className={`${styles.right} num`}>
                            <strong>{r.value.toFixed(test.decimals)}</strong> <span className={styles.unit}>{test.unit}</span>
                          </td>
                          <td className={styles.range}>{formatRange(test.range(person), test.unit, test.decimals)}</td>
                          <td>
                            <StatusPill status={labStatus(r.testId, r.value, person)} size="sm" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Link
                to="/labs"
                state={{ test: results[0]!.testId } satisfies NavIntent}
                className={styles.trendLink}
                onClick={onClose}
              >
                <ChartLine size={15} aria-hidden="true" />
                View trends for these tests
              </Link>
            </section>
          )}

          {record.notes && (
            <section className={styles.section} aria-labelledby="detail-notes">
              <h3 id="detail-notes" className={styles.sectionTitle}>
                Notes
              </h3>
              <p className={`${styles.prose} ${styles.notes}`}>{record.notes}</p>
            </section>
          )}

          <Attachments record={record} />

          <p className={styles.added}>
            <Clock size={13} aria-hidden="true" />
            Added to MedRecords {formatDate(record.createdAt)}
            {record.createdAt.includes('T') && `, ${formatTime(record.createdAt)}`}
          </p>
        </div>
      )}
    </Dialog>
  );
}
