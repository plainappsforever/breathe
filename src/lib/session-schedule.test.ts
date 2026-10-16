import { findPreset } from './patterns';
import { buildSchedule, cycleMs, locate, targetDisplayMs, targetEndMs, targetPlannedSeconds } from './session-schedule';

const slow = findPreset('slow')!; // 4 in + 6 out = 10 s
const box = findPreset('box')!; // 16 s
const sigh = findPreset('sigh')!; // 2 in + 1 sip + 6 out = 9 s

describe('targetEndMs', () => {
  it('rounds a minutes target up to the next breath boundary', () => {
    expect(targetEndMs(slow, { kind: 'minutes', value: 1 })).toBe(60_000);
    expect(targetEndMs(box, { kind: 'minutes', value: 3 })).toBe(192_000); // 11.25 breaths -> 12
    expect(targetEndMs(sigh, { kind: 'minutes', value: 1 })).toBe(63_000); // 6.67 -> 7 breaths
  });

  it('is exact for breath targets and null for Open', () => {
    expect(targetEndMs(box, { kind: 'breaths', value: 20 })).toBe(320_000);
    expect(targetEndMs(slow, { kind: 'open' })).toBeNull();
  });

  it('display length keeps the chosen minutes; planned seconds follow the target', () => {
    expect(targetDisplayMs(box, { kind: 'minutes', value: 3 })).toBe(180_000);
    expect(targetDisplayMs(box, { kind: 'breaths', value: 2 })).toBe(32_000);
    expect(targetPlannedSeconds(box, { kind: 'minutes', value: 3 })).toBe(180);
    expect(targetPlannedSeconds(box, { kind: 'breaths', value: 2 })).toBe(32);
    expect(targetPlannedSeconds(box, { kind: 'open' })).toBeNull();
  });

  it('supports the 60-minute maximum', () => {
    expect(targetEndMs(slow, { kind: 'minutes', value: 60 })).toBe(3_600_000);
  });
});

describe('locate', () => {
  it('finds the phase running at an offset, boundaries belonging to the phase that starts', () => {
    expect(locate(slow, 0)).toEqual({ phaseIndex: 0, breathIndex: 0, phaseStartOffsetMs: 0 });
    expect(locate(slow, 3999)).toEqual({ phaseIndex: 0, breathIndex: 0, phaseStartOffsetMs: 0 });
    expect(locate(slow, 4000)).toEqual({ phaseIndex: 1, breathIndex: 0, phaseStartOffsetMs: 4000 });
    expect(locate(slow, 10_000)).toEqual({ phaseIndex: 0, breathIndex: 1, phaseStartOffsetMs: 10_000 });
    expect(locate(box, 37_500)).toEqual({ phaseIndex: 1, breathIndex: 2, phaseStartOffsetMs: 36_000 });
  });
});

describe('buildSchedule', () => {
  it('lists every phase start and one end cue for a breath target', () => {
    const cues = buildSchedule(slow, { kind: 'breaths', value: 2 });
    expect(cues).toEqual([
      { atMs: 0, kind: 'inhale', durationMs: 4000 },
      { atMs: 4000, kind: 'exhale', durationMs: 6000 },
      { atMs: 10_000, kind: 'inhale', durationMs: 4000 },
      { atMs: 14_000, kind: 'exhale', durationMs: 6000 },
      { atMs: 20_000, kind: 'end', durationMs: 0 },
    ]);
  });

  it('matches the pattern for every preset over 3 minutes', () => {
    for (const p of [slow, box, sigh]) {
      const cues = buildSchedule(p, { kind: 'minutes', value: 3 });
      const end = targetEndMs(p, { kind: 'minutes', value: 3 })!;
      expect(cues[cues.length - 1]).toEqual({ atMs: end, kind: 'end', durationMs: 0 });
      expect(cues.length - 1).toBe((end / cycleMs(p)) * p.phases.length);
      for (let i = 1; i < cues.length; i++) expect(cues[i].atMs).toBe(cues[i - 1].atMs + (cues[i - 1].durationMs || 0));
    }
  });

  it('starts from a given offset, keeping absolute times and skipping cues already passed', () => {
    const cues = buildSchedule(slow, { kind: 'breaths', value: 2 }, 12_000);
    expect(cues.map((c) => [c.atMs, c.kind])).toEqual([
      [14_000, 'exhale'],
      [20_000, 'end'],
    ]);
    expect(buildSchedule(slow, { kind: 'breaths', value: 2 }, 14_000)[0]).toEqual({ atMs: 14_000, kind: 'exhale', durationMs: 6000 });
  });

  it('caps Open sessions at a horizon and adds no end cue', () => {
    const cues = buildSchedule(slow, { kind: 'open' }, 0, { horizonMs: 30_000 });
    expect(cues).toHaveLength(6);
    expect(cues.some((c) => c.kind === 'end')).toBe(false);
    expect(buildSchedule(slow, { kind: 'open' }).length).toBe(720); // default 1 h horizon, 2 cues / 10 s
  });

  it('includes hold phases with their own cue kind', () => {
    const kinds = buildSchedule(box, { kind: 'breaths', value: 1 }).map((c) => c.kind);
    expect(kinds).toEqual(['inhale', 'hold', 'exhale', 'hold', 'end']);
  });
});
