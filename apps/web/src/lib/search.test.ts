import { describe, expect, it } from 'vitest';
import { filterSearchItems, type SearchItem } from './search';

const ITEMS: SearchItem[] = [
  { id: '1', title: 'Gym session', sub: 'Personal', path: '/calendar' },
  { id: '2', title: 'Gym bag checklist', sub: 'Tasks', path: '/tasks' },
  { id: '3', title: 'Biology Lecture', sub: 'BIOL 101', path: '/calendar' },
  { id: '4', title: 'Chem lab report', sub: 'CHEM 111L', path: '/classes' },
];

describe('filterSearchItems (⌘K palette)', () => {
  it('returns nothing for a blank query', () => {
    expect(filterSearchItems(ITEMS, '')).toEqual([]);
    expect(filterSearchItems(ITEMS, '   ')).toEqual([]);
  });

  it('ranks title-prefix matches before substring matches', () => {
    const res = filterSearchItems(ITEMS, 'gym');
    expect(res.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('matches subtitles case-insensitively and caps results', () => {
    expect(filterSearchItems(ITEMS, 'biol').map((r) => r.id)).toEqual(['3']);
    expect(filterSearchItems(ITEMS, 'chem 111l').map((r) => r.id)).toEqual(['4']);
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `${i}`,
      title: `Gym ${i}`,
      sub: null,
      path: '/calendar',
    }));
    expect(filterSearchItems(many, 'gym')).toHaveLength(8);
  });
});
