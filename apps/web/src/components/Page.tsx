// Shared page furniture: header, card, empty state. Same tokens everywhere.

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-[32px] md:leading-[1.15]">
          {title}
        </h1>
        {sub && <p className="mt-1.5 max-w-[560px] text-[15px] leading-relaxed text-ink2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  labelledBy,
}: {
  children: ReactNode;
  labelledBy?: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 md:p-5"
    >
      {children}
    </section>
  );
}

export function CardTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="text-[15px] font-bold tracking-tight">
      {children}
    </h2>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-8 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-surface2 text-ink3">
        <Icon size={20} aria-hidden />
      </span>
      <p className="text-[15px] font-bold">{title}</p>
      <p className="max-w-[380px] text-sm leading-relaxed text-ink2">{body}</p>
      {action}
    </div>
  );
}
