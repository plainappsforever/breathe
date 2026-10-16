import { addDays } from './stats';

/** "2026-09-30" (also 2026-9-3) as local midnight, or null if it is not a real calendar date. */
export function parseDateText(text: string): number | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date.getTime();
}

export type RangeResult = { ok: true; from: number; toExclusive: number } | { ok: false; error: string };

/** Both days are included: "2026-09-01" to "2026-09-30" covers all of the 30th. */
export function rangeFromText(fromText: string, toText: string): RangeResult {
  const from = parseDateText(fromText);
  const to = parseDateText(toText);
  if (from === null || to === null) return { ok: false, error: 'Write both dates as year-month-day, for example 2026-09-30.' };
  if (to < from) return { ok: false, error: 'The last day comes before the first day.' };
  return { ok: true, from, toExclusive: addDays(to, 1) };
}
