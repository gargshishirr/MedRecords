import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, FlaskConical, Info, Minus, Table2 } from 'lucide-react';
import type { LabTestId } from '../../lib/types';
import { LAB_TESTS, classify, formatRange, isOutOfRange, personContext } from '../../lib/ranges';
import type { RefRange } from '../../lib/ranges';
import { formatDate, formatDayMonth, relativeDays } from '../../lib/date';
import { firstName, formatSigned, pluralize } from '../../lib/format';
import { availableTests, labSeries, labsFor } from '../../lib/selectors';
import { useStore } from '../../state/store';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button, ButtonLink } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusPill } from '../../components/ui/Pill';
import { LineChart } from '../../components/charts/LineChart';
import type { ChartPoint } from '../../components/charts/LineChart';
import styles from './Labs.module.css';

function distanceFromRange(value: number, range: RefRange): number {
  if (value > range.high) return value - range.high;
  if (value < range.low) return range.low - value;
  return 0;
}

function Trend({ latest, previous, range, decimals, unit }: { latest: number; previous?: number; range: RefRange; decimals: number; unit: string }) {
  if (previous === undefined) return <span className={styles.statMeta}>First result</span>;
  const delta = latest - previous;
  const before = distanceFromRange(previous, range);
  const after = distanceFromRange(latest, range);
  const tone = after < before ? 'better' : after > before ? 'worse' : 'same';
  const Icon = Math.abs(delta) < 10 ** -decimals ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const words = tone === 'better' ? 'Moving toward range' : tone === 'worse' ? 'Moving away from range' : after === 0 ? 'Stable, within range' : 'Unchanged';
  return (
    <>
      <span className={styles.delta} data-tone={tone}>
        <Icon size={18} aria-hidden="true" />
        <span className="num">{formatSigned(delta, decimals)}</span>
        <span className={styles.deltaUnit}>{unit}</span>
      </span>
      <span className={styles.statMeta}>{words}</span>
    </>
  );
}

export function LabsPage() {
  const { data, profile, now } = useStore();
  const [params, setParams] = useSearchParams();
  const [showTable, setShowTable] = useState(false);
  const tabRefs = useRef<Partial<Record<LabTestId, HTMLButtonElement | null>>>({});
  useDocumentTitle('Lab trends');

  const person = personContext(profile, now);
  const labs = useMemo(() => labsFor(data, profile.id), [data, profile.id]);
  const tests = useMemo(() => availableTests(labs), [labs]);
  const requested = params.get('test') as LabTestId | null;
  // Default to the test with the longest history — it makes the most useful chart.
  const defaultTest = useMemo(
    () =>
      tests.reduce<LabTestId | undefined>(
        (best, id) => (best === undefined || labSeries(labs, id).length > labSeries(labs, best).length ? id : best),
        undefined,
      ),
    [tests, labs],
  );
  const testId: LabTestId | undefined = requested && tests.includes(requested) ? requested : defaultTest;

  const select = (id: LabTestId, focus = false) => {
    setParams({ test: id }, { replace: true });
    if (focus) tabRefs.current[id]?.focus();
  };

  const onTabKey = (e: KeyboardEvent, index: number) => {
    const last = tests.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = index === last ? 0 : index + 1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = index === 0 ? last : index - 1;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = last;
    if (next !== null) {
      e.preventDefault();
      select(tests[next]!, true);
    }
  };

  if (!testId) {
    return (
      <>
        <PageHeader title="Lab trends" description={`Track ${firstName(profile.name)}'s results over time.`} />
        <Card>
          <EmptyState
            icon={<FlaskConical />}
            title="No lab results yet"
            action={
              <ButtonLink to="/records?new=1" variant="primary">
                Add a lab report
              </ButtonLink>
            }
          >
            When lab reports with results are added, you'll see trends against reference ranges here.
          </EmptyState>
        </Card>
      </>
    );
  }

  const test = LAB_TESTS[testId];
  const range = test.range(person);
  const series = labSeries(labs, testId);
  const points: ChartPoint[] = series.map((r) => ({ id: r.id, date: r.date, value: r.value, status: classify(r.value, range) }));
  const latest = series[series.length - 1]!;
  const previous = series[series.length - 2];
  const latestStatus = classify(latest.value, range);
  const outOfRangeCount = points.filter((p) => isOutOfRange(p.status)).length;

  return (
    <>
      <PageHeader
        title="Lab trends"
        description={`${firstName(profile.name)}'s results over time, plotted against the reference range for a ${person.age}-year-old ${profile.sex.toLowerCase()}.`}
      />

      <div className={styles.tabs} role="tablist" aria-label="Lab tests">
        {tests.map((id, i) => {
          const t = LAB_TESTS[id];
          const s = labSeries(labs, id);
          const last = s[s.length - 1]!;
          const status = classify(last.value, t.range(person));
          const selected = id === testId;
          return (
            <button
              key={id}
              ref={(el) => {
                tabRefs.current[id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={selected}
              aria-controls="lab-panel"
              tabIndex={selected ? 0 : -1}
              className={styles.tab}
              onClick={() => select(id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              <span className={styles.tabTop}>
                <span className={styles.tabName}>{t.short}</span>
                <span className={styles.tabDot} data-status={status} aria-hidden="true" />
              </span>
              <span className={styles.tabValue}>
                <span className="num">{last.value.toFixed(t.decimals)}</span> <span className={styles.tabUnit}>{t.unit}</span>
              </span>
              <span className="visually-hidden">, {status}</span>
            </button>
          );
        })}
      </div>

      <section id="lab-panel" role="tabpanel" aria-labelledby={`tab-${testId}`} className={styles.panel}>
        <Card>
          <div className={styles.panelHead}>
            <div>
              <h2 className={`${styles.testName} display`}>{test.name}</h2>
              <p className={styles.testSub}>
                {pluralize(series.length, 'result')} since {formatDate(series[0]!.date)}
                {outOfRangeCount > 0 && ` · ${outOfRangeCount} outside range`}
              </p>
            </div>
            <Button
              size="sm"
              icon={<Table2 />}
              aria-pressed={showTable}
              aria-controls="lab-table"
              onClick={() => setShowTable((s) => !s)}
            >
              Show table
            </Button>
          </div>

          <dl className={styles.stats}>
            <div className={styles.stat}>
              <dt>Latest</dt>
              <dd>
                <span className={styles.statValue}>
                  <span className="display num">{latest.value.toFixed(test.decimals)}</span>
                  <span className={styles.statUnit}>{test.unit}</span>
                  <StatusPill status={latestStatus} size="sm" />
                </span>
                <span className={styles.statMeta}>
                  {formatDate(latest.date)} · {relativeDays(latest.date, now)}
                </span>
              </dd>
            </div>
            <div className={styles.stat}>
              <dt>Change vs previous</dt>
              <dd>
                <Trend latest={latest.value} previous={previous?.value} range={range} decimals={test.decimals} unit={test.unit} />
              </dd>
            </div>
            <div className={styles.stat}>
              <dt>Reference range</dt>
              <dd>
                <span className={styles.statRange}>{formatRange(range, test.unit, test.decimals)}</span>
                <span className={styles.statMeta}>
                  {range.watchHigh !== undefined
                    ? `Borderline up to ${range.watchHigh.toFixed(test.decimals)}`
                    : range.watchLow !== undefined
                      ? `Borderline down to ${range.watchLow.toFixed(test.decimals)}`
                      : 'Adult reference'}
                </span>
              </dd>
            </div>
          </dl>

          <LineChart
            points={points}
            range={range}
            unit={test.unit}
            decimals={test.decimals}
            title={`${test.name} results for ${profile.name}`}
          />

          <ul className={styles.legend} aria-label="Chart legend">
            <li>
              <span className={styles.legendLine} aria-hidden="true" /> Result
            </li>
            <li>
              <span className={styles.legendBand} aria-hidden="true" /> Reference range
            </li>
            <li>
              <span className={styles.legendDot} data-status="watch" aria-hidden="true" /> Borderline
            </li>
            <li>
              <span className={styles.legendDot} data-status="high" aria-hidden="true" /> Out of range
            </li>
          </ul>

          <div id="lab-table" className={showTable ? styles.tableWrap : 'visually-hidden'}>
            <table className={styles.table}>
              <caption className="visually-hidden">{`${test.name} results (${test.unit}), oldest first`}</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col" className={styles.num}>
                    Result ({test.unit})
                  </th>
                  <th scope="col" className={styles.num}>
                    Change
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Report</th>
                </tr>
              </thead>
              <tbody>
                {series.map((r, i) => {
                  const prev = series[i - 1];
                  const record = r.recordId ? data.records.find((rec) => rec.id === r.recordId) : undefined;
                  return (
                    <tr key={r.id}>
                      <th scope="row">{formatDate(r.date)}</th>
                      <td className={`${styles.num} num`}>{r.value.toFixed(test.decimals)}</td>
                      <td className={`${styles.num} num`}>{prev ? formatSigned(r.value - prev.value, test.decimals) : '—'}</td>
                      <td>
                        <StatusPill status={points[i]!.status} size="sm" />
                      </td>
                      <td>
                        {record ? (
                          <Link to={`/records?open=${record.id}`} className={styles.reportLink}>
                            {record.title}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <aside className={styles.about} aria-label={`About ${test.name}`}>
          <Info size={18} aria-hidden="true" />
          <div>
            <p className={styles.aboutTitle}>About {test.name}</p>
            <p className={styles.aboutText}>{test.description}</p>
            <p className={styles.aboutNote}>
              Reference ranges vary between laboratories. Discuss results with your doctor — this is not medical advice. Last
              tested {formatDayMonth(latest.date)}.
            </p>
          </div>
        </aside>
      </section>
    </>
  );
}
