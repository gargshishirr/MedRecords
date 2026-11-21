import { useEffect, useId, useRef, useState } from 'react';
import {
  CircleAlert,
  Database,
  Download,
  ExternalLink,
  Pencil,
  RotateCcw,
  Sparkles,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import type { AppData } from '../../lib/types';
import type { Envelope } from '../../lib/crypto';
import { useStore, useVault } from '../../state/store';
import { useToast } from '../../state/toast';
import { readBackup, readFileText } from '../../lib/backup';
import type { BackupFile } from '../../lib/files';
import { fileStore, relinkAttachments, restoreBackupFiles } from '../../lib/files';
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
import { DeviceCard, RemindersCard } from './DeviceCards';
import styles from './Settings.module.css';

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
  const { data, replaceData, startFresh, loadDemo } = useStore();
  const { lockEnabled } = useVault();
  const { notify } = useToast();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [exporting, setExporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [encryptedBackup, setEncryptedBackup] = useState<Envelope | null>(null);
  const [pendingImport, setPendingImport] = useState<{ data: AppData; files: BackupFile[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importId = useId();
  const mounted = useRef(true);
  const importCancelled = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useDocumentTitle('Settings');

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
    else setPendingImport({ data: backup.data, files: backup.files });
  };

  const cancelImport = () => {
    importCancelled.current = true;
    setImporting(false);
    setPendingImport(null);
  };

  const applyImport = async () => {
    if (!pendingImport || importing) return;
    importCancelled.current = false;
    const { data: imported, files } = pendingImport;
    let ids = new Map<string, string>();
    let next = imported;
    if (files.length) {
      setImporting(true);
      try {
        const restored = await restoreBackupFiles(fileStore(), files);
        ids = restored.ids;
        next = { ...imported, fileKey: restored.fileKey };
      } catch {
        if (mounted.current && !importCancelled.current) {
          setImporting(false);
          notify("The backup's files couldn't be saved. This browser's storage may be full. Nothing was changed.", 'error');
        }
        return;
      }
      // Cancelled, or the app locked, while files were being saved: leave the current data alone.
      if (!mounted.current || importCancelled.current) {
        void fileStore()
          .remove(ids.values())
          .catch(() => undefined);
        return;
      }
      setImporting(false);
    }
    replaceData(relinkAttachments(next, ids));
    notify(`Imported ${pluralize(imported.records.length, 'record')} for ${pluralize(imported.profiles.length, 'person', 'people')}`);
    setPendingImport(null);
  };

  return (
    <>
      <PageHeader title="Settings" description="Family, reminders, privacy and backups." />

      <div className={styles.stack}>
        <FamilyCard />

        <RemindersCard />

        <LockCard onExport={() => setExporting(true)} />

        <Card
          title="Backups"
          description={`Everything lives only in this browser${lockEnabled ? ', encrypted' : ''}. Back it up now and then.`}
          icon={<Database />}
        >
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
                  Replace everything here with a MedRecords backup (plain or encrypted). It is checked first.
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

        <DeviceCard />
      </div>

      <p className={styles.about}>
        No server, no account, no tracking: MedRecords keeps everything in this browser. It is not a medical device.{' '}
        <a className={styles.link} href="https://github.com/gargshishirr/MedRecords" target="_blank" rel="noreferrer">
          Source on GitHub <ExternalLink size={13} aria-hidden="true" />
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      </p>

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
            onOpened={(opened, files) => {
              setEncryptedBackup(null);
              setPendingImport({ data: opened, files });
            }}
          />
        )}
      </Dialog>

      <Dialog
        open={pendingImport !== null}
        onClose={cancelImport}
        size="sm"
        title="Replace your data?"
        description="Everything in this browser now will be replaced by the backup."
        footer={
          <>
            <Button variant="ghost" onClick={cancelImport}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Upload />} onClick={() => void applyImport()} disabled={importing} aria-busy={importing || undefined}>
              {importing ? 'Importing…' : 'Replace data'}
            </Button>
          </>
        }
      >
        {pendingImport && (
          <p className={styles.confirmText}>
            The backup has {pluralize(pendingImport.data.profiles.length, 'person', 'people')} and{' '}
            {pluralize(pendingImport.data.records.length, 'record')}
            {pendingImport.files.length ? `, with ${pluralize(pendingImport.files.length, 'file')}` : ''}
            {pendingImport.data.demo ? ' (demo data)' : ''}.{lockEnabled && ' It will stay encrypted with your current passcode.'}
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
