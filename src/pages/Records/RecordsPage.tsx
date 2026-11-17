import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, ClipboardList, Paperclip, Plus, Search, X } from 'lucide-react';
import type { HealthRecord, RecordType } from '../../lib/types';
import { RECORD_TYPES } from '../../lib/types';
import { RECORD_TYPE_META } from '../../lib/recordMeta';
import { formatDayMonth, formatMonthLong, toISODate, weekdayShort } from '../../lib/date';
import { firstName, formatINR, pluralize } from '../../lib/format';
import { recordsFor } from '../../lib/selectors';
import type { NewRecordInput } from '../../lib/store';
import { useNavIntent } from '../../lib/hooks';
import { useActiveProfile } from '../../state/store';
import { useToast } from '../../state/toast';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { RECORD_ICONS, RecordTypeBadge, RecordTypeIcon, typeColorStyle } from '../../components/RecordTypeIcon';
import { selectClass } from '../../components/ui/Field';
import { AddRecordForm } from './AddRecordForm';
import { RecordDetail } from './RecordDetail';
import styles from './Records.module.css';

type SortKey = 'newest' | 'oldest' | 'title';

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  title: 'Title (A–Z)',
};

function groupByMonth(records: HealthRecord[]) {
  const groups: { key: string; label: string; items: HealthRecord[] }[] = [];
  for (const r of records) {
    const key = r.date.slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: formatMonthLong(r.date), items: [] };
      groups.push(group);
    }
    group.items.push(r);
  }
  return groups;
}

export function RecordsPage() {
  const { data, profile, now, addRecord, updateRecord, deleteRecord } = useActiveProfile();
  const { notify } = useToast();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<RecordType | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useDocumentTitle('Records');

  // Requests from the command palette and other pages: open a record or the add form.
  useNavIntent((intent) => {
    if (intent.open) {
      setSelectedId(intent.open);
      setTypeFilter('all');
      setQuery('');
    }
    if (intent.add) setAdding(true);
  });

  const all = useMemo(() => recordsFor(data, profile.id), [data, profile.id]);
  const selected = all.find((r) => r.id === selectedId) ?? null;
  const editing = all.find((r) => r.id === editingId) ?? null;
  const linkedLabs = (id: string) => data.labs.filter((l) => l.recordId === id).length;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length };
    for (const t of RECORD_TYPES) c[t] = all.filter((r) => r.type === t).length;
    return c;
  }, [all]);

  const filtered = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = all.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (!tokens.length) return true;
      const hay = [r.title, r.doctor, r.facility, r.summary, r.notes, RECORD_TYPE_META[r.type].label]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
    if (sort === 'oldest') return [...list].reverse();
    if (sort === 'title') return [...list].sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [all, query, typeFilter, sort]);

  const groups = sort === 'title' ? [{ key: 'az', label: 'All records, A–Z', items: filtered }] : groupByMonth(filtered);

  const year = now.getFullYear();
  const spentThisYear = all.filter((r) => r.date.startsWith(String(year))).reduce((sum, r) => sum + (r.cost ?? 0), 0);

  // Scroll the newly added record into view and briefly highlight it.
  useEffect(() => {
    if (!highlightId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-record-id="${highlightId}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = window.setTimeout(() => setHighlightId(null), 2400);
    return () => window.clearTimeout(t);
  }, [highlightId]);

  const handleAdd = (input: NewRecordInput) => {
    const record = addRecord(input);
    setAdding(false);
    setTypeFilter('all');
    setQuery('');
    setSort('newest');
    setHighlightId(record.id);
    notify('Record added');
  };

  const handleDelete = (id: string) => {
    deleteRecord(id);
    setSelectedId(null);
    setEditingId(null);
    notify('Record deleted');
  };

  const deleteText = (id: string) => {
    const n = linkedLabs(id);
    return `Delete this record${n ? ` and its ${pluralize(n, 'lab result')}` : ''}? This cannot be undone.`;
  };

  const clearFilters = () => {
    setQuery('');
    setTypeFilter('all');
  };

  return (
    <>
      <PageHeader
        title="Records"
        description={`${pluralize(all.length, 'record')} for ${firstName(profile.name)} · ${formatINR(spentThisYear)} out-of-pocket in ${year}`}
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>
            Add record
          </Button>
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.searchRow}>
          <div className={styles.search}>
            <Search size={17} aria-hidden="true" className={styles.searchIcon} />
            <label htmlFor="records-search" className="visually-hidden">
              Search records
            </label>
            <input
              id="records-search"
              type="search"
              className={styles.searchInput}
              placeholder="Search title, doctor, notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
            {query && (
              <IconButton label="Clear search" className={styles.clear} onClick={() => setQuery('')}>
                <X />
              </IconButton>
            )}
          </div>
          <div className={styles.sort}>
            <ArrowDownUp size={16} aria-hidden="true" className={styles.sortIcon} />
            <label htmlFor="records-sort" className="visually-hidden">
              Sort records
            </label>
            <select
              id="records-sort"
              className={`${selectClass} ${styles.sortSelect}`}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.chips} role="group" aria-label="Filter by record type">
          <button
            type="button"
            className={styles.chip}
            aria-pressed={typeFilter === 'all'}
            onClick={() => setTypeFilter('all')}
          >
            All <span className={styles.count}>{counts.all}</span>
          </button>
          {RECORD_TYPES.map((t) => {
            const Icon = RECORD_ICONS[t];
            return (
              <button
                key={t}
                type="button"
                className={styles.chip}
                style={typeColorStyle(t)}
                aria-pressed={typeFilter === t}
                onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
              >
                <Icon size={15} aria-hidden="true" className={styles.chipIcon} />
                {RECORD_TYPE_META[t].plural}
                <span className={styles.count}>{counts[t]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className={styles.resultCount} aria-live="polite">
        {filtered.length === all.length
          ? `Showing all ${pluralize(all.length, 'record')}`
          : `Showing ${filtered.length} of ${pluralize(all.length, 'record')}`}
      </p>

      <div ref={listRef}>
        {filtered.length === 0 ? (
          <div className={styles.emptyCard}>
            <EmptyState
              icon={<ClipboardList />}
              title={all.length === 0 ? 'No records yet' : 'No records match'}
              action={
                all.length === 0 ? (
                  <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>
                    Add the first record
                  </Button>
                ) : (
                  <Button onClick={clearFilters}>Clear filters</Button>
                )
              }
            >
              {all.length === 0
                ? 'Visits, lab reports, prescriptions and more will appear here.'
                : 'Try a different search term or record type.'}
            </EmptyState>
          </div>
        ) : (
          <div className={styles.groups}>
            {groups.map((g) => (
              <section key={g.key} className={styles.group} aria-labelledby={`month-${g.key}`}>
                <h2 id={`month-${g.key}`} className={styles.groupHeading}>
                  <span>{g.label}</span>
                  <span className={styles.groupCount}>{pluralize(g.items.length, 'record')}</span>
                </h2>
                <ul role="list" className={styles.list}>
                  {g.items.map((r) => (
                    <li key={r.id} className={styles.item} data-record-id={r.id} data-new={highlightId === r.id || undefined}>
                      <button
                        type="button"
                        className={styles.row}
                        onClick={() => setSelectedId(r.id)}
                        aria-haspopup="dialog"
                      >
                        <span className={styles.when} aria-hidden="true">
                          <span className={styles.whenDay}>{formatDayMonth(r.date)}</span>
                          <span className={styles.whenWeek}>{weekdayShort(r.date)}</span>
                        </span>
                        <span className={styles.iconCol}>
                          <RecordTypeIcon type={r.type} size={40} />
                        </span>
                        <span className={styles.main}>
                          <span className={styles.title}>{r.title}</span>
                          <span className={styles.meta}>
                            <span className="visually-hidden">{RECORD_TYPE_META[r.type].label}, {r.date === toISODate(now) ? 'today' : formatDayMonth(r.date)}. </span>
                            {[r.doctor, r.facility].filter(Boolean).join(' · ') || 'No clinician recorded'}
                          </span>
                          {r.summary && <span className={styles.summary}>{r.summary}</span>}
                        </span>
                        <span className={styles.side}>
                          <span className={styles.sideDate} aria-hidden="true">
                            {formatDayMonth(r.date)}
                          </span>
                          <RecordTypeBadge type={r.type} />
                          {r.attachments.length > 0 && (
                            <span className={styles.files}>
                              <Paperclip size={13} aria-hidden="true" />
                              {r.attachments.length}
                              <span className="visually-hidden"> attachments</span>
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <RecordDetail
        record={selected}
        onClose={() => setSelectedId(null)}
        onEdit={(id) => {
          setSelectedId(null);
          setEditingId(id);
        }}
        onDelete={handleDelete}
        deleteText={selected ? deleteText(selected.id) : ''}
      />

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a record"
        description={`Saved to ${firstName(profile.name)}'s records in this browser.`}
        size="lg"
      >
        <AddRecordForm today={toISODate(now)} onSubmit={handleAdd} onCancel={() => setAdding(false)} />
      </Dialog>

      <Dialog open={editing !== null} onClose={() => setEditingId(null)} title="Edit record" size="lg">
        {editing && (
          <AddRecordForm
            key={editing.id}
            initial={editing}
            today={toISODate(now)}
            onSubmit={(input) => {
              updateRecord(editing.id, input);
              setEditingId(null);
              setHighlightId(editing.id);
              notify('Record saved');
            }}
            onCancel={() => setEditingId(null)}
            onDelete={() => handleDelete(editing.id)}
            deleteText={deleteText(editing.id)}
          />
        )}
      </Dialog>
    </>
  );
}
