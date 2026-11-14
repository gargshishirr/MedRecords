import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from './state/theme';
import { StoreProvider } from './state/store';
import { ToastProvider } from './state/toast';
import { AppRoutes } from './App';

function renderAt(path: string) {
  return render(
    <ThemeProvider>
      <StoreProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppRoutes />
          </MemoryRouter>
        </ToastProvider>
      </StoreProvider>
    </ThemeProvider>,
  );
}

describe('App routes', () => {
  it.each([
    ['/records', 'Records'],
    ['/labs', 'Lab trends'],
    ['/medications', 'Medications'],
    ['/emergency', 'Emergency card'],
    ['/settings', 'Settings'],
  ])('renders %s', (path, heading) => {
    renderAt(path);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it('persists a checked medication dose for today', async () => {
    const user = userEvent.setup();
    const { unmount } = renderAt('/');
    const dose = screen.getAllByRole('checkbox')[0]!;
    const wasChecked = (dose as HTMLInputElement).checked;
    await user.click(dose);
    unmount();

    renderAt('/');
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(!wasChecked);
  });
});
