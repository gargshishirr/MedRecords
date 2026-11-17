import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toast';
import { toISODate } from '../../lib/date';
import { firstName, pluralize } from '../../lib/format';
import type { AppData } from '../../lib/types';
import { Dialog } from '../ui/Dialog';
import { ProfileForm } from './ProfileForm';

interface ProfileEditorValue {
  /** Opens the form to add a new family member. */
  openNew: () => void;
  /** Opens the form to edit (or delete) a family member. */
  openEdit: (id: string) => void;
}

const ProfileEditorContext = createContext<ProfileEditorValue | null>(null);

/** What deleting a person also deletes, in words. */
export function describeOwnedData(data: AppData, profileId: string): string {
  const count = <T extends { profileId: string }>(list: T[]) => list.filter((x) => x.profileId === profileId).length;
  const parts = [
    [count(data.records), 'record'],
    [count(data.labs), 'lab result'],
    [count(data.medications), 'medication'],
    [count(data.appointments), 'appointment'],
  ] as const;
  const listed = parts.filter(([n]) => n > 0).map(([n, noun]) => pluralize(n, noun));
  if (listed.length === 0) return 'They have no records yet.';
  const last = listed.pop();
  return `This also deletes ${listed.length ? `${listed.join(', ')} and ${last}` : last}.`;
}

/** One shared add/edit dialog for family members, opened from anywhere in the app. */
export function ProfileEditorProvider({ children }: { children: ReactNode }) {
  const { data, now, addProfile, updateProfile, deleteProfile } = useStore();
  const { notify } = useToast();
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);

  const openNew = useCallback(() => setEditing({ id: null }), []);
  const openEdit = useCallback((id: string) => setEditing({ id }), []);
  const close = useCallback(() => setEditing(null), []);
  const value = useMemo(() => ({ openNew, openEdit }), [openNew, openEdit]);

  const profile = editing?.id ? data.profiles.find((p) => p.id === editing.id) : undefined;
  const isEdit = Boolean(editing?.id && profile);

  return (
    <ProfileEditorContext.Provider value={value}>
      {children}
      <Dialog
        open={editing !== null}
        onClose={close}
        size="lg"
        title={isEdit && profile ? `Edit ${firstName(profile.name)}` : 'Add a family member'}
        description={
          isEdit
            ? 'Changes show up on the emergency card straight away.'
            : 'Only the name, date of birth and sex are needed. You can add the rest later.'
        }
      >
        {editing && (
          <ProfileForm
            key={editing.id ?? 'new'}
            initial={profile}
            today={toISODate(now)}
            onCancel={close}
            onSubmit={(input) => {
              if (profile) {
                updateProfile(profile.id, input);
                notify(`Saved ${firstName(input.name)}'s details`);
              } else {
                addProfile(input);
                notify(`Added ${input.name}`);
              }
              close();
            }}
            onDelete={
              profile
                ? () => {
                    deleteProfile(profile.id);
                    notify(`Deleted ${profile.name}`);
                    close();
                  }
                : undefined
            }
            deleteText={
              profile ? `Delete ${profile.name}? ${describeOwnedData(data, profile.id)} This cannot be undone.` : undefined
            }
          />
        )}
      </Dialog>
    </ProfileEditorContext.Provider>
  );
}

export function useProfileEditor(): ProfileEditorValue {
  const ctx = useContext(ProfileEditorContext);
  if (!ctx) throw new Error('useProfileEditor must be used inside <ProfileEditorProvider>');
  return ctx;
}
