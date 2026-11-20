import { findPreset } from '@/lib/patterns';
import { waveLevel, wavePath, waveSegments } from '@/lib/wave';

describe('wave', () => {
  const box = findPreset('box');
  const phases = box?.phases ?? [
    { kind: 'inhale', seconds: 4 },
    { kind: 'hold', seconds: 4 },
    { kind: 'exhale', seconds: 4 },
    { kind: 'hold', seconds: 4 },
  ];

  it('rises for in, stays flat for hold, falls for out', () => {
    const segs = waveSegments(phases);
    expect(segs).toHaveLength(phases.length);
    expect(waveLevel(segs, 0)).toBeCloseTo(0);
    expect(waveLevel(segs, segs[0].endFrac)).toBeCloseTo(1);
    expect(waveLevel(segs, (segs[1].startFrac + segs[1].endFrac) / 2)).toBeCloseTo(1);
    expect(waveLevel(segs, segs[2].endFrac)).toBeCloseTo(0);
    expect(waveLevel(segs, 1)).toBeCloseTo(0);
  });

  it('segments cover the whole breath', () => {
    const segs = waveSegments([
      { kind: 'inhale', seconds: 4 },
      { kind: 'exhale', seconds: 6 },
    ]);
    expect(segs[0].startFrac).toBe(0);
    expect(segs[0].endFrac).toBeCloseTo(0.4);
    expect(segs[1].endFrac).toBeCloseTo(1);
  });

  it('draws a path that starts at the left edge', () => {
    const d = wavePath(waveSegments(phases), 300, 100, 10);
    expect(d.startsWith('M 10.0 90.0')).toBe(true);
  });
});
