import { useId, useRef, useState } from 'react';
import {
  CircleAlert,
  Database,
  Download,
  ExternalLink,
  Info,
  Monitor,
  Moon,
  Palette,
  Pencil,
  RotateCcw,
  Sparkles,
  Sun,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppData } from '../../lib/types';
import type { Envelope } from '../../lib/crypto';
import type { ThemePreference } from '../../state/theme';
import { useTheme } from '../../state/theme';
import { useStore, useVault } from '../../state/store';
import { useToast } from '../../state/toast';
import { readBackup, readFileText } from '../../lib/backup';
import { ageInYears, formatDate, toISODate } from '../../lib/date';
import { pluralize } from '../../lib/format';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Avatar } from '../../components/ui/Avatar';
import { EmptyState } from '../../components/ui/EmptyState';
import { useProfileEditor } from '../../components/family/ProfileEditor';
import { LockCard } from './LockCard';
import { BackupPasscodeForm, ExportForm } from './BackupForms';
import styles from './Settings.module.css';

const THEMES: { value: ThemePreference; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', hint: 'Warm and bright', icon: Sun },
  { value: 'dark', label: 'Dark', hint: 'Easy on the eyes', icon: Moon },
  { value: 'system', label: 'System', hint: 'Match your device', icon: Monitor },
];

type Confirm = 'fresh' | 'demo' | null;

function FamilyCard() {
  const { data, now } = useStore();
  const { openNew, openEdit } = useProfileEditor();

  return (
    <Card
      title="Family members"
      description="Add, edit or remove the people you keep records for."
      icon={<Users />}
      action={
        <Button size="sm" icon={<UserPlus />} onClick={openNew}>
          Add
        </Button>
      }
    >
      {data.profiles.length === 0 ? (
        <EmptyState
          icon={<UserPlus />}
          title="No family members yet"
          compact
          action={
            <Button variant="primary" icon={<UserPlus />} onClick={openNew}>
              Add a family member
            </Button>
          }
        >
          Start with yourself.
        </EmptyState>
      ) : (
        <ul role="list" className={styles.people}>
          {data.profiles.map((p) => (
            <li key={p.id} className={styles.person}>
              <Avatar profile={p} size={36} />
              <span className={styles.personText}>
                <span className={styles.personName}>{p.name}</span>
                <span className={styles.personMeta}>
                  {[p.relation, `${ageInYears(p.dob, now)} yrs`, p.bloodGroup === 'Unknown' ? '' : p.bloodGroup]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => openEdit(p.id)} aria-label={`Edit ${p.name}`}>
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SettingsPage() {
  const { preference, setPreference } = useTheme();
  const { data, replaceData, startFresh, loadDemo } = useStore();
  const { lockEnabled } = useVault();
  const { notify } = useToast();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [exporting, setExporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [encryptedBackup, setEncryptedBackup] = useState<Envelope | null>(null);
  const [pendingImport, setPendingImport] = useState<AppData | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importId = useId();
  useDocumentTitle('Settings');

  const sizeKb = Math.round(new Blob([JSON.stringify(data)]).size / 1024);

  const failImport = (error: string) => {
    setImportError(error);
    notify('Import failed — your data was not changed', 'error');
  };

  const importFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    const read = await readFileText(file);
    if (!read.ok) return failImport(read.error);
    const backup = readBackup(read.text);
    if (backup.kind === 'error') return failImport(backup.error);
    setImportError(null);
    if (backup.kind === 'encrypted') setEncryptedBackup(backup.envelope);
    else setPendingImport(backup.data);
  };

  const applyImport = () => {
    if (!pendingImport) return;
    replaceData(pendingImport);
    notify(
      `Imported ${pluralize(pendingImport.records.length, 'record')} for ${pluralize(pendingImport.profiles.length, 'person', 'people')}`,
    );
    setPendingImport(null);
  };

  return (
    <>
      <PageHeader title="Settings" description="Your family, the lock, backups and how MedRecords looks." />

      <div className={styles.stack}>
        <FamilyCard />

        <LockCard onExport={() => setExporting(true)} />

        <Card
          title="Your data"
          description={`Everything lives only in this browser${lockEnabled ? ', encrypted' : ''}. Nothing is uploaded.`}
          icon={<Database />}
        >
          <dl className={styles.stats}>
            <div>
              <dt>People</dt>
              <dd className="num">{data.profiles.length}</dd>
            </div>
            <div>
              <dt>Records</dt>
              <dd className="num">{data.records.length}</dd>
            </div>
            <div>
              <dt>Lab results</dt>
              <dd className="num">{data.labs.length}</dd>
            </div>
            <div>
              <dt>Medications</dt>
              <dd className="num">{data.medications.length}</dd>
            </div>
            <div>
              <dt>Data size</dt>
              <dd className="num">{sizeKb} KB</dd>
            </div>
          </dl>

          <div className={styles.actions}>
            <div className={styles.action}>
              <div>
                <h3 className={styles.actionTitle}>Export a backup</h3>
                <p className={styles.actionText}>
                  Download everything as one file. Encrypt it with a passcode, or save plain JSON.
                </p>
              </div>
              <Button icon={<Download />} onClick={() => setExporting(true)}>
                Export
              </Button>
            </div>

            <div className={styles.action}>
              <div>
                <h3 className={styles.actionTitle}>Import a backup</h3>
                <p className={styles.actionText} id={`${importId}-hint`}>
                  Replace everything here with a MedRecords backup (plain or encrypted, up to 5 MB). It is checked first.
                </p>
                {importError && (
                  <p className={styles.error} role="alert" id={`${importId}-error`}>
                    <CircleAlert size={15} aria-hidden="true" /> {importError}
                  </p>
                )}
              </div>
              <input
                ref={fileRef}
                id={importId}
                type="file"
                accept="application/json,.json"
                className="visually-hidden"
                tabIndex={-1}
                aria-describedby={importError ? `${importId}-error` : `${importId}-hint`}
                onChange={(e) => void importFile(e.target.files?.[0])}
              />
              <Button icon={<Upload />} onClick={() => fileRef.current?.click()}>
                Import
              </Button>
            </div>

            <div className={styles.action}>
              <div>
                <h3 className={styles.actionTitle}>
                  {data.demo ? 'Clear demo data and start fresh' : 'Delete all data and start fresh'}
                </h3>
                <p className={styles.actionText}>
                  {data.demo
                    ? 'Remove the demo family and start with an empty record book for your own family.'
                    : 'Remove every person and record in this browser. Export a backup first if you might need them.'}
                </p>
              </div>
              <Button variant="danger" icon={<RotateCcw />} onClick={() => setConfirm('fresh')}>
                Start fresh
              </Button>
            </div>

            <div className={styles.action}>
              <div>
                <h3 className={styles.actionTitle}>{data.demo ? 'Reset demo data' : 'Try the demo'}</h3>
                <p className={styles.actionText}>
                  {data.demo
                    ? `Restore the original fictional family. Created ${formatDate(toISODate(new Date(data.seededAt)))}.`
                    : 'Replace everything here with a fictional demo family to look around.'}
                </p>
              </div>
              <Button icon={<Sparkles />} onClick={() => setConfirm('demo')}>
                {data.demo ? 'Reset' : 'Load demo'}
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Appearance" description="Choose how MedRecords looks on this device." icon={<Palette />}>
          <fieldset className={styles.themes}>
            <legend className="visually-hidden">Theme</legend>
            {THEMES.map((t) => {
              const Icon = t.icon;
              return (
                <label key={t.value} className={styles.themeOption} data-theme-preview={t.value}>
                  <input
                    type="radio"
                    name="theme"
                    value={t.value}
                    checked={preference === t.value}
                    onChange={() => setPreference(t.value)}
                    className={styles.themeInput}
                  />
                  <span className={styles.preview} aria-hidden="true">
                    <span className={styles.previewSidebar} />
                    <span className={styles.previewMain}>
                      <span className={styles.previewLine} />
                      <span className={styles.previewCard} />
                      <span className={styles.previewCard} />
                    </span>
                  </span>
                  <span className={styles.themeLabel}>
                    <Icon size={16} aria-hidden="true" />
                    {t.label}
                  </span>
                  <span className={styles.themeHint}>{t.hint}</span>
                </label>
              );
            })}
          </fieldset>
        </Card>

        <Card title="About & privacy" icon={<Info />}>
          <div className={styles.about}>
            <p>
              MedRecords is a calm, private place to keep a family&apos;s health records. It is a personal project by Shishir
              Garg.
              {data.demo && (
                <>
                  {' '}
                  Every person, clinician and facility in the demo is <strong>fictional</strong>.
                </>
              )}
            </p>
            <p>
              Data is stored only in this browser. There is no server, no account, no analytics and no tracking. Clearing this
              site&apos;s data in the browser deletes it, so export backups regularly.
            </p>
            <p>This is not a medical device and does not give medical advice.</p>
            <a className={styles.link} href="https://github.com/gargshishirr/MedRecords" target="_blank" rel="noreferrer">
              View source on GitHub <ExternalLink size={14} aria-hidden="true" />
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </div>
        </Card>
      </div>

      <Dialog
        open={exporting}
        onClose={() => setExporting(false)}
        title="Export a backup"
        description="One file with every person and record."
      >
        <ExportForm onDone={() => setExporting(false)} />
      </Dialog>

      <Dialog
        open={encryptedBackup !== null}
        onClose={() => setEncryptedBackup(null)}
        size="sm"
        title="Open encrypted backup"
        description="Enter the passcode that was used when this backup was made."
      >
        {encryptedBackup && (
          <BackupPasscodeForm
            envelope={encryptedBackup}
            onCancel={() => setEncryptedBackup(null)}
            onOpened={(opened) => {
              setEncryptedBackup(null);
              setPendingImport(opened);
            }}
          />
        )}
      </Dialog>

      <Dialog
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        size="sm"
        title="Replace your data?"
        description="Everything in this browser now will be replaced by the backup."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingImport(null)}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Upload />} onClick={applyImport}>
              Replace data
            </Button>
          </>
        }
      >
        {pendingImport && (
          <p className={styles.confirmText}>
            The backup has {pluralize(pendingImport.profiles.length, 'person', 'people')} and{' '}
            {pluralize(pendingImport.records.length, 'record')}
            {pendingImport.demo ? ' (demo data)' : ''}.{lockEnabled && ' It will stay encrypted with your current passcode.'}
          </p>
        )}
      </Dialog>

      <Dialog
        open={confirm === 'fresh'}
        onClose={() => setConfirm(null)}
        size="sm"
        title={data.demo ? 'Clear the demo data?' : 'Delete all data?'}
        description={
          data.demo
            ? 'The demo family goes away and you start with an empty record book.'
            : 'Every person, record, lab result, medication and appointment in this browser is deleted.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<RotateCcw />}
              onClick={() => {
                startFresh();
                setConfirm(null);
                notify(data.demo ? 'Demo data cleared. Add your first family member.' : 'All data deleted');
              }}
            >
              Start fresh
            </Button>
          </>
        }
      >
        <p className={styles.confirmText}>
          {data.demo ? 'Your theme and lock settings are kept.' : 'This cannot be undone. Your theme and lock settings are kept.'}
        </p>
      </Dialog>

      <Dialog
        open={confirm === 'demo'}
        onClose={() => setConfirm(null)}
        size="sm"
        title={data.demo ? 'Reset the demo data?' : 'Load the demo family?'}
        description={
          data.demo
            ? 'Changes you made to the demo are replaced with a fresh copy.'
            : 'Everything in this browser is replaced by the fictional demo family.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={data.demo ? 'primary' : 'danger'}
              icon={<Sparkles />}
              onClick={() => {
                loadDemo();
                setConfirm(null);
                notify('Demo data loaded');
              }}
            >
              {data.demo ? 'Reset demo' : 'Replace with demo'}
            </Button>
          </>
        }
      >
        <p className={styles.confirmText}>
          {data.demo ? 'Your theme setting is kept.' : 'Export a backup first if you want to keep your own data.'}
        </p>
      </Dialog>
    </>
  );
}
