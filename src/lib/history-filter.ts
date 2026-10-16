// Tags, notes and the History filters (V3 P5). Pure.

export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 24;
export const MAX_NOTE_LENGTH = 2000;

/** "Before bed, Work ,work" -> ['before bed', 'work']. Lower case, no empties, no duplicates, capped. */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const tag = raw.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, MAX_TAG_LENGTH).trim();
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

/** Tags are stored as one comma separated string (the `sessions.tags` column). */
export function serializeTags(tags: readonly string[]): string {
  return tags.join(',');
}

export function normalizeNote(note: string): string {
  return note.trim().slice(0, MAX_NOTE_LENGTH);
}

export type FilterableSession = { patternId: string | null; patternName: string; note: string; tags: string };

export type HistoryFilter = {
  /** A pattern id, or 'name:<name>' for sessions saved without an id (v1). null = every pattern. */
  pattern: string | null;
  tag: string | null;
  query: string;
};

export const NO_FILTER: HistoryFilter = { pattern: null, tag: null, query: '' };

export function patternKey(session: Pick<FilterableSession, 'patternId' | 'patternName'>): string {
  return session.patternId ?? `name:${session.patternName}`;
}

export function isFiltering(filter: HistoryFilter): boolean {
  return filter.pattern !== null || filter.tag !== null || filter.query.trim() !== '';
}

/** Every word of the query must appear in the note, the tags or the pattern name (case-insensitive). */
export function filterSessions<T extends FilterableSession>(sessions: readonly T[], filter: HistoryFilter): T[] {
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  return sessions.filter((s) => {
    if (filter.pattern !== null && patternKey(s) !== filter.pattern) return false;
    if (filter.tag !== null && !parseTags(s.tags).includes(filter.tag)) return false;
    if (words.length === 0) return true;
    const haystack = `${s.note} ${s.tags} ${s.patternName}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

/** Distinct patterns in the list, most used first, for the filter chips. */
export function patternChoices(sessions: readonly Pick<FilterableSession, 'patternId' | 'patternName'>[]): { key: string; name: string; count: number }[] {
  const groups = new Map<string, { key: string; name: string; count: number }>();
  for (const s of sessions) {
    const key = patternKey(s);
    const g = groups.get(key) ?? { key, name: s.patternName, count: 0 };
    g.count += 1;
    g.name = s.patternName;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Distinct tags in the list, most used first. */
export function tagChoices(sessions: readonly Pick<FilterableSession, 'tags'>[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of sessions) for (const tag of parseTags(s.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
