import {
  filterSessions,
  isFiltering,
  MAX_NOTE_LENGTH,
  MAX_TAGS,
  NO_FILTER,
  normalizeNote,
  parseTags,
  patternChoices,
  patternKey,
  serializeTags,
  tagChoices,
  type FilterableSession,
} from './history-filter';

const s = (patternId: string | null, patternName: string, note = '', tags = ''): FilterableSession => ({ patternId, patternName, note, tags });

describe('tags', () => {
  it('normalizes: lower case, trimmed, no empties or duplicates', () => {
    expect(parseTags(' Before Bed,work ,, WORK,  before   bed ')).toEqual(['before bed', 'work']);
    expect(parseTags('')).toEqual([]);
  });

  it('caps the count and the length', () => {
    expect(parseTags('a,b,c,d,e,f,g,h,i,j')).toHaveLength(MAX_TAGS);
    expect(parseTags('x'.repeat(60))[0]).toHaveLength(24);
  });

  it('round-trips through the stored string', () => {
    expect(parseTags(serializeTags(['a b', 'c']))).toEqual(['a b', 'c']);
    expect(serializeTags([])).toBe('');
  });

  it('trims and caps a note', () => {
    expect(normalizeNote('  hello \n')).toBe('hello');
    expect(normalizeNote('x'.repeat(MAX_NOTE_LENGTH + 50))).toHaveLength(MAX_NOTE_LENGTH);
  });
});

describe('filterSessions', () => {
  const list = [
    s('slow', 'Slow', 'Felt calmer after lunch', 'work,lunch'),
    s('box', 'Box', 'Before the meeting', 'work'),
    s(null, 'Old one', '', ''),
    s('c_1', 'Evening', 'quiet night', 'bed'),
  ];

  it('returns everything without a filter', () => {
    expect(filterSessions(list, NO_FILTER)).toHaveLength(4);
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(isFiltering({ ...NO_FILTER, query: '  ' })).toBe(false);
    expect(isFiltering({ ...NO_FILTER, tag: 'work' })).toBe(true);
  });

  it('filters by pattern (by id, or by name for v1 sessions)', () => {
    expect(filterSessions(list, { ...NO_FILTER, pattern: 'box' }).map((x) => x.patternName)).toEqual(['Box']);
    expect(filterSessions(list, { ...NO_FILTER, pattern: patternKey(list[2]) }).map((x) => x.patternName)).toEqual(['Old one']);
  });

  it('filters by tag', () => {
    expect(filterSessions(list, { ...NO_FILTER, tag: 'work' })).toHaveLength(2);
    expect(filterSessions(list, { ...NO_FILTER, tag: 'lun' })).toHaveLength(0);
  });

  it('searches notes, tags and the pattern name; every word must match', () => {
    expect(filterSessions(list, { ...NO_FILTER, query: 'CALMER' })).toHaveLength(1);
    expect(filterSessions(list, { ...NO_FILTER, query: 'meeting box' })).toHaveLength(1);
    expect(filterSessions(list, { ...NO_FILTER, query: 'meeting calmer' })).toHaveLength(0);
    expect(filterSessions(list, { ...NO_FILTER, query: 'bed' })).toHaveLength(1);
  });

  it('combines filters', () => {
    expect(filterSessions(list, { pattern: 'slow', tag: 'work', query: 'lunch' })).toHaveLength(1);
    expect(filterSessions(list, { pattern: 'box', tag: 'work', query: 'lunch' })).toHaveLength(0);
  });
});

describe('choices for the filter chips', () => {
  it('lists patterns and tags, most used first', () => {
    const list = [s('a', 'A', '', 'x,y'), s('b', 'B', '', 'y'), s('b', 'B', '', 'y,z'), s(null, 'Old')];
    expect(patternChoices(list).map((c) => [c.name, c.count])).toEqual([['B', 2], ['A', 1], ['Old', 1]]);
    expect(tagChoices(list)).toEqual([
      { tag: 'y', count: 3 },
      { tag: 'x', count: 1 },
      { tag: 'z', count: 1 },
    ]);
  });
});
