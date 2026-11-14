import { useId, useRef, useState } from 'react';
import { CircleAlert, Database, Download, ExternalLink, Lock, Monitor, Moon, Palette, RotateCcw, Sun, Upload } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ThemePreference } from '../../state/theme';
import { useTheme } from '../../state/theme';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toast';
import { STORAGE_KEY, parseImport, serialize } from '../../lib/store';
import { formatDate, toISODate } from '../../lib/date';
import { pluralize } from '../../lib/format';
import { PageHeader, useDocumentTitle } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import styles from './Settings.module.css';

const THEMES: { value: ThemePreference; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', hint: 'Warm and bright', icon: Sun },
  { value: 'dark', label: 'Dark', hint: 'Easy on the eyes', icon: Moon },
  { value: 'system', label: 'System', hint: 'Match your device', icon: Monitor },
];

export function SettingsPage() {
  const { preference, setPreference } = useTheme();
  const { data, now, reset, replaceData } = useStore();
  const { notify } = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importId = useId();
  useDocumentTitle('Settings');

  const sizeKb = Math.round(new Blob([JSON.stringify(data)]).size / 1024);

  const exportJson = () => {
    const blob = new Blob([serialize(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medrecords-export-${toISODate(now)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    notify('Export downloaded');
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const result = parseImport(text);
    if (fileRef.current) fileRef.current.value = '';
    if (!result.ok) {
      setImportError(result.error);
      notify('Import failed — your data was not changed', 'error');
      return;
    }
    setImportError(null);
    replaceData(result.data);
    notify(`Imported ${pluralize(result.data.records.length, 'record')} across ${pluralize(result.data.profiles.length, 'profile')}`);
  };

  return (
    <>
      <PageHeader title="Settings" description="Appearance and the data stored in this browser." />

      <div className={styles.stack}>
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

        <Card title="Your data" description="Everything lives in this browser's localStorage. Nothing is uploaded." icon={<Database />}>
          <dl className={styles.stats}>
            <div>
              <dt>Profiles</dt>
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
              <dt>Vital readings</dt>
              <dd className="num">{data.vitals.length}</dd>
            </div>
            <div>
              <dt>Stored size</dt>
              <dd className="num">{sizeKb} KB</dd>
            </div>
          </dl>

          <div className={styles.actions}>
            <div className={styles.action}>
              <div>
                <h3 className={styles.actionTitle}>Export JSON</h3>
                <p className={styles.actionText}>Download a full backup you can re-import later.</p>
              </div>
              <Button icon={<Download />} onClick={exportJson}>
                Export
              </Button>
            </div>

            <div className={styles.action}>
              <div>
                <h3 className={styles.actionTitle}>Import JSON</h3>
                <p className={styles.actionText} id={`${importId}-hint`}>
                  Replace current data with a MedRecords export. The file is validated first.
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
                aria-describedby={importError ? `${importId}-error` : `${importId}-hint`}
                onChange={(e) => void importJson(e.target.files?.[0])}
              />
              <Button icon={<Upload />} onClick={() => fileRef.current?.click()}>
                Import
              </Button>
            </div>

            <div className={styles.action}>
              <div>
                <h3 className={styles.actionTitle}>Reset demo data</h3>
                <p className={styles.actionText}>
                  Restore the original fictional family. Seeded {formatDate(toISODate(new Date(data.seededAt)))}.
                </p>
              </div>
              <Button variant="danger" icon={<RotateCcw />} onClick={() => setConfirmReset(true)}>
                Reset
              </Button>
            </div>
          </div>
        </Card>

        <Card title="About & privacy" icon={<Lock />}>
          <div className={styles.about}>
            <p>
              MedRecords is a portfolio project by Shishir Garg: a calm, privacy-first place to keep a family's health records.
              Every person, clinician and facility in the demo is <strong>fictional</strong>.
            </p>
            <p>
              Data is stored only in this browser under <code>{STORAGE_KEY}</code>. There is no backend, no analytics and no
              account. This is not a medical device and does not provide medical advice.
            </p>
            <a className={styles.link} href="https://github.com/gargshishirr/MedRecords" target="_blank" rel="noreferrer">
              View source on GitHub <ExternalLink size={14} aria-hidden="true" />
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </div>
        </Card>
      </div>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        size="sm"
        title="Reset demo data?"
        description="This replaces everything stored in this browser — including records you added — with a fresh copy of the demo dataset."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<RotateCcw />}
              onClick={() => {
                reset();
                setConfirmReset(false);
                notify('Demo data restored');
              }}
            >
              Reset data
            </Button>
          </>
        }
      >
        <p className={styles.confirmText}>Your theme preference will be kept.</p>
      </Dialog>
    </>
  );
}
