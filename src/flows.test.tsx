import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LOCK_SIGNAL_KEY, STORAGE_KEY, VAULT_KEY, addProfile, addRecord, createEmptyData } from './lib/store';
import { fileStore } from './lib/files';
import { toISODate } from './lib/date';
import type { ProfileInput } from './lib/store';
import { createSeedData } from './lib/seed';
import { createVaultKey, encryptText } from './lib/crypto';
import { createBackup } from './lib/backup';
import { THROTTLE_KEY } from './lib/throttle';
import type { AppData } from './lib/types';
import { renderApp } from './test/render';

const PASSCODE = 'correct horse battery';
const SLOW = { timeout: 5000 };

const person: ProfileInput = {
  name: 'Asha Rao',
  relation: 'Self',
  dob: '1990-02-03',
  sex: 'Female',
  bloodGroup: 'Unknown',
  allergies: [],
  conditions: [],
  emergencyContacts: [],
};

const onePerson = () => addProfile(createEmptyData(), person).data;

/** Everything in localStorage, as one string. */
function storedText(): string {
  const parts: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    parts.push(`${key}=${localStorage.getItem(key)}`);
  }
  return parts.join('\n');
}

async function lockedWith(data: AppData, passcode = PASSCODE) {
  const vault = await createVaultKey(passcode);
  localStorage.setItem(VAULT_KEY, JSON.stringify(await encryptText(vault, JSON.stringify(data))));
}

const dialog = (name: string | RegExp) => screen.findByRole('dialog', { name });

afterEach(() => {
  vi.useRealTimers();
});

describe('first visit', () => {
  it('offers the demo or a fresh start', async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByRole('button', { name: 'Try the demo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try the demo' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Riya/ })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).demo).toBe(true);
  });

  it('starts fresh with zero people and friendly empty pages', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/medications' });
    await user.click(screen.getByRole('button', { name: 'Start fresh' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Add your family' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ demo: false, profiles: [], records: [] });
    // Settings still works with nobody added.
    await user.click(screen.getAllByRole('link', { name: 'Settings' })[0]!);
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('No family members yet')).toBeInTheDocument();
  });
});

describe('family members', () => {
  it('adds, edits and deletes a person', async () => {
    const user = userEvent.setup();
    renderApp({ data: createEmptyData() });

    await user.click(screen.getAllByRole('button', { name: 'Add a family member' })[0]!);
    let form = await dialog('Add a family member');
    await user.click(within(form).getByRole('button', { name: 'Add person' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Please fix 3 fields');

    await user.type(within(form).getByLabelText(/Full name/), 'Asha Rao');
    await user.type(within(form).getByLabelText(/Date of birth/), '1990-02-03');
    await user.click(within(form).getByRole('radio', { name: 'Female' }));
    await user.selectOptions(within(form).getByLabelText('Blood group'), 'B+');
    await user.click(within(form).getByRole('button', { name: 'Add allergy' }));
    await user.type(within(form).getByLabelText(/Allergic to/), 'Penicillin');
    await user.click(within(form).getByRole('button', { name: 'Add contact' }));
    await user.type(within(form).getByLabelText('Name'), 'Ravi Rao');
    await user.type(within(form).getByLabelText('Phone'), '+91 00000 12345');
    await user.click(within(form).getByRole('button', { name: 'Add person' }));

    expect(await screen.findByRole('heading', { level: 1, name: /Asha/ })).toBeInTheDocument();
    expect(screen.getByText('Penicillin')).toBeInTheDocument();

    // Edit from the Emergency card.
    await user.click(screen.getAllByRole('link', { name: 'Emergency card' })[0]!);
    expect(await screen.findByText('B+')).toBeInTheDocument();
    expect(screen.getByText('Ravi Rao')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    form = await dialog('Edit Asha');
    const name = within(form).getByLabelText(/Full name/);
    await user.clear(name);
    await user.type(name, 'Asha R. Rao');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Asha R. Rao' })).toBeInTheDocument();

    // Delete from the profile menu.
    await user.click(screen.getAllByRole('button', { name: /Switch profile/ })[0]!);
    await user.click(screen.getAllByRole('button', { name: /Edit Asha's details/ })[0]!);
    form = await dialog('Edit Asha');
    await user.click(within(form).getByRole('button', { name: 'Delete' }));
    expect(within(form).getByText(/Delete Asha R. Rao\? They have no records yet/)).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Add your family' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profiles).toEqual([]);
  });
});

describe('health data', () => {
  it('adds, edits and deletes a record', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/records', data: onePerson() });
    expect(screen.getByText('No records yet')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add the first record' }));
    let form = await dialog('Add a record');
    await user.click(within(form).getByRole('radio', { name: 'Visit' }));
    await user.type(within(form).getByLabelText(/Title/), 'Annual check-up');
    await user.click(within(form).getByRole('button', { name: 'Save record' }));
    await user.click(await screen.findByRole('button', { name: /Annual check-up/ }));

    const sheet = await dialog('Annual check-up');
    await user.click(within(sheet).getByRole('button', { name: 'Edit' }));
    form = await dialog('Edit record');
    const title = within(form).getByLabelText(/Title/);
    await user.clear(title);
    await user.type(title, 'Annual check-up (fasting)');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    await user.click(await screen.findByRole('button', { name: /Annual check-up \(fasting\)/ }));

    const again = await dialog('Annual check-up (fasting)');
    await user.click(within(again).getByRole('button', { name: 'Delete' }));
    await user.click(within(again).getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('No records yet')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).records).toEqual([]);
  });

  it('adds, edits and deletes a medication', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/medications', data: onePerson() });

    await user.click(screen.getAllByRole('button', { name: 'Add medication' })[0]!);
    let form = await dialog('Add a medication');
    await user.type(within(form).getByLabelText(/Medicine/), 'Metformin');
    await user.type(within(form).getByLabelText(/Strength/), '500 mg');
    await user.click(within(form).getByRole('checkbox', { name: 'Morning' }));
    await user.click(within(form).getByRole('button', { name: 'Add medication' }));

    expect(await screen.findByRole('heading', { level: 3, name: /Metformin/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Metformin/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit Metformin' }));
    form = await dialog('Edit medication');
    const strength = within(form).getByLabelText(/Strength/);
    await user.clear(strength);
    await user.type(strength, '1000 mg');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('1000 mg', { selector: 'h3 span' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit Metformin' }));
    form = await dialog('Edit medication');
    await user.click(within(form).getByRole('button', { name: 'Delete' }));
    await user.click(within(form).getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('No active medications')).toBeInTheDocument();
  });

  it('adds, edits and deletes a lab result', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/labs', data: onePerson() });

    await user.click(screen.getByRole('button', { name: 'Add a lab result' }));
    let form = await dialog('Add a lab result');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Test' }), 'hba1c');
    await user.type(within(form).getByLabelText(/Result/), '6.1');
    await user.click(within(form).getByRole('button', { name: 'Add result' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'HbA1c' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show table' }));
    await user.click(screen.getByRole('button', { name: /Edit result from/ }));
    form = await dialog('Edit lab result');
    const value = within(form).getByLabelText(/Result/);
    await user.clear(value);
    await user.type(value, '5.4');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).labs[0].value).toBe(5.4));

    await user.click(screen.getByRole('button', { name: /Edit result from/ }));
    form = await dialog('Edit lab result');
    await user.click(within(form).getByRole('button', { name: 'Delete' }));
    await user.click(within(form).getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('No lab results yet')).toBeInTheDocument();
  });

  it('adds, edits and deletes an appointment', async () => {
    const user = userEvent.setup();
    renderApp({ data: onePerson() });

    await user.click(screen.getByRole('button', { name: 'Add' }));
    let form = await dialog('Add an appointment');
    await user.type(within(form).getByLabelText(/What it is for/), 'Dental cleaning');
    await user.click(within(form).getByRole('button', { name: 'Add appointment' }));
    expect(await screen.findByText('Dental cleaning')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit appointment: Dental cleaning' }));
    form = await dialog('Edit appointment');
    const reason = within(form).getByLabelText(/What it is for/);
    await user.clear(reason);
    await user.type(reason, 'Dental check-up');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Dental check-up')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit appointment: Dental check-up' }));
    form = await dialog('Edit appointment');
    await user.click(within(form).getByRole('button', { name: 'Delete' }));
    await user.click(within(form).getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('No upcoming appointments')).toBeInTheDocument();
  });
});

describe('start fresh', () => {
  it('clears the demo data after confirming', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/settings', data: createSeedData() });
    await user.click(screen.getByRole('button', { name: 'Start fresh' }));
    const confirm = await dialog('Clear the demo data?');
    await user.click(within(confirm).getByRole('button', { name: 'Start fresh' }));
    expect(await screen.findByText('No family members yet')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ demo: false, profiles: [], records: [] });
  });
});

describe('passcode lock', () => {
  it('encrypts everything, locks, rejects a wrong passcode and unlocks', { timeout: 30_000 }, async () => {
    const user = userEvent.setup();
    renderApp({ path: '/settings', data: createSeedData() });

    await user.click(screen.getByRole('button', { name: 'Lock with a passcode' }));
    const form = await dialog('Lock with a passcode');
    await user.type(within(form).getByLabelText(/New passcode/), 'short');
    await user.click(within(form).getByRole('button', { name: 'Turn on the lock' }));
    expect(within(form).getByText('Use at least 8 characters.')).toBeInTheDocument();
    await user.clear(within(form).getByLabelText(/New passcode/));
    await user.type(within(form).getByLabelText(/New passcode/), PASSCODE);
    await user.type(within(form).getByLabelText(/Type it again/), PASSCODE);
    await user.click(within(form).getByRole('checkbox', { name: /I understand/ }));
    await user.click(within(form).getByRole('button', { name: 'Turn on the lock' }));
    expect(await screen.findByText('Lock is on. Your data is now encrypted in this browser.', {}, SLOW)).toBeInTheDocument();

    // Only the encrypted envelope is stored: no names, medicines, checklist or passcode.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(Object.keys(JSON.parse(localStorage.getItem(VAULT_KEY)!)).sort()).toEqual(['ct', 'iv', 'salt', 'v']);
    for (const secret of ['Riya', 'Kapoor', 'Metformin', 'Penicillin', 'doseLog', PASSCODE]) {
      expect(storedText()).not.toContain(secret);
    }

    // A change is saved encrypted with a new IV.
    const before = JSON.parse(localStorage.getItem(VAULT_KEY)!);
    await user.selectOptions(screen.getByLabelText('Lock after'), '15');
    await waitFor(() => expect(JSON.parse(localStorage.getItem(VAULT_KEY)!).iv).not.toBe(before.iv), SLOW);
    expect(JSON.parse(localStorage.getItem(VAULT_KEY)!).salt).toBe(before.salt);

    await user.click(screen.getByRole('button', { name: 'Lock now' }));
    expect(await screen.findByRole('heading', { name: 'MedRecords is locked' })).toBeInTheDocument();
    expect(screen.queryByText(/Riya/)).not.toBeInTheDocument();
    // No toast survives on the lock screen.
    expect(screen.queryByText('Lock is on. Your data is now encrypted in this browser.')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Passcode'), 'wrong passcode');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect((await screen.findAllByText('Wrong passcode. Please try again.', {}, SLOW)).length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText('Passcode'), PASSCODE);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' }, SLOW)).toBeInTheDocument();
    expect(screen.getByLabelText('Lock after')).toHaveValue('15');
    expect(localStorage.getItem(THROTTLE_KEY)).toBeNull();
  });

  it('changes the passcode and removes the lock, both needing the current one', { timeout: 30_000 }, async () => {
    const user = userEvent.setup();
    await lockedWith(createSeedData());
    renderApp({ path: '/settings' });
    await user.type(screen.getByLabelText('Passcode'), PASSCODE);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await screen.findByRole('heading', { level: 1, name: 'Settings' }, SLOW);

    await user.click(screen.getByRole('button', { name: 'Change passcode' }));
    let form = await dialog('Change passcode');
    await user.type(within(form).getByLabelText(/Current passcode/), 'not it at all');
    await user.type(within(form).getByLabelText(/^New passcode/), 'new passcode 2026');
    await user.type(within(form).getByLabelText(/Type the new one again/), 'new passcode 2026');
    await user.click(within(form).getByRole('button', { name: 'Change passcode' }));
    expect(await within(form).findByText(/Wrong passcode/, {}, SLOW)).toBeInTheDocument();
    await user.type(within(form).getByLabelText(/Current passcode/), PASSCODE);
    await user.click(within(form).getByRole('button', { name: 'Change passcode' }));
    expect(await screen.findByText('Passcode changed', {}, SLOW)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove lock' }));
    form = await dialog('Remove the lock?');
    await user.type(within(form).getByLabelText(/Current passcode/), PASSCODE);
    await user.click(within(form).getByRole('button', { name: 'Remove lock' }));
    expect(await within(form).findByText(/Wrong passcode/, {}, SLOW)).toBeInTheDocument();
    await user.type(within(form).getByLabelText(/Current passcode/), 'new passcode 2026');
    await user.click(within(form).getByRole('button', { name: 'Remove lock' }));
    expect(await screen.findByText(/Lock removed/, {}, SLOW)).toBeInTheDocument();
    expect(localStorage.getItem(VAULT_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profiles).toHaveLength(3);
  });

  it('slows down repeated wrong passcodes', { timeout: 30_000 }, async () => {
    const user = userEvent.setup();
    await lockedWith(onePerson());
    renderApp();
    for (let i = 0; i < 3; i++) {
      await user.type(screen.getByLabelText('Passcode'), `guess number ${i}`);
      await user.click(screen.getByRole('button', { name: 'Unlock' }));
      await waitFor(() => expect(screen.getByLabelText('Passcode')).toHaveValue(''), SLOW);
    }
    expect(screen.getAllByText(/Too many wrong attempts\. Try again in 2 s/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    expect(JSON.parse(localStorage.getItem(THROTTLE_KEY)!).failures).toBe(3);
  });

  it('can erase everything when the passcode is forgotten', async () => {
    const user = userEvent.setup();
    await lockedWith(onePerson());
    renderApp();
    await user.click(screen.getByText('Forgot your passcode?'));
    await user.click(screen.getByRole('button', { name: 'Erase all data in this browser' }));
    const confirm = await dialog('Erase all data?');
    await user.click(within(confirm).getByRole('button', { name: 'Erase everything' }));
    expect(await screen.findByRole('button', { name: 'Start fresh' })).toBeInTheDocument();
    expect(localStorage.getItem(VAULT_KEY)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('locks itself after the chosen time without activity', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await lockedWith(onePerson());
    renderApp();
    await user.type(screen.getByLabelText('Passcode'), PASSCODE);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await screen.findByRole('heading', { level: 1, name: /Asha/ }, SLOW);

    act(() => vi.advanceTimersByTime(4 * 60_000));
    expect(screen.queryByRole('heading', { name: 'MedRecords is locked' })).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60_000 + 6_000));
    expect(await screen.findByRole('heading', { name: 'MedRecords is locked' })).toBeInTheDocument();
    expect(screen.getByText('Locked after 5 minutes without activity.')).toBeInTheDocument();
  });

  it('locks every open tab', async () => {
    const user = userEvent.setup();
    await lockedWith(onePerson());
    renderApp();
    await user.type(screen.getByLabelText('Passcode'), PASSCODE);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await screen.findByRole('heading', { level: 1, name: /Asha/ }, SLOW);

    // Another tab pressed "Lock now".
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: LOCK_SIGNAL_KEY, newValue: 'x' }));
    });
    expect(await screen.findByRole('heading', { name: 'MedRecords is locked' })).toBeInTheDocument();
  });

  it('locks a plain tab when another tab sets a passcode', async () => {
    renderApp({ data: onePerson() });
    expect(await screen.findByRole('heading', { level: 1, name: /Asha/ })).toBeInTheDocument();
    await lockedWith(onePerson());
    localStorage.removeItem(STORAGE_KEY);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: VAULT_KEY, newValue: localStorage.getItem(VAULT_KEY) }));
    });
    expect(await screen.findByRole('heading', { name: 'MedRecords is locked' })).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('backups', () => {
  it('imports a plain backup safely after confirming', async () => {
    const user = userEvent.setup();
    const { container } = renderApp({ path: '/settings', data: onePerson() });
    const demo = createSeedData();
    const json = JSON.stringify(demo).replace('{', '{"__proto__":{"polluted":"yes"},"unknown":1,');
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File([json], 'backup.json'));

    const confirm = await dialog('Replace your data?');
    expect(within(confirm).getByText(/3 people and 59 records \(demo data\)/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Replace data' }));
    expect(await screen.findByText(/Imported 59 records for 3 people/)).toBeInTheDocument();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain('unknown');
  });

  it('opens an encrypted backup with its passcode', { timeout: 30_000 }, async () => {
    const user = userEvent.setup();
    const { container } = renderApp({ path: '/settings', data: createEmptyData() });
    const text = await createBackup(onePerson(), 'backup passcode 1');
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File([text], 'backup.json'));

    const ask = await dialog('Open encrypted backup');
    await user.type(within(ask).getByLabelText(/Backup passcode/), 'not the passcode');
    await user.click(within(ask).getByRole('button', { name: 'Open backup' }));
    expect((await within(ask).findAllByText(/Wrong backup passcode/, {}, SLOW)).length).toBeGreaterThan(0);
    await user.type(within(ask).getByLabelText(/Backup passcode/), 'backup passcode 1');
    await user.click(within(ask).getByRole('button', { name: 'Open backup' }));

    const confirm = await dialog('Replace your data?');
    await user.click(within(confirm).getByRole('button', { name: 'Replace data' }));
    expect((await screen.findAllByText('Asha Rao')).length).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profiles[0].name).toBe('Asha Rao');
  });

  it('explains why a file was rejected and leaves the data alone', async () => {
    const { container } = renderApp({ path: '/settings', data: onePerson() });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const big = new File(['{}'], 'huge.json');
    Object.defineProperty(big, 'size', { value: 250 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('That file is too big. MedRecords backups must be under 250 MB.');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profiles[0].name).toBe('Asha Rao');
  });
});

describe('attached files', () => {
  it('attaches a PDF encrypted, then removes it', async () => {
    // jsdom has no blob: URLs.
    Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => undefined });
    const user = userEvent.setup();
    const { data } = addRecord(onePerson(), '', { type: 'lab', title: 'Thyroid profile', date: '2026-11-01' });
    const owned = { ...data, records: data.records.map((r) => ({ ...r, profileId: data.profiles[0]!.id })) };
    renderApp({ path: '/records', data: owned });

    await user.click(await screen.findByRole('button', { name: /Thyroid profile/ }));
    const sheet = await dialog('Thyroid profile');
    const pdf = new File(['%PDF-1.7\n%%EOF'], 'tsh report.pdf', { type: 'application/pdf' });
    await user.upload(within(sheet).getByLabelText('Choose photos or PDFs'), pdf);
    expect(await screen.findByText('1 file added')).toBeInTheDocument();

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    const [attachment] = saved.records[0].attachments;
    expect(attachment).toMatchObject({ name: 'tsh report.pdf', type: 'application/pdf' });
    expect(saved.fileKey).toHaveLength(44);
    const stored = await fileStore().get(attachment.fileId);
    expect(new TextDecoder().decode(stored!.ct)).not.toContain('%PDF');

    await user.click(within(sheet).getByRole('button', { name: /tsh report\.pdf/ }));
    const viewer = await dialog('tsh report.pdf');
    await user.click(within(viewer).getByRole('button', { name: 'Remove' }));
    await user.click(within(viewer).getByRole('button', { name: 'Yes, remove' }));
    await waitFor(async () => expect(await fileStore().get(attachment.fileId)).toBeUndefined());
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).records[0].attachments).toEqual([]);
  });
});

describe('vaccine schedule', () => {
  it('shows what a child is due and marks a dose as given', async () => {
    const user = userEvent.setup();
    const dob = new Date();
    dob.setMonth(dob.getMonth() - 5);
    const child = addProfile(createEmptyData(), { ...person, name: 'Ira Rao', relation: 'Daughter', dob: toISODate(dob) }).data;
    renderApp({ path: '/', data: child });
    expect(await screen.findByRole('heading', { name: 'Vaccines' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Schedule' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Vaccines' })).toBeInTheDocument();
    expect(screen.getByText(/overdue · \d+ due now/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^BCG/ }));
    const form = await dialog('BCG');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('BCG marked as given')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profiles[0].vaccines.bcg).toBe(toISODate(new Date()));
  });
});
