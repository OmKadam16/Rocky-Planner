// Memory: the trust line and the recorder state. Memory data lives in SQLite
// on this laptop and is never uploaded — so there is nothing to fetch here.
// No fake results, ever.

import { Link } from 'react-router';
import { MicOff, Search, ShieldCheck } from 'lucide-react';
import { Card, CardTitle, PageHeader } from '../components/Page';

export function MemoryPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8">
      <PageHeader
        title="Memory"
        sub="What you read and searched, answerable later — privately."
      />
      <Card>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-success-soft text-success">
            <ShieldCheck size={18} aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-[15px] font-bold">Your memory never leaves this laptop.</span>
            <span className="text-sm leading-relaxed text-ink2">
              Pages you dwell on are stored in a database on this machine only.
              Search results and page text are never uploaded to the relay or
              any cloud AI. See <Link to="/settings/privacy" className="font-semibold text-accent-ink">Settings → Privacy</Link> for
              exactly what leaves this laptop.
            </span>
          </div>
        </div>
      </Card>
      <Card labelledBy="memory-status">
        <CardTitle id="memory-status">Recorder</CardTitle>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-surface2 text-ink3">
            <MicOff size={18} aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-[15px] font-bold">Recording off</span>
            <span className="text-sm leading-relaxed text-ink2">
              Nothing is being captured. Recording starts when the brain runs on
              this laptop with the Rocky Chrome extension installed.
            </span>
          </div>
        </div>
      </Card>
      <Card labelledBy="memory-search">
        <CardTitle id="memory-search">Ask your memory</CardTitle>
        <label className="flex items-center gap-2.5 rounded-xl border border-line bg-surface2 px-3.5 opacity-60">
          <Search size={17} aria-hidden className="shrink-0 text-ink3" />
          <input
            disabled
            placeholder="“What was I reading on Wednesday?”"
            aria-label="Ask your memory (coming in the next build)"
            className="h-12 w-full bg-transparent text-[15px] text-ink1 outline-none placeholder:text-ink4"
          />
        </label>
        <p className="text-sm text-ink3">Memory search lands in the next build.</p>
      </Card>
    </div>
  );
}
