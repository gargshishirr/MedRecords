import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createSeedData } from './lib/seed';
import { addProfile, createEmptyData } from './lib/store';
import { renderApp } from './test/render';

const ROUTES = ['/', '/records', '/labs', '/medications', '/emergency', '/settings'];

describe('App routes', () => {
  it.each([
    ['/records', 'Records'],
    ['/labs', 'Lab trends'],
    ['/medications', 'Medications'],
    ['/emergency', 'Emergency card'],
    ['/settings', 'Settings'],
  ])('renders %s', (path, heading) => {
    renderApp({ path, data: createSeedData() });
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it.each(ROUTES)('shows a friendly page at %s with nobody added yet', (path) => {
    renderApp({ path, data: createEmptyData() });
    const expected = path === '/settings' ? 'Settings' : 'Add your family';
    expect(screen.getByRole('heading', { level: 1, name: expected })).toBeInTheDocument();
  });

  it.each(ROUTES)('renders %s for a person with no health data', (path) => {
    const { data } = addProfile(createEmptyData(), {
      name: 'Asha Rao',
      relation: '',
      dob: '1990-02-03',
      sex: 'Female',
      bloodGroup: 'Unknown',
      allergies: [],
      conditions: [],
      emergencyContacts: [],
    });
    renderApp({ path, data });
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Add your family' })).not.toBeInTheDocument();
  });

  it('persists a checked medication dose for today', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp({ data: createSeedData() });
    const dose = screen.getAllByRole('checkbox')[0]!;
    const wasChecked = (dose as HTMLInputElement).checked;
    await user.click(dose);
    unmount();

    // Second render reads what the first one saved.
    renderApp();
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(!wasChecked);
  });
});
