import { buildPatternSections, matchesQuery, normalizeQuery } from './pattern-list';
import { patternFromPhases, PRESETS } from './patterns';

const custom = [
  patternFromPhases('c_one', 'Evening walk', [
    { kind: 'inhale', seconds: 3 },
    { kind: 'exhale', seconds: 5 },
  ]),
  patternFromPhases('c_two', 'My hold', [
    { kind: 'inhale', seconds: 3 },
    { kind: 'hold', seconds: 2 },
    { kind: 'exhale', seconds: 5 },
  ]),
];
const noFavorites = new Set<string>();
const ids = (sections: { items: { id: string }[] }[]) => sections.flatMap((s) => s.items.map((i) => i.id));

describe('pattern list sections', () => {
  it('groups presets by category in order, then your patterns', () => {
    const sections = buildPatternSections(PRESETS, custom, noFavorites);
    expect(sections.map((s) => s.key)).toEqual(['calm', 'wind-down', 'steady', 'mine']);
    expect(sections[0].items.map((p) => p.id)).toEqual(['slow', 'sigh', 'short-sigh']);
    expect(sections[1].items.map((p) => p.id)).toEqual(['4-7-8', 'long-exhale']);
    expect(sections[3].items.map((p) => p.id)).toEqual(['c_one', 'c_two']);
  });

  it('lists every pattern exactly once', () => {
    const all = ids(buildPatternSections(PRESETS, custom, new Set(['box', 'c_two'])));
    expect(all.sort()).toEqual([...PRESETS.map((p) => p.id), 'c_one', 'c_two'].sort());
  });

  it('puts favourites first and removes them from their category', () => {
    const sections = buildPatternSections(PRESETS, custom, new Set(['box', 'c_two', 'slow']));
    expect(sections[0].key).toBe('favorites');
    expect(sections[0].items.map((p) => p.id)).toEqual(['slow', 'box', 'c_two']);
    expect(sections.find((s) => s.key === 'calm')!.items.map((p) => p.id)).not.toContain('slow');
    expect(sections.find((s) => s.key === 'mine')!.items.map((p) => p.id)).toEqual(['c_one']);
  });

  it('drops empty sections', () => {
    const sections = buildPatternSections(PRESETS, [], noFavorites);
    expect(sections.map((s) => s.key)).toEqual(['calm', 'wind-down', 'steady']);
  });

  it('ignores a favourite id that no longer exists (a deleted custom pattern)', () => {
    const sections = buildPatternSections(PRESETS, [], new Set(['c_gone']));
    expect(sections[0].key).toBe('calm');
  });
});

describe('pattern search', () => {
  const search = (q: string) => ids(buildPatternSections(PRESETS, custom, noFavorites, q));

  it('normalizes whitespace and case', () => {
    expect(normalizeQuery('  Long   EXHALE ')).toBe('long exhale');
  });

  it('finds by name, ignoring case and extra spaces', () => {
    expect(search('long exhale')).toEqual(['long-exhale']);
    expect(search('  BOX ')).toEqual(expect.arrayContaining(['box', 'easy-box']));
  });

  it('finds by category, difficulty and holds', () => {
    expect(search('wind down').sort()).toEqual(['4-7-8', 'long-exhale']);
    expect(search('calm')).toEqual(expect.arrayContaining(['slow', 'sigh', 'short-sigh']));
    expect(search('moderate').sort()).toEqual(['4-7-8', 'box', 'sigh', 'triangle']);
    expect(search('holds')).toEqual(expect.arrayContaining(['box', '4-7-8', 'triangle', 'easy-box', 'c_two']));
    expect(search('holds')).not.toContain('slow');
  });

  it('finds custom patterns and requires every word to match', () => {
    expect(search('evening')).toEqual(['c_one']);
    expect(search('box calm')).toEqual([]);
  });

  it('returns one Results section, favourites first, or nothing', () => {
    const sections = buildPatternSections(PRESETS, custom, new Set(['easy-box']), 'box');
    expect(sections.map((s) => s.key)).toEqual(['results']);
    expect(sections[0].items.map((p) => p.id)).toEqual(['easy-box', 'box']);
    expect(buildPatternSections(PRESETS, custom, noFavorites, 'zzz')).toEqual([]);
  });

  it('empty query matches everything', () => {
    expect(matchesQuery(PRESETS[0], '')).toBe(true);
    expect(matchesQuery(PRESETS[0], '   ')).toBe(true);
  });
});
