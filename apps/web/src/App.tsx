import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { SessionProvider, RequireAuth } from './lib/auth';
import { AppShell } from './components/AppShell';
import { PairPage } from './pages/PairPage';
import { RemoteGate } from './pages/RemoteGate';
import { LoginPage } from './pages/LoginPage';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink2">
        This page lands after pairing (B4–B5). Pairing ships first so the
        phone relay works end to end.
      </p>
    </div>
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
          {/* Phone PWA — calendar only + talk button (B3). No laptop chrome.
              Requires the same account as the laptop. */}
          <Route
            path="/remote"
            element={
              <RequireAuth>
                <RemoteGate />
              </RequireAuth>
            }
          />
          <Route
            path="/pair"
            element={
              <RequireAuth>
                <AppShell>
                  <PairPage />
                </AppShell>
              </RequireAuth>
            }
          />
          <Route path="/" element={<Navigate to="/pair" replace />} />
          <Route
            path="*"
            element={
              <RequireAuth>
                <AppShell>
                  <Placeholder title="Not found" />
                </AppShell>
              </RequireAuth>
            }
          />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}
