import { CATEGORY_LABELS, CATEGORY_ORDER, phaseLine, type Pattern } from './patterns';

/** One block of the Patterns sheet. `key` is stable so a test (and a screen reader) can name it. */
export type PatternSection = { key: string; title: string; items: Pattern[] };

/** Lower-cases, trims and collapses whitespace so "  Long  EXHALE " matches "long exhale". */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** What a search looks at: name, category, phase line, "holds", difficulty. Every word of the query must match. */
export function matchesQuery(pattern: Pattern, query: string): boolean {
  const q = normalizeQuery(query);
  if (q === '') return true;
  const haystack = [
    pattern.name,
    pattern.category ? CATEGORY_LABELS[pattern.category] : 'your patterns custom',
    pattern.difficulty ?? '',
    phaseLine(pattern.phases),
    pattern.hasHolds ? 'holds breath-holds' : '',
  ]
    .join(' ')
    .toLowerCase();
  return q.split(' ').every((word) => haystack.includes(word));
}

/**
 * Sections for the Patterns sheet. Without a query: Favourites first, then the presets by category,
 * then the user's own patterns. With a query: one "Results" list, favourites first. A pattern is
 * listed once, so its row's testIDs stay unique.
 */
export function buildPatternSections(
  presets: readonly Pattern[],
  custom: readonly Pattern[],
  favoriteIds: ReadonlySet<string>,
  query = ''
): PatternSection[] {
  const all = [...presets, ...custom];
  const favorites = all.filter((p) => favoriteIds.has(p.id));
  const others = all.filter((p) => !favoriteIds.has(p.id));

  if (normalizeQuery(query) !== '') {
    const items = [...favorites, ...others].filter((p) => matchesQuery(p, query));
    return items.length > 0 ? [{ key: 'results', title: 'Results', items }] : [];
  }

  const sections: PatternSection[] = [];
  if (favorites.length > 0) sections.push({ key: 'favorites', title: 'Favourites', items: favorites });
  for (const category of CATEGORY_ORDER) {
    const items = others.filter((p) => p.category === category);
    if (items.length > 0) sections.push({ key: category, title: CATEGORY_LABELS[category], items });
  }
  const mine = others.filter((p) => !p.category);
  if (mine.length > 0) sections.push({ key: 'mine', title: 'Your patterns', items: mine });
  return sections;
}
