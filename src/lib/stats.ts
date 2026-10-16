// History numbers (V3 P5). Pure functions over a list of sessions; every day is a local calendar day.
// Nothing here scores or judges: totals, averages and plain counts only.

export type StatSession = {
  startedAt: number;
  actualSeconds: number;
  breaths: number;
  patternId: string | null;
  patternName: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight at the start of the day containing `ms`. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** `dayStart` moved by `days` calendar days (DST safe). */
export function addDays(dayStart: number, days: number): number {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

/** A whole number that increases by one per local calendar day (not affected by DST). */
export function dayNumber(ms: number): number {
  const d = new Date(ms);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/** Monday of the week containing `ms`, at local midnight. */
export function startOfWeek(ms: number): number {
  const day = startOfDay(ms);
  const weekday = (new Date(day).getDay() + 6) % 7; // Monday = 0
  return addDays(day, -weekday);
}

export type Period = 'day' | 'week' | 'month' | 'year' | 'all';
export const PERIODS: readonly Period[] = ['day', 'week', 'month', 'year', 'all'];

export type Range = { from: number; to: number };

/** The current day / week (from Monday) / month / year, up to the end of today. `all` starts at 0. */
export function periodRange(period: Period, now: number): Range {
  const today = startOfDay(now);
  const to = addDays(today, 1);
  const d = new Date(today);
  switch (period) {
    case 'day':
      return { from: today, to };
    case 'week':
      return { from: startOfWeek(now), to };
    case 'month':
      return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to };
    case 'year':
      return { from: new Date(d.getFullYear(), 0, 1).getTime(), to };
    default:
      return { from: 0, to };
  }
}

export type Totals = {
  sessions: number;
  seconds: number;
  /** Minutes with one decimal. */
  minutes: number;
  breaths: number;
  avgSessionSeconds: number;
  avgBreathsPerSession: number;
  /** Average over the days of the range that have started (for `all`, from the first session's day). */
  avgSecondsPerDay: number;
  daysPracticed: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function totalsFor(sessions: readonly StatSession[], range: Range, now: number): Totals {
  const inRange = sessions.filter((s) => s.startedAt >= range.from && s.startedAt < range.to);
  const seconds = inRange.reduce((sum, s) => sum + s.actualSeconds, 0);
  const breaths = inRange.reduce((sum, s) => sum + s.breaths, 0);
  const days = new Set(inRange.map((s) => dayNumber(s.startedAt)));
  const firstMs = range.from > 0 ? range.from : inRange.length ? Math.min(...inRange.map((s) => s.startedAt)) : now;
  const spanDays = Math.max(1, dayNumber(Math.min(now, range.to - 1)) - dayNumber(firstMs) + 1);
  return {
    sessions: inRange.length,
    seconds,
    minutes: round1(seconds / 60),
    breaths,
    avgSessionSeconds: inRange.length ? seconds / inRange.length : 0,
    avgBreathsPerSession: inRange.length ? round1(breaths / inRange.length) : 0,
    avgSecondsPerDay: inRange.length ? seconds / spanDays : 0,
    daysPracticed: days.size,
  };
}

export function totalsForPeriod(sessions: readonly StatSession[], period: Period, now: number): Totals {
  return totalsFor(sessions, periodRange(period, now), now);
}

/** The pattern used in most sessions (ties: more time, then name). */
export function mostUsedPattern(sessions: readonly StatSession[]): { name: string; sessions: number } | null {
  const groups = new Map<string, { name: string; sessions: number; seconds: number }>();
  for (const s of sessions) {
    const key = s.patternId ?? `name:${s.patternName}`;
    const g = groups.get(key) ?? { name: s.patternName, sessions: 0, seconds: 0 };
    g.sessions += 1;
    g.seconds += s.actualSeconds;
    g.name = s.patternName;
    groups.set(key, g);
  }
  const best = [...groups.values()].sort((a, b) => b.sessions - a.sessions || b.seconds - a.seconds || a.name.localeCompare(b.name))[0];
  return best ? { name: best.name, sessions: best.sessions } : null;
}

export function longestSession<T extends StatSession>(sessions: readonly T[]): T | null {
  let best: T | null = null;
  for (const s of sessions) if (!best || s.actualSeconds > best.actualSeconds) best = s;
  return best;
}

/** How many of the last `n` days (including today) have at least one session. */
export function daysPracticedInLast(sessions: readonly StatSession[], now: number, n: number): number {
  const today = dayNumber(now);
  const days = new Set<number>();
  for (const s of sessions) {
    const d = dayNumber(s.startedAt);
    if (d <= today && d > today - n) days.add(d);
  }
  return days.size;
}

/**
 * The current run of practised days, with one grace day: a single missed day does not end the run, two in a
 * row do. Today is not counted as missed until it is over. Returns the number of practised days in the run
 * (0 when the last session is more than one missed day ago).
 */
export function currentRun(sessions: readonly StatSession[], now: number): number {
  const today = dayNumber(now);
  const days = [...new Set(sessions.map((s) => dayNumber(s.startedAt)).filter((d) => d <= today))].sort((a, b) => b - a);
  if (days.length === 0) return 0;
  if (today - 1 - days[0] > 1) return 0; // two or more whole days missed since the last session
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i - 1] - days[i] - 1 > 1) break; // more than one missed day between these two
    run += 1;
  }
  return run;
}

export type DayBucket = { dayStart: number; minutes: number; sessions: number };

/** Minutes per day for the last `days` days, oldest first, ending today. */
export function dailyMinutes(sessions: readonly StatSession[], now: number, days: number): DayBucket[] {
  const today = startOfDay(now);
  const buckets: DayBucket[] = [];
  const index = new Map<number, DayBucket>();
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = addDays(today, -i);
    const bucket = { dayStart, minutes: 0, sessions: 0 };
    buckets.push(bucket);
    index.set(dayNumber(dayStart), bucket);
  }
  for (const s of sessions) {
    const bucket = index.get(dayNumber(s.startedAt));
    if (bucket) {
      bucket.minutes += s.actualSeconds / 60;
      bucket.sessions += 1;
    }
  }
  for (const b of buckets) b.minutes = round1(b.minutes);
  return buckets;
}

/** 0 = nothing that day, 1-4 = a little to a lot (plain steps, not a target). */
export function heatLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (minutes < 3) return 1;
  if (minutes < 6) return 2;
  if (minutes < 11) return 3;
  return 4;
}

export type HeatCell = { dayStart: number; minutes: number; sessions: number; level: 0 | 1 | 2 | 3 | 4; future: boolean };

/** `weeks` columns (oldest first), each Monday to Sunday; the last column is this week. */
export function heatmap(sessions: readonly StatSession[], now: number, weeks = 12): HeatCell[][] {
  const thisMonday = startOfWeek(now);
  const firstMonday = addDays(thisMonday, -7 * (weeks - 1));
  const today = startOfDay(now);
  const minutesByDay = new Map<number, { minutes: number; sessions: number }>();
  for (const s of sessions) {
    const key = dayNumber(s.startedAt);
    const entry = minutesByDay.get(key) ?? { minutes: 0, sessions: 0 };
    entry.minutes += s.actualSeconds / 60;
    entry.sessions += 1;
    minutesByDay.set(key, entry);
  }
  const columns: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const dayStart = addDays(firstMonday, w * 7 + d);
      const entry = minutesByDay.get(dayNumber(dayStart)) ?? { minutes: 0, sessions: 0 };
      const minutes = round1(entry.minutes);
      column.push({ dayStart, minutes, sessions: entry.sessions, level: heatLevel(minutes), future: dayStart > today });
    }
    columns.push(column);
  }
  return columns;
}

export type Milestone = { id: string; label: string; reachedAt: number };

const SESSION_MILESTONES = [1, 10, 25, 50, 100, 250, 500];
const MINUTE_MILESTONES = [60, 300, 600, 1500, 3000];
const DAY_MILESTONES = [7, 30, 100];

function sessionsLabel(n: number): string {
  return n === 1 ? 'First session' : `${n} sessions`;
}

function minutesLabel(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'} of breathing` : `${minutes} minutes of breathing`;
}

/**
 * Quiet milestones already reached, oldest first. Only what has happened is listed: no targets, no
 * progress towards the next one, nothing lost when a day is skipped.
 */
export function milestones(sessions: readonly StatSession[]): Milestone[] {
  const ordered = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  const out: Milestone[] = [];
  for (const n of SESSION_MILESTONES) {
    if (ordered.length >= n) out.push({ id: `sessions-${n}`, label: sessionsLabel(n), reachedAt: ordered[n - 1].startedAt });
  }
  let cumulative = 0;
  const minutePending = [...MINUTE_MILESTONES];
  const seenDays = new Set<number>();
  const dayPending = [...DAY_MILESTONES];
  for (const s of ordered) {
    cumulative += s.actualSeconds / 60;
    while (minutePending.length && cumulative >= minutePending[0]) {
      const m = minutePending.shift()!;
      out.push({ id: `minutes-${m}`, label: minutesLabel(m), reachedAt: s.startedAt });
    }
    seenDays.add(dayNumber(s.startedAt));
    while (dayPending.length && seenDays.size >= dayPending[0]) {
      const d = dayPending.shift()!;
      out.push({ id: `days-${d}`, label: `${d} days practised`, reachedAt: s.startedAt });
    }
  }
  return out.sort((a, b) => a.reachedAt - b.reachedAt || a.id.localeCompare(b.id));
}
