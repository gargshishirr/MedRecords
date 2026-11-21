/** Service worker registration and the "Install app" prompt. */
import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version += 1;
  listeners.forEach((l) => l());
};

/** Call once at start-up, before the browser fires `beforeinstallprompt`. */
export function setUpPwa(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep the prompt for the "Install app" button instead of the browser's own banner.
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    });
  }
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const isIOS = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

export interface InstallState {
  /** Already running as an installed app. */
  installed: boolean;
  /** The browser can show its install dialog. */
  canPrompt: boolean;
  /** iPhone and iPad install from Safari's Share menu instead. */
  ios: boolean;
  install: () => Promise<boolean>;
}

async function install(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === 'accepted';
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useInstall(): InstallState {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
  return { installed: installed || isStandalone(), canPrompt: deferred !== null, ios: isIOS(), install };
}

/** Shows a system notification, through the service worker where there is one (needed on Android). */
export async function showNotification(title: string, body: string, tag: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body, tag, icon: './icon-192.png', badge: './icon-192.png' };
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    if (registration) return await registration.showNotification(title, options);
    new Notification(title, options);
  } catch {
    /* notifications are a best-effort extra */
  }
}
