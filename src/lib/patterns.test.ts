import {
  BREATH_OPTIONS,
  breathsPerMinute,
  buildCustomPattern,
  customInputFromPhases,
  DEFAULT_TARGET,
  isCustomPatternId,
  MAX_BREATH_SECONDS,
  findPreset,
  MAX_PHASE_SECONDS,
  MINUTE_OPTIONS,
  MIN_PHASE_SECONDS,
  normalizePatternName,
  paceLabel,
  parseTarget,
  PRESETS,
  serializeTarget,
  targetLabel,
  targetsEqual,
  validateCustomPattern,
} from './patterns';

describe('presets', () => {
  it('are immutable', () => {
    expect(() => {
      // @ts-expect-error intentional mutation attempt
      PRESETS.push({});
    }).toThrow();
    expect(() => {
      // @ts-expect-error intentional mutation attempt
      PRESETS[0].phases.push({ kind: 'hold', seconds: 1 });
    }).toThrow();
  });

  it('match the SPEC pattern table', () => {
    const byId = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
    expect(byId.slow.phases).toEqual([
      { kind: 'inhale', seconds: 4 },
      { kind: 'exhale', seconds: 6 },
    ]);
    expect(byId.slow.hasHolds).toBe(false);
    expect(byId.sigh.phases).toEqual([
      { kind: 'inhale', seconds: 2 },
      { kind: 'sip', seconds: 1 },
      { kind: 'exhale', seconds: 6 },
    ]);
    expect(byId.even.phases).toEqual([
      { kind: 'inhale', seconds: 5 },
      { kind: 'exhale', seconds: 5 },
    ]);
    expect(byId.box.phases).toEqual([
      { kind: 'inhale', seconds: 4 },
      { kind: 'hold', seconds: 4 },
      { kind: 'exhale', seconds: 4 },
      { kind: 'hold', seconds: 4 },
    ]);
    expect(byId.box.hasHolds).toBe(true);
    expect(byId['4-7-8'].phases).toEqual([
      { kind: 'inhale', seconds: 4 },
      { kind: 'hold', seconds: 7 },
      { kind: 'exhale', seconds: 8 },
    ]);
    expect(byId['4-7-8'].hasHolds).toBe(true);
  });
});

describe('validateCustomPattern', () => {
  const base = { inSeconds: 3, sipSeconds: 0, hold1Seconds: 0, outSeconds: 5, hold2Seconds: 0 };

  it('accepts a valid custom pattern', () => {
    const result = validateCustomPattern(base);
    expect(result.ok).toBe(true);
  });

  it('rejects in below the minimum', () => {
    const result = validateCustomPattern({ ...base, inSeconds: 0 });
    expect(result.ok).toBe(false);
  });

  it(`rejects seconds above ${MAX_PHASE_SECONDS}`, () => {
    const result = validateCustomPattern({ ...base, inSeconds: MAX_PHASE_SECONDS + 0.5 });
    expect(result.ok).toBe(false);
  });

  it('rejects steps that are not multiples of 0.5', () => {
    const result = validateCustomPattern({ ...base, inSeconds: 3.2 });
    expect(result.ok).toBe(false);
  });

  it(`rejects a total breath over ${MAX_BREATH_SECONDS}s`, () => {
    const result = validateCustomPattern({
      inSeconds: 20,
      sipSeconds: 0,
      hold1Seconds: 20,
      outSeconds: 20,
      hold2Seconds: 5,
    });
    expect(result.ok).toBe(false);
  });

  it('allows zero-length holds and sip, omitting them from the built phases', () => {
    const pattern = buildCustomPattern(base);
    expect(pattern.phases).toEqual([
      { kind: 'inhale', seconds: 3 },
      { kind: 'exhale', seconds: 5 },
    ]);
    expect(pattern.hasHolds).toBe(false);
  });

  it('includes a sip and holds when given', () => {
    const pattern = buildCustomPattern({
      inSeconds: MIN_PHASE_SECONDS,
      sipSeconds: 1,
      hold1Seconds: 2,
      outSeconds: MIN_PHASE_SECONDS,
      hold2Seconds: 2,
    });
    expect(pattern.phases.map((p) => p.kind)).toEqual(['inhale', 'sip', 'hold', 'exhale', 'hold']);
    expect(pattern.hasHolds).toBe(true);
  });
});

describe('session targets', () => {
  it('round-trips through the serialized form', () => {
    for (const target of [
      { kind: 'minutes', value: 3 },
      { kind: 'minutes', value: 60 },
      { kind: 'breaths', value: 20 },
      { kind: 'open' },
    ] as const) {
      expect(parseTarget(serializeTarget(target))).toEqual(target);
    }
    expect(serializeTarget({ kind: 'minutes', value: 3 })).toBe('m:3');
    expect(serializeTarget({ kind: 'breaths', value: 20 })).toBe('b:20');
    expect(serializeTarget({ kind: 'open' })).toBe('open');
  });

  it('rejects malformed or out-of-range values', () => {
    for (const bad of ['', 'm:0', 'm:181', 'b:0', 'b:301', 'x:3', 'm:', 'm:-1', 'm:2.5', 'minutes:3', null, undefined]) {
      expect(parseTarget(bad)).toBeNull();
    }
  });

  it('labels targets for the home line', () => {
    expect(targetLabel({ kind: 'minutes', value: 3 })).toBe('3 min');
    expect(targetLabel({ kind: 'breaths', value: 20 })).toBe('20 breaths');
    expect(targetLabel({ kind: 'breaths', value: 1 })).toBe('1 breath');
    expect(targetLabel({ kind: 'open' })).toBe('Open');
  });

  it('offers minutes up to 60 and breath counts', () => {
    expect(MINUTE_OPTIONS[MINUTE_OPTIONS.length - 1]).toBe(60);
    expect(BREATH_OPTIONS).toContain(20);
    expect(targetsEqual(DEFAULT_TARGET, { kind: 'minutes', value: 3 })).toBe(true);
  });
});

describe('custom pattern helpers', () => {
  it('recognises custom ids and normalises names', () => {
    expect(isCustomPatternId('c_abc')).toBe(true);
    expect(isCustomPatternId('slow')).toBe(false);
    expect(normalizePatternName('  My breath  ')).toBe('My breath');
    expect(normalizePatternName('   ')).toBe('Custom');
    expect(normalizePatternName('x'.repeat(100))).toHaveLength(40);
  });

  it('converts phases back into stepper values', () => {
    const input = { inSeconds: 3, sipSeconds: 1, hold1Seconds: 2, outSeconds: 5, hold2Seconds: 1.5 };
    const built = validateCustomPattern(input);
    expect(built.ok && customInputFromPhases(built.phases)).toEqual(input);
    const simple = validateCustomPattern({ inSeconds: 4, sipSeconds: 0, hold1Seconds: 0, outSeconds: 6, hold2Seconds: 0 });
    expect(simple.ok && customInputFromPhases(simple.phases)).toEqual({ inSeconds: 4, sipSeconds: 0, hold1Seconds: 0, outSeconds: 6, hold2Seconds: 0 });
  });
});

describe('v3 P4 presets', () => {
  const byId = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
  const secs = (id: string) => byId[id].phases.map((p) => `${p.kind}:${p.seconds}`);

  it('has the plan\'s new presets with the plan\'s timings', () => {
    expect(secs('long-exhale')).toEqual(['inhale:4', 'exhale:8']);
    expect(secs('res-55')).toEqual(['inhale:5.5', 'exhale:5.5']);
    expect(secs('res-6')).toEqual(['inhale:6', 'exhale:6']);
    expect(secs('res-45')).toEqual(['inhale:4.5', 'exhale:4.5']);
    expect(secs('triangle')).toEqual(['inhale:4', 'hold:4', 'exhale:4']);
    expect(secs('easy-box')).toEqual(['inhale:3', 'hold:3', 'exhale:3', 'hold:3']);
    expect(secs('short-sigh')).toEqual(['inhale:1.5', 'sip:0.5', 'exhale:4']);
    expect(PRESETS.map((p) => p.name)).toEqual(
      expect.arrayContaining(['Long exhale', 'Resonance 5.5', 'Resonance 6', 'Resonance 4.5', 'Triangle', 'Easy box', 'Short sigh'])
    );
    expect(PRESETS).toHaveLength(12);
  });

  it('has unique ids and every phase is a valid 0.5 s step', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const p of PRESETS) {
      for (const phase of p.phases) {
        expect(phase.seconds).toBeGreaterThanOrEqual(0.5);
        expect(Math.round(phase.seconds * 2)).toBe(phase.seconds * 2);
      }
    }
  });

  it('gives every preset a category, difficulty, note and about text; holds carry a caution and only holds', () => {
    for (const p of PRESETS) {
      expect(['calm', 'wind-down', 'steady']).toContain(p.category);
      expect(['easy', 'moderate']).toContain(p.difficulty);
      expect(p.evidenceNote.length).toBeGreaterThan(20);
      expect(p.about?.what.length).toBeGreaterThan(20);
      expect(p.about?.uncertain.length).toBeGreaterThan(20);
      expect(p.about?.studies.length).toBeGreaterThan(0);
      if (p.hasHolds) expect(p.caution).toMatch(/breath-hold/);
      else expect(p.caution).toBeNull();
    }
    expect(PRESETS.filter((p) => p.hasHolds).map((p) => p.id).sort()).toEqual(['4-7-8', 'box', 'easy-box', 'triangle']);
  });

  it('has no fast, forced or retention techniques: every breath lasts at least 6 s and no hold exceeds 7 s', () => {
    for (const p of PRESETS) {
      expect(p.phases.reduce((sum, ph) => sum + ph.seconds, 0)).toBeGreaterThanOrEqual(6);
      for (const ph of p.phases) if (ph.kind === 'hold') expect(ph.seconds).toBeLessThanOrEqual(7);
    }
  });

  it('cites only the studies in RESEARCH section 4', () => {
    const allowed = new Set([
      'https://pubmed.ncbi.nlm.nih.gov/35623448/',
      'https://doi.org/10.1007/s12671-023-02294-2',
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC12301348/',
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC8656666/',
      'https://pubmed.ncbi.nlm.nih.gov/36630953/',
      'https://pubmed.ncbi.nlm.nih.gov/39904867/',
      'https://pubmed.ncbi.nlm.nih.gov/38092805/',
      'https://pubmed.ncbi.nlm.nih.gov/36624160/',
      'https://pubmed.ncbi.nlm.nih.gov/36480101/',
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC12895279/',
    ]);
    for (const p of PRESETS) for (const s of p.about!.studies) expect(allowed).toContain(s.url);
  });

  it('follows the claims wording of D14 in every preset text', () => {
    const forbidden = /proven|clinically|scientifically|\btreats?\b|\bcures?\b|\bprevents?\b|anxiety disorder|insomnia|blood[- ]pressure|panic|HRV|heart rate variability|parasympathetic|vagal|sleep better|\bheals?\b/i;
    for (const p of PRESETS) {
      const text = [p.name, p.evidenceNote, p.caution ?? '', p.about!.what, p.about!.uncertain].join(' ');
      expect(text).not.toMatch(forbidden);
    }
  });

  it('computes breaths a minute, one decimal', () => {
    expect(breathsPerMinute(byId.slow.phases)).toBe(6);
    expect(breathsPerMinute(byId['res-55'].phases)).toBe(5.5);
    expect(breathsPerMinute(byId['res-6'].phases)).toBe(5);
    expect(breathsPerMinute(byId['res-45'].phases)).toBe(6.7);
    expect(breathsPerMinute(byId['4-7-8'].phases)).toBe(3.2);
    expect(breathsPerMinute(byId['short-sigh'].phases)).toBe(10);
    expect(breathsPerMinute([])).toBe(0);
    expect(paceLabel(byId.slow.phases)).toBe('About 6 breaths a minute');
    expect(paceLabel(byId['res-45'].phases)).toBe('About 6.7 breaths a minute');
  });

  it('findPreset finds every preset and custom patterns carry no preset metadata', () => {
    for (const p of PRESETS) expect(findPreset(p.id)).toBe(p);
    const custom = buildCustomPattern({ inSeconds: 3, sipSeconds: 0, hold1Seconds: 0, outSeconds: 5, hold2Seconds: 0 });
    expect(custom.category).toBeUndefined();
    expect(custom.about).toBeUndefined();
  });
});
