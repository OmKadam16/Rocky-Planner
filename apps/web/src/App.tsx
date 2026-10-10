// Rocky laptop + phone routes (BrowserRouter + SPA rewrite).
//
// "/" lands on the dashboard — pairing never blocks the app. "/pair" is a
// legacy laptop route that forwards to Settings → Devices, query preserved.

import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { SessionProvider, RequireAuth } from './lib/auth';
import { ROOT_REDIRECT, pairRedirectTarget } from './lib/routes';
import { AppShell } from './components/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { CalendarPage } from './pages/CalendarPage';
import { ClassesPage } from './pages/ClassesPage';
import { TasksPage } from './pages/TasksPage';
import { MemoryPage } from './pages/MemoryPage';
import { ActivityPage } from './pages/ActivityPage';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { ProfilePage } from './pages/settings/ProfilePage';
import { DevicesPage } from './pages/settings/DevicesPage';
import { VoicePage } from './pages/settings/VoicePage';
import { AiPage } from './pages/settings/AiPage';
import { PrivacyPage } from './pages/settings/PrivacyPage';
import { AppearancePage } from './pages/settings/AppearancePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RemoteGate } from './pages/RemoteGate';
import { LoginPage } from './pages/LoginPage';

function PairRedirect() {
  const { search } = useLocation();
  return <Navigate to={pairRedirectTarget(search)} replace />;
}

function ShelledOutlet() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          {/* Public: sign in / create account. ?next preserves the target,
              including /remote?pair=<CODE> query strings. */}
          <Route path="/login" element={<LoginPage />} />
          {/* Phone PWA — calendar only + talk button. No laptop chrome.
              Requires the same account as the laptop. */}
          <Route
            path="/remote"
            element={
              <RequireAuth>
                <RemoteGate />
              </RequireAuth>
            }
          />
          {/* Legacy laptop pairing route → Settings → Devices. */}
          <Route path="/pair" element={<PairRedirect />} />
          <Route
            element={
              <RequireAuth>
                <ShelledOutlet />
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/classes" element={<ClassesPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/memory" element={<MemoryPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="profile" replace />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="devices" element={<DevicesPage />} />
              <Route path="voice" element={<VoicePage />} />
              <Route path="ai" element={<AiPage />} />
              <Route path="privacy" element={<PrivacyPage />} />
              <Route path="appearance" element={<AppearancePage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="/" element={<Navigate to={ROOT_REDIRECT} replace />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}
