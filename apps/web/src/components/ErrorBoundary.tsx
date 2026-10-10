import { Component, type ReactNode } from 'react';

/**
 * Root error boundary: a render crash anywhere (e.g. a Realtime channel
 * throwing mid-subscribe) shows a recoverable screen instead of a blank page.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(e: unknown): { error: string } {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  componentDidCatch(e: unknown): void {
    console.error('[rocky] render crash:', e);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center gap-3 px-6 py-20 text-center">
          <h1 className="text-xl font-bold tracking-tight">Something went wrong</h1>
          <p className="max-w-[300px] text-sm leading-relaxed text-ink2">
            Rocky hit a snag rendering this screen. Your data is safe.
          </p>
          <p className="max-w-[320px] break-words rounded-xl border border-line bg-surface p-3 font-mono text-[11px] text-ink3">
            {this.state.error}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="inline-flex h-12 items-center rounded-2xl bg-accent px-6 text-[15px] font-bold text-white"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
