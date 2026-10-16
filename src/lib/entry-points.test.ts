import { BREATHE_NOW_ID, buildQuickActions, liveActivityPlan, SHORTCUT_EXAMPLES, startWidgetTimeline, todayMinutes } from './entry-points';
import { buildLaunchUrl, parseLaunchUrl } from './launch-intent';
import { findPreset } from './patterns';

const slow = { id: 'slow', name: 'Slow', target: { kind: 'minutes', value: 3 } } as const;
const box = { id: 'box', name: 'Box', target: { kind: 'minutes', value: 5 } } as const;
const sigh = { id: 'sigh', name: 'Short sigh', target: { kind: 'breaths', value: 20 } } as const;
const custom = { id: 'c_abc', name: 'Evening', target: { kind: 'open' } } as const;

describe('buildQuickActions', () => {
  it('starts with "Breathe now" = the default session, then two recent patterns', () => {
    const items = buildQuickActions('breathe', slow, [slow, box, sigh]);
    expect(items.map((i) => i.id)).toEqual([BREATHE_NOW_ID, 'pattern-box', 'pattern-sigh']);
    expect(items[0]).toMatchObject({ title: 'Breathe now', subtitle: 'Slow · 3 min', url: 'breathe://start' });
    expect(items[1]).toMatchObject({ title: 'Box', subtitle: '5 min', url: 'breathe://start?pattern=box' });
    expect(items[2]).toMatchObject({ title: 'Short sigh', subtitle: '20 breaths' });
  });

  it('skips the default and duplicates, and never lists more than three items', () => {
    const items = buildQuickActions('breathe-dev', box, [box, box, custom, slow, sigh]);
    expect(items.map((i) => i.title)).toEqual(['Breathe now', 'Evening', 'Slow']);
    expect(items[1].subtitle).toBe('Open');
  });

  it('works with no history yet', () => {
    expect(buildQuickActions('breathe', slow, []).map((i) => i.id)).toEqual([BREATHE_NOW_ID]);
  });

  it('every URL goes through the one launch-intent parser', () => {
    const items = buildQuickActions('breathe-preview', slow, [box, custom]);
    expect(items.map((i) => parseLaunchUrl(i.url))).toEqual([
      { action: 'start' },
      { action: 'start', patternId: 'box' },
      { action: 'start', patternId: 'c_abc' },
    ]);
  });
});

describe('todayMinutes', () => {
  it('is 0 with no session, at least 1 once one was saved, then rounded minutes', () => {
    expect(todayMinutes(0, 0)).toBe(0);
    expect(todayMinutes(25, 1)).toBe(1);
    expect(todayMinutes(89, 1)).toBe(1);
    expect(todayMinutes(90, 2)).toBe(2);
    expect(todayMinutes(3600, 3)).toBe(60);
  });
});

describe('startWidgetTimeline', () => {
  it('shows today now and 0 from the next local midnight', () => {
    const now = new Date(2026, 8, 30, 21, 15).getTime();
    const entries = startWidgetTimeline(12, 'breathe://start', now);
    expect(entries).toEqual([
      { date: now, props: { minutes: 12, url: 'breathe://start' } },
      { date: new Date(2026, 9, 1, 0, 0).getTime(), props: { minutes: 0, url: 'breathe://start' } },
    ]);
  });
});

describe('liveActivityPlan', () => {
  const base = { patternName: 'Box', target: { kind: 'minutes', value: 3 } as const, startTime: 1_000_000, displayEndMs: 180_000, pausedElapsedMs: null };

  it('ends when the setting is off or no session runs', () => {
    expect(liveActivityPlan(false, base)).toEqual({ action: 'end' });
    expect(liveActivityPlan(true, null)).toEqual({ action: 'end' });
  });

  it('counts down to the chosen end with the system timer while running', () => {
    expect(liveActivityPlan(true, base)).toEqual({
      action: 'show',
      props: { title: 'Box', subtitle: '3 min', startAt: 1_000_000, endAt: 1_180_000, countsDown: true, paused: false, pausedClock: '' },
      staleAt: 1_240_000,
    });
  });

  it('shows the time left as a still clock while paused', () => {
    const plan = liveActivityPlan(true, { ...base, pausedElapsedMs: 47_000 });
    expect(plan).toMatchObject({ action: 'show', props: { subtitle: 'Paused', paused: true, pausedClock: '2:13' }, staleAt: null });
  });

  it('counts up for an open session and follows a moved end ("end after this breath")', () => {
    const open = liveActivityPlan(true, { ...base, target: { kind: 'open' }, displayEndMs: null });
    expect(open).toMatchObject({ action: 'show', props: { subtitle: 'Open', countsDown: false, startAt: 1_000_000 }, staleAt: null });
    const moved = liveActivityPlan(true, { ...base, displayEndMs: 96_000 });
    expect(moved).toMatchObject({ props: { endAt: 1_096_000 } });
  });
});

describe('SHORTCUT_EXAMPLES', () => {
  it('are start links the parser understands, with real preset ids', () => {
    expect(SHORTCUT_EXAMPLES.map((e) => parseLaunchUrl(buildLaunchUrl('breathe', e.params)))).toEqual([
      { action: 'start' },
      { action: 'start', patternId: 'box', target: { kind: 'minutes', value: 5 } },
      { action: 'start', patternId: 'slow', target: { kind: 'breaths', value: 20 } },
    ]);
    for (const e of SHORTCUT_EXAMPLES) if (e.params.patternId) expect(findPreset(e.params.patternId)).toBeDefined();
  });
});
