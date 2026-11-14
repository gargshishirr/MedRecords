import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppData, HealthRecord, Profile } from '../lib/types';
import type { NewRecordInput } from '../lib/store';
import {
  STORAGE_KEY,
  createRecord,
  insertRecord,
  loadData,
  markRefilled as markRefilledPure,
  parseImport,
  resetData,
  saveData,
  toggleDose as toggleDosePure,
} from '../lib/store';

interface StoreValue {
  data: AppData;
  profile: Profile;
  /** Current time, refreshed every minute so "today" stays correct. */
  now: Date;
  setActiveProfile: (id: string) => void;
  addRecord: (input: NewRecordInput) => HealthRecord;
  toggleDose: (date: string, key: string, label: string) => void;
  markRefilled: (medicationId: string) => void;
  reset: () => void;
  replaceData: (data: AppData) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function StoreProvider({ children, initialData }: { children: ReactNode; initialData?: AppData }) {
  const [data, setData] = useState<AppData>(() => initialData ?? loadData());
  const now = useNow();

  useEffect(() => {
    saveData(data);
  }, [data]);

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      const result = parseImport(e.newValue);
      if (result.ok) setData(result.data);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const profile = data.profiles.find((p) => p.id === data.activeProfileId) ?? data.profiles[0]!;

  const setActiveProfile = useCallback((id: string) => {
    setData((d) => (d.profiles.some((p) => p.id === id) ? { ...d, activeProfileId: id } : d));
  }, []);

  const addRecord = useCallback(
    (input: NewRecordInput) => {
      const record = createRecord(profile.id, input, new Date());
      setData((d) => insertRecord(d, record));
      return record;
    },
    [profile.id],
  );

  const toggleDose = useCallback(
    (date: string, key: string, label: string) => {
      setData((d) => toggleDosePure(d, profile.id, date, key, label, new Date()));
    },
    [profile.id],
  );

  const markRefilled = useCallback((medicationId: string) => {
    setData((d) => markRefilledPure(d, medicationId, new Date()));
  }, []);

  const reset = useCallback(() => setData(resetData()), []);
  const replaceData = useCallback((next: AppData) => setData(next), []);

  const value = useMemo<StoreValue>(
    () => ({ data, profile, now, setActiveProfile, addRecord, toggleDose, markRefilled, reset, replaceData }),
    [data, profile, now, setActiveProfile, addRecord, toggleDose, markRefilled, reset, replaceData],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
