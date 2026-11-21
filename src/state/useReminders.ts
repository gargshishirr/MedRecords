import { useEffect } from 'react';
import { dueReminders, readSent, writeSent } from '../lib/reminders';
import { safeStorage } from '../lib/store';
import { showNotification } from '../lib/pwa';
import { useStore, useVault } from './store';
import { useToast } from './toast';

/** Shows due reminders while the app is open: a notification, plus a toast when the page is in view. */
export function useReminders() {
  const { data, now } = useStore();
  const { lockEnabled } = useVault();
  const { notify } = useToast();
  const enabled = data.settings.reminders.enabled;

  useEffect(() => {
    if (!enabled) return;
    const storage = safeStorage();
    const sent = readSent(storage);
    const due = dueReminders(data, now, sent, lockEnabled);
    if (!due.length) return;
    for (const r of due) {
      sent.add(r.key);
      void showNotification(r.title, r.body, r.key);
      if (document.visibilityState === 'visible') notify(`${r.title}: ${r.body}`, 'info');
    }
    writeSent(storage, sent);
  }, [enabled, data, now, lockEnabled, notify]);
}
