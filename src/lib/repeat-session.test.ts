import type { LaunchIntent } from './launch-intent';
import { serializeTarget } from './patterns';
import { repeatIntent, repeatTarget } from './repeat-session';

const describeRepeat = (intent: LaunchIntent) => `${intent.patternId ?? ''} ${intent.target ? serializeTarget(intent.target) : 'default'}`.trim();

const base = { patternId: 'slow', patternName: 'Slow', target: null, plannedSeconds: null } as const;

describe('repeat this session', () => {
  it('uses the saved target', () => {
    expect(describeRepeat(repeatIntent({ ...base, target: { kind: 'breaths', value: 20 } }, true, null)!)).toBe('slow b:20');
    expect(describeRepeat(repeatIntent({ ...base, target: { kind: 'open' } }, true, null)!)).toBe('slow open');
  });

  it('falls back to the planned minutes, then to the default', () => {
    expect(repeatTarget({ target: null, plannedSeconds: 190 })).toEqual({ kind: 'minutes', value: 3 });
    expect(repeatTarget({ target: null, plannedSeconds: 10 })).toBeUndefined();
    expect(repeatTarget({ target: null, plannedSeconds: null })).toBeUndefined();
    expect(repeatTarget({ target: null, plannedSeconds: 99999 })).toEqual({ kind: 'minutes', value: 180 });
    expect(describeRepeat(repeatIntent(base, true, null)!)).toBe('slow default');
  });

  it('finds a preset by name for v1 sessions without an id', () => {
    expect(repeatIntent({ ...base, patternId: null, patternName: 'Box' }, false, 'box')?.patternId).toBe('box');
    expect(repeatIntent({ ...base, patternId: null, patternName: 'Custom' }, false, null)).toBeNull();
  });

  it('cannot repeat a deleted custom pattern', () => {
    expect(repeatIntent({ ...base, patternId: 'c_gone', patternName: 'Mine' }, false, null)).toBeNull();
    expect(repeatIntent({ ...base, patternId: 'c_here', patternName: 'Mine' }, true, null)?.patternId).toBe('c_here');
  });
});
