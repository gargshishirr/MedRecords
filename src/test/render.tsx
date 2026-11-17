import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AppData } from '../lib/types';
import { ThemeProvider } from '../state/theme';
import { StoreProvider } from '../state/store';
import { ToastProvider } from '../state/toast';
import { AppRoutes, Gate } from '../App';

/** Renders the whole app (gate, lock and routes) the way `App` does, with an in-memory router. */
export function renderApp({ path = '/', data }: { path?: string; data?: AppData } = {}) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <StoreProvider initialData={data}>
          <Gate>
            <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AppRoutes />
            </MemoryRouter>
          </Gate>
        </StoreProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}
