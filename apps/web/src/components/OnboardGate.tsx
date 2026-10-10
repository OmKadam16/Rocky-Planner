import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { readOnboardedAt } from '../lib/setupApi';
import { useSession } from '../lib/auth';

/**
 * Laptop onboarding gate: signed-in users without profiles.onboarded_at go
 * to /setup; everyone else enters the app. The phone never sees this gate.
 */
export function OnboardGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading || !session) return;
    let alive = true;
    readOnboardedAt()
      .then((at) => {
        if (alive) setOnboarded(at != null);
      })
      .catch(() => {
        if (alive) setOnboarded(false);
      });
    return () => {
      alive = false;
    };
  }, [loading, session]);

  if (loading || onboarded === null) {
    return (
      <div className="grid min-h-full place-items-center bg-bg text-ink3" role="status" aria-label="Loading">
        <span
          className="block h-8 w-8 rounded-full border-[3px] border-line border-t-accent"
          style={{ animation: 'rk-spin 0.9s linear infinite' }}
        />
      </div>
    );
  }
  if (!onboarded) {
    return <Navigate to="/setup" replace />;
  }
  return <>{children}</>;
}
