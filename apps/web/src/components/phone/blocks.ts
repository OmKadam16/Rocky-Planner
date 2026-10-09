import type { EventKind, Occurrence, Priority } from '@rocky/core';

/** Calendar token prefix per event kind (matches tokens.css families). */
export function kindPrefix(kind: EventKind): 'cls' | 'com' | 'stu' | 'per' | 'brk' {
  switch (kind) {
    case 'class':
      return 'cls';
    case 'commitment':
      return 'com';
    case 'study':
      return 'stu';
    case 'personal':
      return 'per';
    case 'break':
      return 'brk';
  }
}

export function kindLabel(kind: EventKind): string {
  switch (kind) {
    case 'class':
      return 'Class';
    case 'commitment':
      return 'Commitment';
    case 'study':
      return 'Study';
    case 'personal':
      return 'Personal';
    case 'break':
      return 'Break';
  }
}

export function priorityMeta(p: Priority): { color: string; label: string } {
  switch (p) {
    case 'high':
      return { color: 'var(--danger)', label: 'High' };
    case 'med':
      return { color: 'var(--warning)', label: 'Medium' };
    case 'low':
      return { color: 'var(--ink3)', label: 'Low' };
  }
}

/** Day timeline geometry (mobile design: 56 px per hour). */
export const PX_PER_HOUR = 56;

export function blockTopPx(startMin: number): number {
  return (startMin / 60) * PX_PER_HOUR + 1;
}

export function blockHeightPx(startMin: number, endMin: number): number {
  return Math.max(24, ((endMin - startMin) / 60) * PX_PER_HOUR - 3);
}

export function isNowLive(o: Occurrence, date: string, nowMin: number): boolean {
  return o.date === date && o.startMin <= nowMin && nowMin < o.endMin;
}

export function nextUp(list: Occurrence[], nowMin: number): Occurrence | null {
  const upcoming = list.filter((o) => o.endMin > nowMin).sort((a, b) => a.startMin - b.startMin);
  return upcoming[0] ?? null;
}
