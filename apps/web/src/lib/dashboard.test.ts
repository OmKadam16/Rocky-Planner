import { describe, expect, it } from 'vitest';
import type { Assignment, Occurrence } from '@rocky/core';
import {
  dueChipLabel,
  dueLabel,
  dueSoonAssignments,
  formatClock,
  greetingForHour,
  leaveByLabel,
  nextUpCountdown,
  nextUpCountdownShort,
  nextUpOccurrence,
  urgencyFor,
} from './dashboard';

function occ(id: string, startMin: number, endMin: number): Occurrence {
  return {
    id,
    eventId: id,
    occurrenceDate: '2026-10-10',
    date: '2026-10-10',
    startMin,
    endMin,
    title: id,
    subtitle: null,
    kind: 'study',
    fixed: false,
    priority: 'med',
    travelMin: 0,
    classId: null,
    recurring: false,
    moved: false,
    event: {} as Occurrence['event'],
  };
}

function asg(id: string, due_at: string | null, status: Assignment['status'] = 'todo'): Assignment {
  return {
    id,
    user_id: 'u',
    class_id: null,
    title: id,
    status,
    due_at,
    created_at: '2026-10-01T00:00:00Z',
  };
}

describe('greetingForHour', () => {  it('splits the day at noon and 6pm', () => {
    expect(greetingForHour(0)).toBe('Good morning');
    expect(greetingForHour(11)).toBe('Good morning');
    expect(greetingForHour(12)).toBe('Good afternoon');
    expect(greetingForHour(17)).toBe('Good afternoon');
    expect(greetingForHour(18)).toBe('Good evening');
    expect(greetingForHour(23)).toBe('Good evening');
  });
});

describe('nextUpOccurrence', () => {
  it('returns the first not-yet-ended occurrence', () => {
    const list = [occ('a', 540, 600), occ('b', 660, 720), occ('c', 780, 840)];
    expect(nextUpOccurrence(list, 500)?.id).toBe('a');
    expect(nextUpOccurrence(list, 600)?.id).toBe('b'); // a just ended
    expect(nextUpOccurrence(list, 700)?.id).toBe('b'); // b still running
    expect(nextUpOccurrence(list, 720)?.id).toBe('c'); // b just ended
    expect(nextUpOccurrence(list, 900)).toBeNull();
    expect(nextUpOccurrence([], 500)).toBeNull();
  });
});

describe('dueSoonAssignments', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const iso = (s: string) => new Date(s).toISOString();

  it('keeps open assignments due within 7 days, overdue first', () => {
    const list = [
      asg('far', iso('2026-11-01T00:00:00Z')),
      asg('done', iso('2026-10-11T00:00:00Z'), 'done'),
      asg('nodate', null),
      asg('soon', iso('2026-10-12T00:00:00Z')),
      asg('late', iso('2026-10-09T00:00:00Z')),
    ];
    expect(dueSoonAssignments(list, now).map((a) => a.id)).toEqual(['late', 'soon']);
  });
});

describe('nextUpCountdown + leaveByLabel (Next-up card)', () => {
  it('counts down in MIN / H M, NOW when started', () => {
    expect(nextUpCountdown(750, 642)).toBe('IN 1H 48M');
    expect(nextUpCountdown(660, 642)).toBe('IN 18 MIN');
    expect(nextUpCountdown(642, 642)).toBe('NOW');
    expect(nextUpCountdown(600, 642)).toBe('NOW');
  });

  it('labels the leave-by time from the travel buffer', () => {
    expect(leaveByLabel(750, 15)).toBe('Leave by 12:15 · 15 min walk');
  });

  it('counts down lowercase for the phone NEXT pill', () => {
    expect(nextUpCountdownShort(750, 642)).toBe('in 1h 48m');
    expect(nextUpCountdownShort(660, 642)).toBe('in 18 min');
    expect(nextUpCountdownShort(642, 642)).toBe('now');
  });
});

describe('urgencyFor + dueChipLabel (Due-soon chips)', () => {
  // Local components keep this green in any timezone.
  const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();
  const now = at(10, 12);

  it('marks today/overdue danger, 3 days warning, later neutral', () => {
    expect(urgencyFor(at(10, 23), now)).toBe('danger');
    expect(urgencyFor(at(9, 9), now)).toBe('danger');
    expect(urgencyFor(at(12, 9), now)).toBe('warning');
    expect(urgencyFor(at(13, 9), now)).toBe('warning');
    expect(urgencyFor(at(14, 9), now)).toBe('neutral');
  });

  it('labels chips like the design', () => {
    expect(dueChipLabel(new Date(at(10, 23, 59)).toISOString(), now)).toBe('Tonight 11:59 PM');
    expect(dueChipLabel(new Date(at(9, 9)).toISOString(), now)).toBe('Overdue');
    expect(dueChipLabel(new Date(at(12, 9)).toISOString(), now)).toBe('Mon, Oct 12');
    expect(dueChipLabel(new Date(at(14, 9)).toISOString(), now)).toBe('Wed, Oct 14');
    expect(dueChipLabel('junk', now)).toBe('');
  });
});
describe('dueLabel', () => {
  // Built from local components so the test holds in any timezone.
  const local = (day: number, hour: number) =>
    new Date(2026, 9, day, hour, 0).toISOString();
  const now = new Date(2026, 9, 10, 12, 0).getTime(); // Oct 10, noon local

  it('labels overdue, today and tomorrow', () => {
    expect(dueLabel(local(9, 9), now)).toBe('Overdue');
    expect(dueLabel(local(10, 18), now)).toBe('Due today');
    expect(dueLabel(local(11, 9), now)).toBe('Due tomorrow');
  });

  it('labels later dates with a real date, never empty for valid input', () => {
    const label = dueLabel(local(20, 9), now);
    expect(label.startsWith('Due ')).toBe(true);
    expect(dueLabel('not-a-date', now)).toBe('');
  });
});

describe('formatClock (Today-list time column)', () => {
  it('formats minutes since midnight as 12-hour time', () => {
    expect(formatClock(540)).toBe('9:00 AM');
    expect(formatClock(600)).toBe('10:00 AM');
    expect(formatClock(750)).toBe('12:30 PM');
    expect(formatClock(0)).toBe('12:00 AM');
    expect(formatClock(1439)).toBe('11:59 PM');
  });
});
