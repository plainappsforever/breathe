import { buildLaunchUrl, consumePendingIntent, intentFromParams, parseLaunchUrl, setPendingIntent } from './launch-intent';

describe('parseLaunchUrl', () => {
  it('parses start with pattern and target', () => {
    expect(parseLaunchUrl('breathe://start?pattern=box&target=m:3')).toEqual({
      action: 'start',
      patternId: 'box',
      target: { kind: 'minutes', value: 3 },
    });
    expect(parseLaunchUrl('breathe-dev://start?pattern=slow&target=b:20')).toEqual({
      action: 'start',
      patternId: 'slow',
      target: { kind: 'breaths', value: 20 },
    });
    expect(parseLaunchUrl('breathe-preview://start?target=open')).toEqual({ action: 'start', target: { kind: 'open' } });
  });

  it('start without params means the default', () => {
    expect(parseLaunchUrl('breathe://start')).toEqual({ action: 'start' });
    expect(parseLaunchUrl('breathe://start/')).toEqual({ action: 'start' });
    expect(parseLaunchUrl('breathe://start?')).toEqual({ action: 'start' });
  });

  it('accepts encoded values, custom pattern ids, ids with dashes, and the Expo /--/ form', () => {
    expect(parseLaunchUrl('breathe://start?pattern=4-7-8&target=m%3A5')).toEqual({ action: 'start', patternId: '4-7-8', target: { kind: 'minutes', value: 5 } });
    expect(parseLaunchUrl('breathe://start?pattern=c_lz3k9abcd')).toEqual({ action: 'start', patternId: 'c_lz3k9abcd' });
    expect(parseLaunchUrl('exp+breathe://start')).toBeNull();
    expect(parseLaunchUrl('breathe:///--/start?pattern=even')).toEqual({ action: 'start', patternId: 'even' });
  });

  it('drops invalid params instead of failing', () => {
    expect(parseLaunchUrl('breathe://start?pattern=../etc&target=m:0')).toEqual({ action: 'start' });
    expect(parseLaunchUrl('breathe://start?pattern=box&target=nonsense')).toEqual({ action: 'start', patternId: 'box' });
    expect(parseLaunchUrl('breathe://start?pattern=%E0%A4%A')).toEqual({ action: 'start' });
  });

  it('rejects other schemes, hosts and garbage', () => {
    expect(parseLaunchUrl('https://start?pattern=box')).toBeNull();
    expect(parseLaunchUrl('otherapp://start')).toBeNull();
    expect(parseLaunchUrl('breathe://settings')).toBeNull();
    expect(parseLaunchUrl('breathe://')).toBeNull();
    expect(parseLaunchUrl('not a url')).toBeNull();
    expect(parseLaunchUrl('')).toBeNull();
  });
});

describe('intentFromParams / buildLaunchUrl', () => {
  it('handles router-style array params', () => {
    expect(intentFromParams({ pattern: ['box'], target: ['m:2'] })).toEqual({ action: 'start', patternId: 'box', target: { kind: 'minutes', value: 2 } });
    expect(intentFromParams({})).toEqual({ action: 'start' });
  });

  it('builds URLs that parse back', () => {
    const url = buildLaunchUrl('breathe-dev', { patternId: 'box', target: 'b:12' });
    expect(url).toBe('breathe-dev://start?pattern=box&target=b:12');
    expect(parseLaunchUrl(url)).toEqual({ action: 'start', patternId: 'box', target: { kind: 'breaths', value: 12 } });
    expect(buildLaunchUrl('breathe', {})).toBe('breathe://start');
  });
});

describe('pending intent', () => {
  it('is consumed exactly once', () => {
    setPendingIntent({ action: 'start', patternId: 'box' });
    expect(consumePendingIntent()).toEqual({ action: 'start', patternId: 'box' });
    expect(consumePendingIntent()).toBeNull();
  });
});
