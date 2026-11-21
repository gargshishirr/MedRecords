import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  FileHeart,
  Syringe,
  ArrowRight,
  CornerDownLeft,
  FlaskConical,
  LockKeyhole,
  Moon,
  Pill,
  Plus,
  Search,
  Sun,
  UserPlus,
  UserRound,
} from 'lucide-react';
import { useStore, useVault } from '../state/store';
import { useTheme } from '../state/theme';
import { useToast } from '../state/toast';
import { LAB_TESTS, labStatus, personContext } from '../lib/ranges';
import { formatDate } from '../lib/date';
import { firstName } from '../lib/format';
import type { NavIntent } from '../lib/hooks';
import { RECORD_TYPE_META } from '../lib/recordMeta';
import { latestLabs, medicationsFor, recordsFor } from '../lib/selectors';
import { RECORD_ICONS, typeColorStyle } from './RecordTypeIcon';
import { NAV_ITEMS, SETTINGS_ITEM } from './shell/nav';
import { useInstall } from '../lib/pwa';
import { hasSchedule } from '../lib/vaccines';
import { Avatar } from './ui/Avatar';
import { useProfileEditor } from './family/ProfileEditor';
import styles from './CommandPalette.module.css';

interface Command {
  id: string;
  group: 'Go to' | 'Actions' | 'Records' | 'Lab results' | 'Medications' | 'Profiles';
  label: string;
  hint?: string;
  keywords?: string;
  icon: ReactNode;
  run: () => void;
}

const GROUP_ORDER: Command['group'][] = ['Actions', 'Go to', 'Lab results', 'Medications', 'Records', 'Profiles'];

function matches(cmd: Command, tokens: string[]): boolean {
  const hay = `${cmd.label} ${cmd.hint ?? ''} ${cmd.keywords ?? ''} ${cmd.group}`.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const navigate = useNavigate();
  const { data, profile, now, setActiveProfile } = useStore();
  const { lockEnabled, lockNow } = useVault();
  const { openNew: addPerson } = useProfileEditor();
  const { resolved, toggle } = useTheme();
  const { canPrompt: canInstall, install } = useInstall();
  const { notify } = useToast();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      inputRef.current?.focus();
    } else {
      if (dialog.open) dialog.close();
      // Start fresh next time it opens.
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handle = () => onCloseRef.current();
    dialog.addEventListener('close', handle);
    return () => dialog.removeEventListener('close', handle);
  }, []);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string, intent?: NavIntent) => () => navigate(to, intent ? { state: intent } : undefined);
    const list: Command[] = [];
    if (profile) {
      list.push(
        {
          id: 'action-add',
          group: 'Actions',
          label: 'Add a record',
          keywords: 'new create visit report',
          icon: <Plus />,
          run: go('/records', { add: true }),
        },
        {
          id: 'action-add-med',
          group: 'Actions',
          label: 'Add a medication',
          keywords: 'new medicine prescription pill',
          icon: <Pill />,
          run: go('/medications', { add: true }),
        },
        {
          id: 'action-add-lab',
          group: 'Actions',
          label: 'Add a lab result',
          keywords: 'new test blood report',
          icon: <FlaskConical />,
          run: go('/labs', { add: true }),
        },
      );
    }
    list.push({
      id: 'action-person',
      group: 'Actions',
      label: 'Add a family member',
      keywords: 'new person profile',
      icon: <UserPlus />,
      run: addPerson,
    });
    if (lockEnabled) {
      list.push({
        id: 'action-lock',
        group: 'Actions',
        label: 'Lock now',
        keywords: 'lock passcode secure hide',
        icon: <LockKeyhole />,
        run: lockNow,
      });
    }
    list.push(
      {
        id: 'action-theme',
        group: 'Actions',
        label: `Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`,
        keywords: 'dark mode light mode appearance theme',
        icon: resolved === 'dark' ? <Sun /> : <Moon />,
        run: toggle,
      },
      ...[...NAV_ITEMS, SETTINGS_ITEM].map<Command>((item) => {
        const Icon = item.icon;
        return {
          id: `nav-${item.to}`,
          group: 'Go to',
          label: item.label,
          keywords: 'navigate page open',
          icon: <Icon />,
          run: go(item.to),
        };
      }),
    );
    if (canInstall) {
      list.push({
        id: 'action-install',
        group: 'Actions',
        label: 'Install MedRecords as an app',
        keywords: 'install app offline home screen pwa',
        icon: <Download />,
        run: () => void install(),
      });
    }
    if (!profile) return list;

    list.push({
      id: 'nav-summary',
      group: 'Go to',
      label: 'Doctor summary',
      keywords: 'print pdf share doctor report one page',
      icon: <FileHeart />,
      run: go('/summary'),
    });
    if (hasSchedule(profile, now)) {
      list.push({
        id: 'nav-vaccines',
        group: 'Go to',
        label: 'Vaccine schedule',
        keywords: 'vaccination immunisation immunization shots child',
        icon: <Syringe />,
        run: go('/vaccines'),
      });
    }

    const person = personContext(profile, now);
    for (const r of recordsFor(data, profile.id)) {
      const Icon = RECORD_ICONS[r.type];
      list.push({
        id: `rec-${r.id}`,
        group: 'Records',
        label: r.title,
        hint: `${RECORD_TYPE_META[r.type].label} · ${formatDate(r.date)}`,
        keywords: `${r.doctor ?? ''} ${r.facility ?? ''} ${r.summary ?? ''}`,
        icon: (
          <span className={styles.typeIcon} style={typeColorStyle(r.type)}>
            <Icon />
          </span>
        ),
        run: go('/records', { open: r.id }),
      });
    }

    for (const { latest } of latestLabs(data.labs.filter((l) => l.profileId === profile.id))) {
      const test = LAB_TESTS[latest.testId];
      const status = labStatus(latest.testId, latest.value, person);
      list.push({
        id: `lab-${test.id}`,
        group: 'Lab results',
        label: test.name,
        hint: `Latest ${latest.value.toFixed(test.decimals)} ${test.unit}${status === 'normal' ? '' : ` · ${status}`}`,
        keywords: `${test.short} lab trend chart`,
        icon: <FlaskConical />,
        run: go('/labs', { test: test.id }),
      });
    }

    const meds = medicationsFor(data, profile.id, now);
    for (const m of [...meds.active, ...meds.past]) {
      const isActive = meds.active.includes(m);
      list.push({
        id: `med-${m.id}`,
        group: 'Medications',
        label: [m.name, m.strength].filter(Boolean).join(' '),
        hint: [isActive ? 'Active' : 'Past', m.purpose].filter(Boolean).join(' · '),
        keywords: `${m.frequency} ${m.prescriber}`,
        icon: <Pill />,
        run: go('/medications', { med: m.id }),
      });
    }

    for (const p of data.profiles.filter((p) => p.id !== profile.id)) {
      list.push({
        id: `profile-${p.id}`,
        group: 'Profiles',
        label: `Switch to ${p.name}`,
        hint: p.relation,
        keywords: 'profile family member person',
        icon: <Avatar profile={p} size={22} />,
        run: () => {
          setActiveProfile(p.id);
          notify(`Now viewing ${p.name}`, 'info');
        },
      });
    }
    return list;
  }, [data, profile, now, resolved, toggle, navigate, setActiveProfile, notify, lockEnabled, lockNow, addPerson, canInstall, install]);

  const results = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      // Default view: actions, navigation, recent records, and profiles.
      const recent = commands.filter((c) => c.group === 'Records').slice(0, 4);
      return [
        ...commands.filter((c) => c.group === 'Actions' || c.group === 'Go to' || c.group === 'Profiles'),
        ...recent,
      ].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
    }
    const perGroup = new Map<string, number>();
    return commands
      .filter((c) => matches(c, tokens))
      .filter((c) => {
        const n = perGroup.get(c.group) ?? 0;
        perGroup.set(c.group, n + 1);
        return n < 6;
      })
      .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  }, [commands, query]);

  const clampedActive = Math.min(activeIndex, Math.max(0, results.length - 1));
  const optionId = (i: number) => `${listId}-opt-${i}`;

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${clampedActive}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [clampedActive]);

  const runCommand = (cmd: Command | undefined) => {
    if (!cmd) return;
    onCloseRef.current();
    cmd.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((clampedActive + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((clampedActive - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Home' && results.length) {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End' && results.length) {
      e.preventDefault();
      setActiveIndex(results.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runCommand(results[clampedActive]);
    }
  };

  let lastGroup = '';

  return (
    <dialog
      ref={dialogRef}
      className={styles.palette}
      aria-label="Command palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      {open && (
        <div className={styles.inner}>
          <div className={styles.inputRow}>
            <Search size={18} aria-hidden="true" className={styles.searchIcon} />
            <input
              ref={inputRef}
              className={styles.input}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={results.length ? optionId(clampedActive) : undefined}
              aria-label="Search records, labs, medications and pages"
              placeholder={
                profile ? `Search ${firstName(profile.name)}'s records, labs, medications…` : 'Search pages and actions…'
              }
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className={styles.esc}>Esc</kbd>
          </div>

          <ul ref={listRef} id={listId} role="listbox" aria-label="Results" className={styles.list}>
            {results.map((cmd, i) => {
              const header = cmd.group !== lastGroup ? cmd.group : null;
              lastGroup = cmd.group;
              return (
                <li key={cmd.id} role="presentation">
                  {header && (
                    <div className={styles.group} role="presentation">
                      {header}
                    </div>
                  )}
                  <div
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === clampedActive}
                    data-index={i}
                    className={styles.option}
                    onMouseMove={() => i !== clampedActive && setActiveIndex(i)}
                    onClick={() => runCommand(cmd)}
                  >
                    <span className={styles.icon} aria-hidden="true">
                      {cmd.icon}
                    </span>
                    <span className={styles.text}>
                      <span className={styles.label}>{cmd.label}</span>
                      {cmd.hint && <span className={styles.hint}>{cmd.hint}</span>}
                    </span>
                    <span className={styles.enter} aria-hidden="true">
                      {cmd.group === 'Go to' ? <ArrowRight size={15} /> : <CornerDownLeft size={15} />}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {results.length === 0 && (
            <div className={styles.empty} role="status">
              <UserRound size={18} aria-hidden="true" />
              No matches for “{query}”. Try a test name, doctor, or medicine.
            </div>
          )}

          <footer className={styles.footer} aria-hidden="true">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> to navigate
            </span>
            <span>
              <kbd>↵</kbd> to open
            </span>
            <span>
              <kbd>Esc</kbd> to close
            </span>
          </footer>
        </div>
      )}
    </dialog>
  );
}
