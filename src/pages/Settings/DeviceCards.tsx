import { useId, useState } from 'react';
import { BellRing, CircleAlert, Download, Monitor, Moon, Smartphone, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ThemePreference } from '../../state/theme';
import { DOSE_SLOTS } from '../../lib/types';
import { SLOT_LABEL } from '../../lib/meds';
import { isClockTime } from '../../lib/validate';
import { useInstall } from '../../lib/pwa';
import { useTheme } from '../../state/theme';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toast';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { inputClass } from '../../components/ui/Field';
import styles from './Settings.module.css';

const THEMES: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function RemindersCard() {
  const { data, setReminders } = useStore();
  const { notify } = useToast();
  const reminders = data.settings.reminders;
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  const toggle = async () => {
    if (reminders.enabled) {
      setReminders({ ...reminders, enabled: false });
      return;
    }
    if (typeof Notification === 'undefined') {
      setError("This browser can't show notifications. Use Add to calendar on a medicine or appointment instead.");
      return;
    }
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission !== 'granted') {
      setError("Notifications are blocked for MedRecords. Allow them in your browser's site settings, then try again.");
      return;
    }
    setError(null);
    setReminders({ ...reminders, enabled: true });
    notify('Reminders are on');
  };

  return (
    <Card title="Reminders" description="Dose times, appointments and refills." icon={<BellRing />}>
      <div className={styles.actions}>
        <div className={styles.action}>
          <div>
            <h3 className={styles.actionTitle} id={`${uid}-title`}>
              Notify me while MedRecords is open
            </h3>
            <p className={styles.actionText} id={`${uid}-text`}>
              For reminders that arrive even when it&apos;s closed, use <strong>Add to calendar</strong> on a medicine or
              appointment.
            </p>
            {error && (
              <p className={styles.error} role="alert">
                <CircleAlert size={15} aria-hidden="true" /> {error}
              </p>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={reminders.enabled}
            aria-labelledby={`${uid}-title`}
            aria-describedby={`${uid}-text`}
            className={styles.switch}
            onClick={() => void toggle()}
          >
            <span className={styles.switchThumb} aria-hidden="true" />
          </button>
        </div>

        <fieldset className={styles.times}>
          <legend className={styles.actionTitle}>Dose times</legend>
          {DOSE_SLOTS.map((slot) => (
            <label key={slot} className={styles.time}>
              <span className={styles.timeLabel}>{SLOT_LABEL[slot]}</span>
              <input
                type="time"
                required
                className={inputClass}
                value={reminders.times[slot]}
                onChange={(e) => {
                  if (isClockTime(e.target.value)) setReminders({ ...reminders, times: { ...reminders.times, [slot]: e.target.value } });
                }}
              />
            </label>
          ))}
        </fieldset>
      </div>
    </Card>
  );
}

export function DeviceCard() {
  const { preference, setPreference } = useTheme();
  const install = useInstall();
  const { notify } = useToast();
  const uid = useId();

  return (
    <Card title="This device" description="How MedRecords looks and opens here." icon={<Smartphone />}>
      <div className={styles.actions}>
        <div className={styles.action}>
          <h3 className={styles.actionTitle} id={`${uid}-theme`}>
            Theme
          </h3>
          <div role="radiogroup" aria-labelledby={`${uid}-theme`} className={styles.segmented}>
            {THEMES.map((t) => {
              const Icon = t.icon;
              return (
                <label key={t.value} className={styles.segment}>
                  <input
                    type="radio"
                    name={`${uid}-theme`}
                    value={t.value}
                    checked={preference === t.value}
                    onChange={() => setPreference(t.value)}
                    className={styles.segmentInput}
                  />
                  <Icon size={15} aria-hidden="true" />
                  {t.label}
                </label>
              );
            })}
          </div>
        </div>

        {!install.installed && (
          <div className={styles.action}>
            <div>
              <h3 className={styles.actionTitle}>Install as an app</h3>
              <p className={styles.actionText}>
                {install.canPrompt
                  ? 'Opens from your home screen or dock and works offline.'
                  : install.ios
                    ? 'In Safari, tap Share, then “Add to Home Screen”. It then opens like an app and works offline.'
                    : 'Use your browser’s menu: “Install app” or “Add to Home screen”. It then works offline.'}
              </p>
            </div>
            {install.canPrompt && (
              <Button
                icon={<Download />}
                onClick={() =>
                  void install.install().then((ok) => {
                    if (ok) notify('MedRecords is installed');
                  })
                }
              >
                Install
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
