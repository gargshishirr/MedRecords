import { HashRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './state/theme';
import { StoreProvider } from './state/store';
import { ToastProvider } from './state/toast';
import { AppShell } from './components/shell/AppShell';
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

export default function App() {
  return (
    <ThemeProvider>
      <StoreProvider>
        <ToastProvider>
          {/* HashRouter: GitHub Pages has no SPA fallback for deep links. */}
          <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppRoutes />
          </HashRouter>
        </ToastProvider>
      </StoreProvider>
    </ThemeProvider>
  );
}
