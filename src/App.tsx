import type { ReactNode } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './state/theme';
import { StoreProvider, useVault } from './state/store';
import { ToastProvider } from './state/toast';
import { AppShell } from './components/shell/AppShell';
import { WelcomeScreen } from './components/gate/WelcomeScreen';
import { LockScreen } from './components/gate/LockScreen';
import { OverviewPage } from './pages/Overview/OverviewPage';
import { RecordsPage } from './pages/Records/RecordsPage';
import { LabsPage } from './pages/Labs/LabsPage';
import { MedicationsPage } from './pages/Medications/MedicationsPage';
import { EmergencyPage } from './pages/Emergency/EmergencyPage';
import { SettingsPage } from './pages/Settings/SettingsPage';
import { NotFoundPage } from './pages/NotFound/NotFoundPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="records" element={<RecordsPage />} />
        <Route path="labs" element={<LabsPage />} />
        <Route path="medications" element={<MedicationsPage />} />
        <Route path="emergency" element={<EmergencyPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

/** Shows the first-visit choice or the lock screen; the app itself only mounts once data is open. */
export function Gate({ children }: { children: ReactNode }) {
  const { status } = useVault();
  if (status === 'welcome') return <WelcomeScreen />;
  if (status === 'locked') return <LockScreen />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <StoreProvider>
          <Gate>
            {/* HashRouter: GitHub Pages has no SPA fallback for deep links. */}
            <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AppRoutes />
            </HashRouter>
          </Gate>
        </StoreProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
