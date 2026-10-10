// Proper 404: unknown paths land here, inside the app shell when signed in.

import { Link } from 'react-router';
import { Compass } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 px-6 py-20 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-surface2 text-ink2">
        <Compass size={26} aria-hidden />
      </span>
      <h1 className="text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="max-w-[380px] text-[15px] leading-relaxed text-ink2">
        That address doesn&apos;t match anything in Rocky. The dashboard is a
        safe place to restart from.
      </p>
      <Link
        to="/dashboard"
        className="mt-2 inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-bold text-white"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
