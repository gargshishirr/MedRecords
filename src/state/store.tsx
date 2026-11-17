import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppData, Appointment, HealthRecord, LabResult, Medication, Profile } from '../lib/types';
import type {
  AppointmentInput,
  LabInput,
  MedicationInput,
  NewRecordInput,
  ProfileInput,
  StorageLike,
  VitalInput,
} from '../lib/store';
import * as ops from '../lib/store';
import { LOCK_SIGNAL_KEY, STORAGE_KEY, VAULT_KEY, createEmptyData, readStored, safeStorage } from '../lib/store';
import { createSeedData } from '../lib/seed';
import type { VaultKey } from '../lib/crypto';
import { DecryptError, createVaultKey, cryptoAvailable, decryptText, encryptText, openEnvelope, sameSalt } from '../lib/crypto';
import { parseAppDataJson } from '../lib/validate';
import { clearThrottle, readThrottle, recordFailure, waitMs } from '../lib/throttle';
import { useToast } from './toast';
import { useIdleTimer } from './useIdleTimer';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type AppStatus = 'welcome' | 'locked' | 'ready';

type State =
  | { status: 'welcome'; notice?: string }
  | { status: 'locked'; notice?: string }
  /** `vault` is set when a passcode is in use: data is then saved encrypted with this key. */
  | { status: 'ready'; data: AppData; vault: VaultKey | null };

export type PasscodeResult = { ok: true } | { ok: false; error: string; waitMs: number };

interface VaultValue {
  status: AppStatus;
  /** A message for the welcome or lock screen, e.g. when saved data is damaged. */
  notice: string | null;
  lockEnabled: boolean;
  /** False when the browser has no WebCrypto (e.g. a page not served over HTTPS). */
  canEncrypt: boolean;
  chooseDemo: () => void;
  chooseFresh: () => void;
  unlock: (passcode: string) => Promise<PasscodeResult>;
  lockNow: () => void;
  enableLock: (passcode: string) => Promise<PasscodeResult>;
  changePasscode: (current: string, next: string) => Promise<PasscodeResult>;
  removeLock: (current: string) => Promise<PasscodeResult>;
  /** Deletes everything saved in this browser (used when the passcode is forgotten). */
  eraseAll: () => void;
  /** How long until another passcode attempt is allowed. */
  attemptWaitMs: () => number;
}

interface StoreValue {
  data: AppData;
  /** The person being viewed, or null when nobody has been added yet. */
  profile: Profile | null;
  /** Current time, refreshed every minute so "today" stays correct. */
  now: Date;
  setActiveProfile: (id: string) => void;
  addProfile: (input: ProfileInput) => Profile;
  updateProfile: (id: string, input: Partial<ProfileInput>) => void;
  deleteProfile: (id: string) => void;
  addRecord: (input: NewRecordInput) => HealthRecord;
  updateRecord: (id: string, input: NewRecordInput) => void;
  deleteRecord: (id: string) => void;
  addLab: (input: LabInput) => LabResult;
  updateLab: (id: string, input: LabInput) => void;
  deleteLab: (id: string) => void;
  addVital: (input: VitalInput) => void;
  deleteVital: (id: string) => void;
  addMedication: (input: MedicationInput) => Medication;
  updateMedication: (id: string, input: MedicationInput) => void;
  deleteMedication: (id: string) => void;
  addAppointment: (input: AppointmentInput) => Appointment;
  updateAppointment: (id: string, input: AppointmentInput) => void;
  deleteAppointment: (id: string) => void;
  toggleDose: (date: string, key: string, label: string) => void;
  markRefilled: (medicationId: string) => void;
  setAutoLockMinutes: (minutes: number) => void;
  /** Replaces everything with the demo family. */
  loadDemo: () => void;
  /** Replaces everything with an empty dataset. */
  startFresh: () => void;
  /** Replaces everything with imported data. */
  replaceData: (data: AppData) => void;
}

const VaultContext = createContext<VaultValue | null>(null);
const StoreContext = createContext<StoreValue | null>(null);

const DAMAGED_PLAIN = "The data saved in this browser couldn't be read. Starting again will replace it.";
const DAMAGED_VAULT = "The locked data in this browser is damaged and can't be opened.";
const NOT_LOCKED = 'The app is not locked with a passcode.';
const NO_CRYPTO = 'This browser cannot encrypt here. Open MedRecords over HTTPS in an up-to-date browser.';

function secondsLabel(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`;
}

export function tooManyAttempts(ms: number): string {
  return `Too many wrong attempts. Try again in ${secondsLabel(ms)}.`;
}

function initialState(storage: StorageLike | undefined, initialData?: AppData): State {
  if (initialData) return { status: 'ready', data: initialData, vault: null };
  const stored = readStored(storage);
  switch (stored.kind) {
    case 'vault':
      return { status: 'locked' };
    case 'damaged':
      return stored.what === 'vault' ? { status: 'locked', notice: DAMAGED_VAULT } : { status: 'welcome', notice: DAMAGED_PLAIN };
    case 'plain':
      return { status: 'ready', data: stored.data, vault: null };
    case 'empty':
      return { status: 'welcome' };
  }
}

function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export function StoreProvider({
  children,
  initialData,
  storage = safeStorage(),
}: {
  children: ReactNode;
  /** Start with this data instead of reading storage (used by tests). */
  initialData?: AppData;
  storage?: StorageLike;
}) {
  const [state, setState] = useState<State>(() => initialState(storage, initialData));
  const stateRef = useRef(state);
  stateRef.current = state;
  /** JSON of the data last written to (or read from) storage, so unchanged data is never re-saved. */
  const lastJson = useRef<string | null>(null);
  /** Bumped for every save and every lock change, so older async saves never overwrite newer ones. */
  const saveSeq = useRef(0);
  const { notify, clearAll } = useToast();
  const now = useNow();

  const removePlainCopy = useCallback(() => {
    try {
      storage?.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [storage]);

  const lockLocal = useCallback(
    (notice?: string) => {
      lastJson.current = null;
      // Toasts can mention names or medicines, so none may stay on the lock screen.
      clearAll();
      setState({ status: 'locked', notice });
    },
    [clearAll],
  );

  /** Re-reads storage after another tab changed it (or a save found a conflict). */
  const syncFromStorage = useCallback(async () => {
    const stored = readStored(storage);
    if (stored.kind === 'vault' || (stored.kind === 'damaged' && stored.what === 'vault')) {
      // A plain copy must never sit next to the encrypted vault (e.g. written by an old version in another tab).
      removePlainCopy();
      const current = stateRef.current;
      const vault = current.status === 'ready' ? current.vault : null;
      if (stored.kind === 'damaged') return lockLocal(DAMAGED_VAULT);
      if (!vault) {
        if (current.status !== 'locked') lockLocal();
        return;
      }
      try {
        const result = parseAppDataJson(await decryptText(vault.key, stored.envelope));
        if (!result.ok) return lockLocal();
        const latest = stateRef.current;
        if (latest.status !== 'ready' || latest.vault !== vault) return;
        lastJson.current = JSON.stringify(result.data);
        setState({ status: 'ready', data: result.data, vault });
      } catch {
        // The passcode was changed in another tab.
        lockLocal();
      }
      return;
    }
    if (stored.kind === 'plain') {
      lastJson.current = JSON.stringify(stored.data);
      setState({ status: 'ready', data: stored.data, vault: null });
      return;
    }
    lastJson.current = null;
    setState(stored.kind === 'empty' ? { status: 'welcome' } : { status: 'welcome', notice: DAMAGED_PLAIN });
  }, [storage, lockLocal, removePlainCopy]);

  // On start-up, make sure no plain copy is left next to an encrypted vault.
  useEffect(() => {
    if (stateRef.current.status === 'locked') removePlainCopy();
  }, [removePlainCopy]);

  /* ---------- Saving ---------- */

  useEffect(() => {
    if (state.status !== 'ready') return;
    const json = JSON.stringify(state.data);
    if (json === lastJson.current) return;
    lastJson.current = json;
    const seq = ++saveSeq.current;
    const { vault } = state;

    if (!vault) {
      // Never write plain data while an encrypted vault exists (another tab may have just set a passcode).
      if (storage?.getItem(VAULT_KEY) != null) {
        void syncFromStorage();
        return;
      }
      try {
        storage?.setItem(STORAGE_KEY, json);
      } catch {
        notify("Couldn't save your changes. This browser's storage may be full.", 'error');
      }
      return;
    }

    encryptText(vault, json)
      .then((envelope) => {
        if (seq !== saveSeq.current) return;
        // Another tab may have removed the lock or changed the passcode meanwhile.
        const stored = readStored(storage);
        if (stored.kind !== 'vault' || !sameSalt(vault, stored.envelope)) {
          void syncFromStorage();
          return;
        }
        storage?.setItem(VAULT_KEY, JSON.stringify(envelope));
      })
      .catch(() => notify("Couldn't save your changes. This browser's storage may be full.", 'error'));
  }, [state, storage, notify, syncFromStorage]);

  /* ---------- Other tabs ---------- */

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCK_SIGNAL_KEY) {
        const current = stateRef.current;
        if (current.status === 'ready' && current.vault) lockLocal();
        return;
      }
      // `key` is null when another tab cleared all storage.
      if (e.key !== null && e.key !== STORAGE_KEY && e.key !== VAULT_KEY) return;
      void syncFromStorage();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [lockLocal, syncFromStorage]);

  /* ---------- Lock ---------- */

  const lockEnabled = state.status === 'ready' && state.vault !== null;
  const autoLockMinutes = state.status === 'ready' ? state.data.settings.autoLockMinutes : 0;
  const autoLock = useCallback(
    () => lockLocal(`Locked after ${autoLockMinutes} ${autoLockMinutes === 1 ? 'minute' : 'minutes'} without activity.`),
    [lockLocal, autoLockMinutes],
  );
  useIdleTimer(lockEnabled, autoLockMinutes, autoLock);

  const lockNow = useCallback(() => {
    const current = stateRef.current;
    if (current.status !== 'ready' || !current.vault) return;
    lockLocal();
    try {
      storage?.setItem(LOCK_SIGNAL_KEY, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    } catch {
      /* other tabs will still lock on their own timers */
    }
  }, [lockLocal, storage]);

  const attemptWaitMs = useCallback(() => waitMs(readThrottle(storage)), [storage]);

  /** Checks a passcode against the saved vault, with growing delays after wrong attempts. */
  const verify = useCallback(
    async (
      passcode: string,
    ): Promise<{ ok: true; vault: VaultKey; text: string } | { ok: false; error: string; waitMs: number }> => {
      const wait = waitMs(readThrottle(storage));
      if (wait > 0) return { ok: false, error: tooManyAttempts(wait), waitMs: wait };
      const stored = readStored(storage);
      if (stored.kind === 'damaged' && stored.what === 'vault') return { ok: false, error: DAMAGED_VAULT, waitMs: 0 };
      if (stored.kind !== 'vault') return { ok: false, error: NOT_LOCKED, waitMs: 0 };
      try {
        const { text, vault } = await openEnvelope(passcode, stored.envelope);
        clearThrottle(storage);
        return { ok: true, vault, text };
      } catch (err) {
        if (!(err instanceof DecryptError)) return { ok: false, error: 'Something went wrong. Please try again.', waitMs: 0 };
        const next = waitMs(recordFailure(storage));
        return {
          ok: false,
          error: next > 0 ? `Wrong passcode. ${tooManyAttempts(next)}` : 'Wrong passcode. Please try again.',
          waitMs: next,
        };
      }
    },
    [storage],
  );

  const unlock = useCallback(
    async (passcode: string): Promise<PasscodeResult> => {
      const stored = readStored(storage);
      if (stored.kind === 'plain' || stored.kind === 'empty' || (stored.kind === 'damaged' && stored.what === 'plain')) {
        // The lock was removed (or everything erased) in another tab.
        await syncFromStorage();
        return { ok: true };
      }
      const checked = await verify(passcode);
      if (!checked.ok) return checked;
      const result = parseAppDataJson(checked.text);
      if (!result.ok) return { ok: false, error: DAMAGED_VAULT, waitMs: 0 };
      lastJson.current = JSON.stringify(result.data);
      setState({ status: 'ready', data: result.data, vault: checked.vault });
      return { ok: true };
    },
    [storage, verify, syncFromStorage],
  );

  const enableLock = useCallback(
    async (passcode: string): Promise<PasscodeResult> => {
      if (stateRef.current.status !== 'ready') return { ok: false, error: 'Unlock the app first.', waitMs: 0 };
      if (!cryptoAvailable()) return { ok: false, error: NO_CRYPTO, waitMs: 0 };
      const vault = await createVaultKey(passcode);
      const current = stateRef.current;
      if (current.status !== 'ready') return { ok: false, error: 'Unlock the app first.', waitMs: 0 };
      const json = JSON.stringify(current.data);
      const envelope = await encryptText(vault, json);
      try {
        storage?.setItem(VAULT_KEY, JSON.stringify(envelope));
      } catch {
        return { ok: false, error: "Couldn't save the encrypted data. This browser's storage may be full.", waitMs: 0 };
      }
      removePlainCopy();
      clearThrottle(storage);
      saveSeq.current += 1;
      lastJson.current = json;
      setState((s) => (s.status === 'ready' ? { ...s, vault } : s));
      return { ok: true };
    },
    [storage, removePlainCopy],
  );

  const changePasscode = useCallback(
    async (currentPasscode: string, nextPasscode: string): Promise<PasscodeResult> => {
      const checked = await verify(currentPasscode);
      if (!checked.ok) return checked;
      const vault = await createVaultKey(nextPasscode);
      const current = stateRef.current;
      if (current.status !== 'ready') return { ok: false, error: 'Unlock the app first.', waitMs: 0 };
      const json = JSON.stringify(current.data);
      const envelope = await encryptText(vault, json);
      try {
        storage?.setItem(VAULT_KEY, JSON.stringify(envelope));
      } catch {
        return { ok: false, error: "Couldn't save the encrypted data. This browser's storage may be full.", waitMs: 0 };
      }
      saveSeq.current += 1;
      lastJson.current = json;
      setState((s) => (s.status === 'ready' ? { ...s, vault } : s));
      return { ok: true };
    },
    [storage, verify],
  );

  const removeLock = useCallback(
    async (currentPasscode: string): Promise<PasscodeResult> => {
      const checked = await verify(currentPasscode);
      if (!checked.ok) return checked;
      const current = stateRef.current;
      if (current.status !== 'ready') return { ok: false, error: 'Unlock the app first.', waitMs: 0 };
      const json = JSON.stringify(current.data);
      try {
        storage?.setItem(STORAGE_KEY, json);
        storage?.removeItem(VAULT_KEY);
      } catch {
        return { ok: false, error: "Couldn't save your data. This browser's storage may be full.", waitMs: 0 };
      }
      saveSeq.current += 1;
      lastJson.current = json;
      setState((s) => (s.status === 'ready' ? { ...s, vault: null } : s));
      return { ok: true };
    },
    [storage, verify],
  );

  const eraseAll = useCallback(() => {
    try {
      storage?.removeItem(VAULT_KEY);
      storage?.removeItem(STORAGE_KEY);
      storage?.removeItem(LOCK_SIGNAL_KEY);
    } catch {
      /* ignore */
    }
    clearThrottle(storage);
    saveSeq.current += 1;
    lastJson.current = null;
    clearAll();
    setState({ status: 'welcome' });
  }, [storage, clearAll]);

  const chooseDemo = useCallback(() => setState({ status: 'ready', data: createSeedData(new Date()), vault: null }), []);
  const chooseFresh = useCallback(() => setState({ status: 'ready', data: createEmptyData(new Date()), vault: null }), []);

  const vaultValue = useMemo<VaultValue>(
    () => ({
      status: state.status,
      notice: state.status === 'ready' ? null : (state.notice ?? null),
      lockEnabled,
      canEncrypt: cryptoAvailable(),
      chooseDemo,
      chooseFresh,
      unlock,
      lockNow,
      enableLock,
      changePasscode,
      removeLock,
      eraseAll,
      attemptWaitMs,
    }),
    [
      state,
      lockEnabled,
      chooseDemo,
      chooseFresh,
      unlock,
      lockNow,
      enableLock,
      changePasscode,
      removeLock,
      eraseAll,
      attemptWaitMs,
    ],
  );

  /* ---------- Data operations ---------- */

  const update = useCallback((fn: (data: AppData) => AppData) => {
    setState((s) => (s.status === 'ready' ? { ...s, data: fn(s.data) } : s));
  }, []);

  const data = state.status === 'ready' ? state.data : null;
  const profile = data ? (data.profiles.find((p) => p.id === data.activeProfileId) ?? data.profiles[0] ?? null) : null;
  const profileId = profile?.id ?? '';

  const actions = useMemo(
    () => ({
      setActiveProfile: (id: string) => update((d) => (d.profiles.some((p) => p.id === id) ? { ...d, activeProfileId: id } : d)),
      addProfile: (input: ProfileInput) => {
        const created = ops.createProfile(input, stateRef.current.status === 'ready' ? stateRef.current.data.profiles : []);
        update((d) => ops.insertProfile(d, created));
        return created;
      },
      updateProfile: (id: string, input: Partial<ProfileInput>) => update((d) => ops.updateProfile(d, id, input)),
      deleteProfile: (id: string) => update((d) => ops.deleteProfile(d, id)),
      addRecord: (input: NewRecordInput) => {
        const record = ops.createRecord(profileId, input, new Date());
        update((d) => ops.insertRecord(d, record));
        return record;
      },
      updateRecord: (id: string, input: NewRecordInput) => update((d) => ops.updateRecord(d, id, input)),
      deleteRecord: (id: string) => update((d) => ops.deleteRecord(d, id)),
      addLab: (input: LabInput) => {
        const lab = ops.createLab(profileId, input);
        update((d) => ops.insertLab(d, lab, new Date()));
        return lab;
      },
      updateLab: (id: string, input: LabInput) => update((d) => ops.updateLab(d, id, input)),
      deleteLab: (id: string) => update((d) => ops.deleteLab(d, id)),
      addVital: (input: VitalInput) => update((d) => ops.addVital(d, profileId, input)),
      deleteVital: (id: string) => update((d) => ops.deleteVital(d, id)),
      addMedication: (input: MedicationInput) => {
        const medication = ops.createMedication(profileId, input);
        update((d) => ops.insertMedication(d, medication, new Date()));
        return medication;
      },
      updateMedication: (id: string, input: MedicationInput) => update((d) => ops.updateMedication(d, id, input)),
      deleteMedication: (id: string) => update((d) => ops.deleteMedication(d, id)),
      addAppointment: (input: AppointmentInput) => {
        const appointment = ops.createAppointment(profileId, input);
        update((d) => ops.insertAppointment(d, appointment, new Date()));
        return appointment;
      },
      updateAppointment: (id: string, input: AppointmentInput) => update((d) => ops.updateAppointment(d, id, input)),
      deleteAppointment: (id: string) => update((d) => ops.deleteAppointment(d, id)),
      toggleDose: (date: string, key: string, label: string) =>
        update((d) => ops.toggleDose(d, profileId, date, key, label, new Date())),
      markRefilled: (medicationId: string) => update((d) => ops.markRefilled(d, medicationId, new Date())),
      setAutoLockMinutes: (minutes: number) => update((d) => ops.setAutoLockMinutes(d, minutes)),
      loadDemo: () => update((d) => ops.withSettings(createSeedData(new Date()), d)),
      startFresh: () => update((d) => createEmptyData(new Date(), d.settings)),
      replaceData: (next: AppData) => update((d) => ops.withSettings(next, d)),
    }),
    [update, profileId],
  );

  const storeValue = useMemo<StoreValue | null>(
    () => (data ? { data, profile, now, ...actions } : null),
    [data, profile, now, actions],
  );

  return (
    <VaultContext.Provider value={vaultValue}>
      <StoreContext.Provider value={storeValue}>{children}</StoreContext.Provider>
    </VaultContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

export function useVault(): VaultValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used inside <StoreProvider>');
  return ctx;
}

/** Data and actions. Only available once the app is open (not on the welcome or lock screen). */
export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside an open <StoreProvider>');
  return ctx;
}

/** Like `useStore`, for pages that only render when a person has been selected. */
export function useActiveProfile(): StoreValue & { profile: Profile } {
  const store = useStore();
  if (!store.profile) throw new Error('useActiveProfile needs at least one family member');
  return store as StoreValue & { profile: Profile };
}
