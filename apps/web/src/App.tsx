import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { PairPage } from './pages/PairPage';
import { RemotePage } from './pages/RemotePage';

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
      <Routes>
        {/* Phone PWA — calendar only + talk button (B3). No laptop chrome. */}
        <Route path="/remote" element={<RemotePage />} />
        <Route
          path="/pair"
          element={
            <AppShell>
              <PairPage />
            </AppShell>
          }
        />
        <Route path="/" element={<Navigate to="/pair" replace />} />
        <Route
          path="*"
          element={
            <AppShell>
              <Placeholder title="Not found" />
            </AppShell>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
