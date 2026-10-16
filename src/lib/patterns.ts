/** Pattern model: a breath is one pass through an ordered list of phases. SPEC "Pattern model". */

export type PhaseKind = 'inhale' | 'sip' | 'hold' | 'exhale';

export type Phase = { kind: PhaseKind; seconds: number };

/** Labelled as what people tend to prefer for a moment, never as an outcome (D14, D46). */
export type PatternCategory = 'calm' | 'wind-down' | 'steady';
export type Difficulty = 'easy' | 'moderate';
export type StudyLink = { label: string; url: string };

/** The longer "About this pattern" text: what it is, what studies exist, what is uncertain (D46). */
export type PatternAbout = { what: string; studies: readonly StudyLink[]; uncertain: string };

export type Pattern = {
  id: string;
  name: string;
  phases: readonly Phase[];
  hasHolds: boolean;
  /** Two-line note shown in the Patterns sheet and About. */
  evidenceNote: string;
  /** Presets only: custom patterns have none of the four below. */
  category?: PatternCategory;
  difficulty?: Difficulty;
  /** One line, only where relevant (breath-holds). */
  caution?: string | null;
  about?: PatternAbout;
};

export const CATEGORY_ORDER: readonly PatternCategory[] = ['calm', 'wind-down', 'steady'];
export const CATEGORY_LABELS: Record<PatternCategory, string> = { calm: 'Calm', 'wind-down': 'Wind down', steady: 'Steady' };
export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Easy', moderate: 'Moderate' };

/** What ends a session: a length in minutes, a number of breaths, or never (the user ends it). */
export type SessionTarget = { kind: 'minutes'; value: number } | { kind: 'breaths'; value: number } | { kind: 'open' };

export const MINUTE_OPTIONS: readonly number[] = [1, 2, 3, 5, 10, 15, 20, 30, 60];
export const BREATH_OPTIONS: readonly number[] = [10, 20, 30, 50];
export const DEFAULT_TARGET: SessionTarget = { kind: 'minutes', value: 3 };
export const MIN_SAVED_SESSION_SECONDS = 20;

const MAX_TARGET_MINUTES = 180;
const MAX_TARGET_BREATHS = 300;

/** Serialized form used in settings, prefs, recovery records and launch URLs: "m:3", "b:20", "open". */
export function serializeTarget(target: SessionTarget): string {
  if (target.kind === 'open') return 'open';
  return `${target.kind === 'minutes' ? 'm' : 'b'}:${target.value}`;
}

export function parseTarget(value: string | null | undefined): SessionTarget | null {
  if (!value) return null;
  if (value === 'open') return { kind: 'open' };
  const match = /^([mb]):(\d{1,3})$/.exec(value);
  if (!match) return null;
  const n = Number(match[2]);
  if (match[1] === 'm') return n >= 1 && n <= MAX_TARGET_MINUTES ? { kind: 'minutes', value: n } : null;
  return n >= 1 && n <= MAX_TARGET_BREATHS ? { kind: 'breaths', value: n } : null;
}

export function targetsEqual(a: SessionTarget, b: SessionTarget): boolean {
  return serializeTarget(a) === serializeTarget(b);
}

export function targetLabel(target: SessionTarget): string {
  if (target.kind === 'open') return 'Open';
  if (target.kind === 'minutes') return `${target.value} min`;
  return `${target.value} ${target.value === 1 ? 'breath' : 'breaths'}`;
}

export const MIN_PHASE_SECONDS = 0.5;
export const MAX_PHASE_SECONDS = 20;
export const PHASE_STEP_SECONDS = 0.5;
export const MAX_BREATH_SECONDS = 60;

function phase(kind: PhaseKind, seconds: number): Phase {
  return Object.freeze({ kind, seconds });
}

type PresetMeta = {
  category: PatternCategory;
  difficulty: Difficulty;
  caution?: string;
  note: string;
  about: PatternAbout;
};

function preset(id: string, name: string, phases: Phase[], meta: PresetMeta): Pattern {
  return Object.freeze({
    id,
    name,
    phases: Object.freeze(phases),
    hasHolds: phases.some((p) => p.kind === 'hold'),
    evidenceNote: meta.note,
    category: meta.category,
    difficulty: meta.difficulty,
    caution: meta.caution ?? null,
    about: Object.freeze({ ...meta.about, studies: Object.freeze([...meta.about.studies]) }),
  });
}

// Every link is one of the studies in docs/RESEARCH.md section 4.
const LABORDE_2022: StudyLink = { label: 'Laborde et al. 2022', url: 'https://pubmed.ncbi.nlm.nih.gov/35623448/' };
const SHAO_2024: StudyLink = { label: 'Shao et al. 2024', url: 'https://doi.org/10.1007/s12671-023-02294-2' };
const IWABE_2025: StudyLink = { label: 'Iwabe et al. 2025', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12301348/' };
const YOU_2021: StudyLink = { label: 'You et al. 2021', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8656666/' };
const BALBAN_2023: StudyLink = { label: 'Balban et al. 2023', url: 'https://pubmed.ncbi.nlm.nih.gov/36630953/' };
const HANLEY_2025: StudyLink = { label: 'Hanley et al. 2025', url: 'https://pubmed.ncbi.nlm.nih.gov/39904867/' };
const FINCHAM_COHERENT_2023: StudyLink = { label: 'Fincham et al. 2023 (coherent vs placebo)', url: 'https://pubmed.ncbi.nlm.nih.gov/38092805/' };
const FINCHAM_REVIEW_2023: StudyLink = { label: 'Fincham et al. 2023 (breathwork meta-analysis)', url: 'https://pubmed.ncbi.nlm.nih.gov/36624160/' };
const AKTAS_2023: StudyLink = { label: 'Aktaş & İlgin 2023', url: 'https://pubmed.ncbi.nlm.nih.gov/36480101/' };
const KIRAZLI_2026: StudyLink = { label: 'Kirazli et al. 2026', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12895279/' };

const HOLD_CAUTION = 'Includes breath-holds. Pick a pattern without holds if they feel uncomfortable, and stop if you feel dizzy.';
const NO_TRIAL = 'We found no study of this exact pattern, so what is said for it is borrowed from breathing research in general.';
const REVIEW_CAUTION =
  'The breathwork review reports modest effects, most studies were at moderate risk of bias, and its authors urge caution about hype.';

export const PRESETS: readonly Pattern[] = Object.freeze([
  preset('slow', 'Slow', [phase('inhale', 4), phase('exhale', 6)], {
    category: 'calm',
    difficulty: 'easy',
    note: 'Slow breathing around six breaths a minute is the most-studied kind; studies show modest calming effects. No holds.',
    about: {
      what: 'In for 4 seconds, out for 6: about six breaths a minute with no holds. The longer breath out is the part many people find settling.',
      studies: [LABORDE_2022, SHAO_2024, IWABE_2025],
      uncertain:
        'Reviews of many small studies report modest effects, and the result for perceived stress was borderline. Studies used sessions of about five minutes or more; we found no study of one-to-three-minute sessions.',
    },
  }),
  preset('sigh', 'Sigh', [phase('inhale', 2), phase('sip', 1), phase('exhale', 6)], {
    category: 'calm',
    difficulty: 'moderate',
    note: 'A double inhale and long exhale. One month-long study found it improved daily mood more than mindfulness; not yet independently confirmed.',
    about: {
      what: 'A full breath in, a short second sip of air on top, then a long slow breath out. Often called a cyclic sigh. Breathe in through the nose and keep the sip small.',
      studies: [BALBAN_2023, HANLEY_2025],
      uncertain:
        'The month-long study was done remotely with self-reported practice and has not been independently confirmed. A small later trial found less pain unpleasantness but no difference in anxiety or mood scores. The studies give no fixed counts, so 2 + 1 + 6 seconds is our choice.',
    },
  }),
  preset('even', 'Even', [phase('inhale', 5), phase('exhale', 5)], {
    category: 'steady',
    difficulty: 'easy',
    note: 'Equal in and out, about six breaths a minute. A 400-person trial found it no better than breathing at a normal pace. Pleasant, not magic.',
    about: {
      what: 'Equal in and out, 5 seconds each: about six breaths a minute. The easiest rhythm to follow with your eyes closed.',
      studies: [FINCHAM_COHERENT_2023, YOU_2021],
      uncertain:
        'In a blinded trial of 400 people, breathing at about 5.5 breaths a minute did no better than a well-designed placebo breathing exercise on stress, mood or sleep measures. Sessions of five minutes at this pace have been studied, which is why five minutes is a common starting length.',
    },
  }),
  preset('box', 'Box', [phase('inhale', 4), phase('hold', 4), phase('exhale', 4), phase('hold', 4)], {
    category: 'steady',
    difficulty: 'moderate',
    caution: HOLD_CAUTION,
    note: 'Popular and widely taught. Evidence that it beats other slow breathing is thin. Includes breath-holds.',
    about: {
      what: 'Four equal steps of 4 seconds: in, hold, out, hold. Widely taught and popular. Easy box has shorter holds, and Even has none.',
      studies: [FINCHAM_REVIEW_2023],
      uncertain: `${NO_TRIAL} ${REVIEW_CAUTION}`,
    },
  }),
  preset('4-7-8', '4-7-8', [phase('inhale', 4), phase('hold', 7), phase('exhale', 8)], {
    category: 'wind-down',
    difficulty: 'moderate',
    caution: 'Includes a 7-second breath-hold. Try Long exhale instead if holds feel uncomfortable, and stop if you feel dizzy.',
    note: 'Widely recommended for winding down; only small clinical studies exist. Includes a long hold: skip it if holds feel uncomfortable.',
    about: {
      what: 'In for 4, hold for 7, out for 8: about three breaths a minute, slower than most people breathe at rest. Often suggested as an evening routine.',
      studies: [AKTAS_2023, KIRAZLI_2026],
      uncertain:
        'Only two small trials that were not blinded were found: 90 people after weight-loss surgery and 48 people with ringing in the ears. We found none in healthy adults, so the results may not apply to you.',
    },
  }),
  preset('long-exhale', 'Long exhale', [phase('inhale', 4), phase('exhale', 8)], {
    category: 'wind-down',
    difficulty: 'easy',
    note: 'Breathing out twice as long as in is a common way to slow down. No holds. No study of this exact ratio.',
    about: {
      what: 'In for 4, out for 8: about five breaths a minute, with the out-breath twice as long as the in-breath. No holds.',
      studies: [LABORDE_2022, FINCHAM_REVIEW_2023],
      uncertain:
        'The 1:2 ratio is a common teaching choice. We found no trial comparing it with other ratios, so what is said for it is borrowed from slow-breathing research in general. If the long breath out feels strained, choose Slow.',
    },
  }),
  preset('res-55', 'Resonance 5.5', [phase('inhale', 5.5), phase('exhale', 5.5)], {
    category: 'steady',
    difficulty: 'easy',
    note: 'About 5.5 breaths a minute, a pace used in breathing training. In a 400-person blinded trial it did no better than placebo breathing. No holds.',
    about: {
      what: '5.5 seconds in and 5.5 out: about 5.5 breaths a minute, the pace often called resonance or coherent breathing. No holds.',
      studies: [FINCHAM_COHERENT_2023, LABORDE_2022],
      uncertain:
        'The large blinded trial found no measurable effect over a placebo breathing exercise. The name can sound special; the trials do not show that it is. Choose it if you like the pace.',
    },
  }),
  preset('res-6', 'Resonance 6', [phase('inhale', 6), phase('exhale', 6)], {
    category: 'steady',
    difficulty: 'easy',
    note: '6 seconds in and 6 out, about five breaths a minute: a little slower than Resonance 5.5, with the same limits in the evidence. No holds.',
    about: {
      what: '6 seconds in and 6 out: about five breaths a minute, a little slower than the pace in the blinded trial. No holds.',
      studies: [LABORDE_2022, FINCHAM_COHERENT_2023],
      uncertain: `${NO_TRIAL} Longer breaths feel hard to some people; if you feel short of breath, choose a faster pattern such as Even.`,
    },
  }),
  preset('res-45', 'Resonance 4.5', [phase('inhale', 4.5), phase('exhale', 4.5)], {
    category: 'steady',
    difficulty: 'easy',
    note: '4.5 seconds in and 4.5 out, about 6.7 breaths a minute: the gentlest of the resonance paces. No holds.',
    about: {
      what: '4.5 seconds in and 4.5 out: about 6.7 breaths a minute, the faster end of slow breathing and easy to keep up. No holds.',
      studies: [LABORDE_2022, FINCHAM_COHERENT_2023],
      uncertain: NO_TRIAL,
    },
  }),
  preset('triangle', 'Triangle', [phase('inhale', 4), phase('hold', 4), phase('exhale', 4)], {
    category: 'steady',
    difficulty: 'moderate',
    caution: HOLD_CAUTION,
    note: 'In, hold, out at 4 seconds each: box breathing with one hold. Little research on this pattern. Includes a breath-hold.',
    about: {
      what: 'Three equal steps of 4 seconds: in, hold, out. Box breathing with one hold instead of two.',
      studies: [FINCHAM_REVIEW_2023],
      uncertain: `${NO_TRIAL} ${REVIEW_CAUTION}`,
    },
  }),
  preset('easy-box', 'Easy box', [phase('inhale', 3), phase('hold', 3), phase('exhale', 3), phase('hold', 3)], {
    category: 'steady',
    difficulty: 'easy',
    caution: HOLD_CAUTION,
    note: 'Box breathing with shorter 3-second steps, a gentler way in. Little research on this pattern. Includes short breath-holds.',
    about: {
      what: 'Four equal steps of 3 seconds: in, hold, out, hold. A shorter, easier version of Box.',
      studies: [FINCHAM_REVIEW_2023],
      uncertain: `${NO_TRIAL} ${REVIEW_CAUTION}`,
    },
  }),
  preset('short-sigh', 'Short sigh', [phase('inhale', 1.5), phase('sip', 0.5), phase('exhale', 4)], {
    category: 'calm',
    difficulty: 'easy',
    note: 'A quicker version of Sigh, about ten breaths a minute. Made for this app: the sigh studies did not test these timings.',
    about: {
      what: 'A quick breath in, a small sip on top, then a slower breath out: about ten breaths a minute. Breathe in through the nose.',
      studies: [BALBAN_2023, HANLEY_2025],
      uncertain:
        'This shortened version was made for this app. The month-long sigh study used a full-size sigh with no fixed timings, and nothing here has been tested on its own.',
    },
  }),
]);

export function findPreset(id: string): Pattern | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** Custom patterns live in the custom_patterns table; their ids start with this prefix (presets never do). */
export const CUSTOM_ID_PREFIX = 'c_';
export const CUSTOM_EVIDENCE_NOTE = 'Your own timing, saved on this device.';
export const DEFAULT_CUSTOM_NAME = 'Custom';
export const MAX_PATTERN_NAME_LENGTH = 40;

export function isCustomPatternId(id: string): boolean {
  return id.startsWith(CUSTOM_ID_PREFIX);
}

/** Trims and bounds a user-entered pattern name; empty falls back to "Custom". */
export function normalizePatternName(name: string): string {
  const trimmed = name.trim().slice(0, MAX_PATTERN_NAME_LENGTH).trim();
  return trimmed === '' ? DEFAULT_CUSTOM_NAME : trimmed;
}

export type CustomInput = {
  inSeconds: number;
  sipSeconds: number;
  hold1Seconds: number;
  outSeconds: number;
  hold2Seconds: number;
};

export type CustomValidation = { ok: true; phases: Phase[] } | { ok: false; error: string };

function isValidStep(seconds: number, min: number): boolean {
  if (seconds < min || seconds > MAX_PHASE_SECONDS) return false;
  // Multiples of 0.5, tolerant of floating point.
  return Math.round(seconds * 2) === seconds * 2;
}

export function validateCustomPattern(input: CustomInput): CustomValidation {
  if (!isValidStep(input.inSeconds, MIN_PHASE_SECONDS)) {
    return { ok: false, error: `In must be between ${MIN_PHASE_SECONDS} and ${MAX_PHASE_SECONDS} seconds.` };
  }
  if (!isValidStep(input.outSeconds, MIN_PHASE_SECONDS)) {
    return { ok: false, error: `Out must be between ${MIN_PHASE_SECONDS} and ${MAX_PHASE_SECONDS} seconds.` };
  }
  if (!isValidStep(input.sipSeconds, 0)) return { ok: false, error: 'Sip must be a valid step.' };
  if (!isValidStep(input.hold1Seconds, 0)) return { ok: false, error: 'Hold must be a valid step.' };
  if (!isValidStep(input.hold2Seconds, 0)) return { ok: false, error: 'Hold must be a valid step.' };

  const phases: Phase[] = [phase('inhale', input.inSeconds)];
  if (input.sipSeconds > 0) phases.push(phase('sip', input.sipSeconds));
  if (input.hold1Seconds > 0) phases.push(phase('hold', input.hold1Seconds));
  phases.push(phase('exhale', input.outSeconds));
  if (input.hold2Seconds > 0) phases.push(phase('hold', input.hold2Seconds));

  const total = phases.reduce((sum, p) => sum + p.seconds, 0);
  if (total > MAX_BREATH_SECONDS) {
    return { ok: false, error: `A breath must be ${MAX_BREATH_SECONDS} seconds or less (currently ${total}s).` };
  }

  return { ok: true, phases };
}

export function buildCustomPattern(input: CustomInput, id = `${CUSTOM_ID_PREFIX}preview`, name = DEFAULT_CUSTOM_NAME): Pattern {
  const result = validateCustomPattern(input);
  if (!result.ok) throw new Error(result.error);
  return patternFromPhases(id, name, result.phases);
}

export function patternFromPhases(id: string, name: string, phases: readonly Phase[]): Pattern {
  return {
    id,
    name,
    phases,
    hasHolds: phases.some((p) => p.kind === 'hold'),
    evidenceNote: isCustomPatternId(id) ? CUSTOM_EVIDENCE_NOTE : (findPreset(id)?.evidenceNote ?? ''),
  };
}

/** Inverse of validateCustomPattern: the five stepper values that produce these phases. */
export function customInputFromPhases(phases: readonly Phase[]): CustomInput {
  const input: CustomInput = { inSeconds: 4, sipSeconds: 0, hold1Seconds: 0, outSeconds: 6, hold2Seconds: 0 };
  let seenExhale = false;
  for (const p of phases) {
    if (p.kind === 'inhale') input.inSeconds = p.seconds;
    else if (p.kind === 'sip') input.sipSeconds = p.seconds;
    else if (p.kind === 'exhale') {
      input.outSeconds = p.seconds;
      seenExhale = true;
    } else if (seenExhale) input.hold2Seconds = p.seconds;
    else input.hold1Seconds = p.seconds;
  }
  return input;
}

export function phaseLine(phases: readonly Phase[]): string {
  const label: Record<PhaseKind, string> = { inhale: 'in', sip: 'sip', hold: 'hold', exhale: 'out' };
  return phases.map((p) => `${formatSeconds(p.seconds)} ${label[p.kind]}`).join(' · ');
}

export function formatSeconds(seconds: number): string {
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
}

/** Breaths per minute for a pattern, to one decimal (a Resonance 5.5 breath is 11 s = 5.5). */
export function breathsPerMinute(phases: readonly Phase[]): number {
  const total = phases.reduce((sum, p) => sum + p.seconds, 0);
  return total > 0 ? Math.round((60 / total) * 10) / 10 : 0;
}

export function paceLabel(phases: readonly Phase[]): string {
  return `About ${formatSeconds(breathsPerMinute(phases))} breaths a minute`;
}
