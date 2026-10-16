import {
  addDays,
  currentRun,
  dailyMinutes,
  dayNumber,
  daysPracticedInLast,
  heatLevel,
  heatmap,
  longestSession,
  milestones,
  mostUsedPattern,
  periodRange,
  startOfWeek,
  totalsForPeriod,
  type StatSession,
} from './stats';

// Wednesday 2026-09-30, 14:00 local time. Every date below is built from local components, so the tests
// do not depend on the machine's time zone.
const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 9, 30, 14);

function session(when: number, seconds = 180, extra: Partial<StatSession> = {}): StatSession {
  return { startedAt: when, actualSeconds: seconds, breaths: Math.round(seconds / 10), patternId: 'slow', patternName: 'Slow', ...extra };
}

describe('day helpers', () => {
  it('numbers consecutive local days by one, across a month end', () => {
    expect(dayNumber(at(2026, 10, 1)) - dayNumber(at(2026, 9, 30, 23))).toBe(1);
    expect(dayNumber(at(2026, 3, 29, 1)) - dayNumber(at(2026, 3, 28, 23))).toBe(1);
  });

  it('starts weeks on Monday', () => {
    expect(new Date(startOfWeek(NOW)).getDate()).toBe(28); // Mon 28 Sep 2026
    expect(new Date(startOfWeek(at(2026, 9, 27, 20))).getDate()).toBe(21); // a Sunday belongs to the week before
    expect(addDays(at(2026, 9, 30, 0), 1)).toBe(new Date(2026, 9, 1).getTime());
  });

  it('gives period ranges that end at the end of today', () => {
    const week = periodRange('week', NOW);
    expect(week.from).toBe(new Date(2026, 8, 28).getTime());
    expect(week.to).toBe(new Date(2026, 9, 1).getTime());
    expect(periodRange('month', NOW).from).toBe(new Date(2026, 8, 1).getTime());
    expect(periodRange('year', NOW).from).toBe(new Date(2026, 0, 1).getTime());
    expect(periodRange('all', NOW).from).toBe(0);
    expect(periodRange('day', NOW).from).toBe(new Date(2026, 8, 30).getTime());
  });
});

describe('totalsForPeriod', () => {
  const sessions = [
    session(at(2026, 9, 30, 8), 300, { breaths: 30 }), // today
    session(at(2026, 9, 28, 8), 180, { breaths: 18 }), // Monday
    session(at(2026, 9, 27, 8), 600, { breaths: 60 }), // last week, this month
    session(at(2026, 8, 15, 8), 60, { breaths: 6 }), // last month
    session(at(2025, 12, 31, 8), 120, { breaths: 12 }), // last year
  ];

  it('totals and averages per period', () => {
    const day = totalsForPeriod(sessions, 'day', NOW);
    expect(day).toMatchObject({ sessions: 1, minutes: 5, breaths: 30, avgSessionSeconds: 300, avgBreathsPerSession: 30, daysPracticed: 1 });

    const week = totalsForPeriod(sessions, 'week', NOW);
    expect(week.sessions).toBe(2);
    expect(week.minutes).toBe(8);
    expect(week.avgSessionSeconds).toBe(240);
    expect(week.avgBreathsPerSession).toBe(24);
    expect(week.daysPracticed).toBe(2);
    expect(week.avgSecondsPerDay).toBeCloseTo(480 / 3, 5); // Mon, Tue, Wed have started

    expect(totalsForPeriod(sessions, 'month', NOW).sessions).toBe(3);
    expect(totalsForPeriod(sessions, 'year', NOW).sessions).toBe(4);
    const all = totalsForPeriod(sessions, 'all', NOW);
    expect(all.sessions).toBe(5);
    expect(all.minutes).toBe(21);
    expect(all.avgBreathsPerSession).toBe(25.2);
  });

  it('is all zeros with no sessions', () => {
    expect(totalsForPeriod([], 'all', NOW)).toEqual({
      sessions: 0,
      seconds: 0,
      minutes: 0,
      breaths: 0,
      avgSessionSeconds: 0,
      avgBreathsPerSession: 0,
      avgSecondsPerDay: 0,
      daysPracticed: 0,
    });
  });

  it('ignores sessions after today', () => {
    expect(totalsForPeriod([session(at(2026, 10, 2))], 'all', NOW).sessions).toBe(0);
  });
});

describe('most used pattern and longest session', () => {
  it('counts by pattern, ties go to more time, custom patterns count by id', () => {
    const list = [
      session(1, 100, { patternId: 'box', patternName: 'Box' }),
      session(2, 100, { patternId: 'slow', patternName: 'Slow' }),
      session(3, 500, { patternId: 'slow', patternName: 'Slow' }),
      session(4, 900, { patternId: 'box', patternName: 'Box' }),
      session(5, 10, { patternId: 'c_x', patternName: 'Mine' }),
    ];
    expect(mostUsedPattern(list)).toEqual({ name: 'Box', sessions: 2 }); // tie with Slow, Box has more time
    expect(mostUsedPattern([])).toBeNull();
    expect(mostUsedPattern([session(1, 60, { patternId: null, patternName: 'Old' })])).toEqual({ name: 'Old', sessions: 1 });
  });

  it('finds the longest session', () => {
    const list = [session(1, 100), session(2, 700), session(3, 300)];
    expect(longestSession(list)?.startedAt).toBe(2);
    expect(longestSession([])).toBeNull();
  });
});

describe('days practised and the current run', () => {
  it('counts distinct days in the last 7 and 30 days', () => {
    const list = [
      session(at(2026, 9, 30, 8)),
      session(at(2026, 9, 30, 20)), // same day
      session(at(2026, 9, 23)), // 7 days before is outside "last 7" (today + 6 days back)
      session(at(2026, 9, 25)),
      session(at(2026, 9, 1)),
      session(at(2026, 8, 31)), // outside last 30
    ];
    expect(daysPracticedInLast(list, NOW, 7)).toBe(2);
    expect(daysPracticedInLast(list, NOW, 30)).toBe(4);
  });

  it('has no run without sessions, and counts today and yesterday', () => {
    expect(currentRun([], NOW)).toBe(0);
    expect(currentRun([session(at(2026, 9, 30))], NOW)).toBe(1);
    expect(currentRun([session(at(2026, 9, 29)), session(at(2026, 9, 28))], NOW)).toBe(2); // today not over yet
  });

  it('forgives one missed day, not two', () => {
    // 30 (today), 28, 26: a single gap each time
    expect(currentRun([at(2026, 9, 30), at(2026, 9, 28), at(2026, 9, 26)].map((t) => session(t)), NOW)).toBe(3);
    // 30, 27: two missed days (28, 29) in a row -> the earlier day is not part of this run
    expect(currentRun([at(2026, 9, 30), at(2026, 9, 27)].map((t) => session(t)), NOW)).toBe(1);
    // last session two days ago (one missed day: yesterday) still counts; three days ago does not
    expect(currentRun([session(at(2026, 9, 28))], NOW)).toBe(1);
    expect(currentRun([session(at(2026, 9, 27))], NOW)).toBe(0);
  });

  it('ignores several sessions on one day', () => {
    expect(currentRun([session(at(2026, 9, 30, 7)), session(at(2026, 9, 30, 8)), session(at(2026, 9, 29))], NOW)).toBe(2);
  });
});

describe('charts', () => {
  it('buckets minutes per day, oldest first, ending today', () => {
    const buckets = dailyMinutes([session(at(2026, 9, 30), 90), session(at(2026, 9, 30, 18), 90), session(at(2026, 9, 28), 600)], NOW, 5);
    expect(buckets).toHaveLength(5);
    expect(new Date(buckets[0].dayStart).getDate()).toBe(26);
    expect(buckets[4]).toMatchObject({ minutes: 3, sessions: 2 });
    expect(buckets[2]).toMatchObject({ minutes: 10, sessions: 1 });
    expect(buckets[3]).toMatchObject({ minutes: 0, sessions: 0 });
  });

  it('steps the heat level', () => {
    expect([0, 0.5, 2.9, 3, 5.9, 6, 10.9, 11, 60].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('lays out 12 weeks of Monday-to-Sunday columns ending with this week', () => {
    const grid = heatmap([session(at(2026, 9, 30), 240), session(at(2026, 7, 13), 60)], NOW);
    expect(grid).toHaveLength(12);
    expect(grid.every((column) => column.length === 7)).toBe(true);
    expect(new Date(grid[0][0].dayStart).getDay()).toBe(1); // Monday
    const lastColumn = grid[11];
    expect(new Date(lastColumn[0].dayStart).getDate()).toBe(28);
    expect(lastColumn[2]).toMatchObject({ minutes: 4, sessions: 1, level: 2, future: false }); // Wednesday = today
    expect(lastColumn[3].future).toBe(true); // Thursday
    expect(grid.flat().filter((cell) => cell.sessions > 0)).toHaveLength(2);
  });
});

describe('milestones', () => {
  it('lists nothing for nothing', () => {
    expect(milestones([])).toEqual([]);
  });

  it('lists only what has been reached, with its date', () => {
    const day = (i: number) => at(2026, 9, 1 + i);
    const list: StatSession[] = [];
    for (let i = 0; i < 10; i++) list.push(session(day(i), 360)); // 10 sessions of 6 min = 60 min, 10 days
    const result = milestones(list);
    expect(result.map((m) => m.label)).toEqual(['First session', '7 days practised', '1 hour of breathing', '10 sessions']);
    expect(result[0].reachedAt).toBe(day(0));
    expect(result[1].reachedAt).toBe(day(6));
    expect(result[3].reachedAt).toBe(day(9));
  });

  it('never lists a milestone that has not happened', () => {
    const result = milestones([session(at(2026, 9, 1), 30), session(at(2026, 9, 1, 12), 30)]);
    expect(result.map((m) => m.label)).toEqual(['First session']);
  });

  it('counts a day once however many sessions it had', () => {
    const list = Array.from({ length: 8 }, (_, i) => session(at(2026, 9, 1, 8 + i), 60));
    expect(milestones(list).map((m) => m.id)).toEqual(['sessions-1']);
  });
});
