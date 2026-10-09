import type { LucideIcon } from 'lucide-react';

const tones: Record<string, { bg: string; fg: string }> = {
  accent: { bg: 'var(--accent-soft)', fg: 'var(--accent-ink)' },
  success: { bg: 'var(--success-soft)', fg: 'var(--success)' },
  warning: { bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
};

export function StatusBadge({
  tone = 'accent',
  icon: Icon,
  children,
}: {
  tone?: keyof typeof tones;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  const t = tones[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: t.bg, color: t.fg }}
    >
      {Icon ? <Icon size={14} aria-hidden /> : null}
      {children}
    </span>
  );
}
