import type { StudyLink } from './patterns';

/** About-screen copy lives here (not in the screen) so a test can check the wording rules of D14. */

/** The one safety line (RESEARCH section 4, consequence 7). It names conditions to be careful about; it makes no claim. */
export const SAFETY_LINE =
  'For relaxation only, not a treatment. If you are pregnant or have a heart, lung, blood-pressure or ' +
  'seizure condition, or a history of panic attacks or fainting, check with a clinician first, skip ' +
  'breath-holds, and stop if you feel dizzy.';

export type AboutPoint = { title: string; text: string };

/** Safety education, plain language. */
export const SAFETY_POINTS: readonly AboutPoint[] = [
  {
    title: 'Holds are never required',
    text: 'Patterns with breath-holds say "holds" in the list and carry a caution. Slow, Sigh, Even, Long exhale, the Resonance paces and Short sigh have none.',
  },
  {
    title: 'Stop when something feels off',
    text: 'If you feel dizzy, light-headed, tingly, short of breath or uneasy, stop, breathe in your own way and sit or lie down. Nothing here is worth pushing through.',
  },
  {
    title: 'Keep it gentle',
    text: 'Breathe easily, never forcing or gasping. If a breath feels too long, pick a shorter pattern or make your own.',
  },
  {
    title: 'Choose a safe place',
    text: 'Do not practise while driving, cycling, swimming or in a bath, or anywhere a dizzy moment could hurt you.',
  },
  {
    title: 'What we leave out on purpose',
    text: 'Fast or forced breathing, long breath-holds, breath-hold records and carbon-dioxide training. Trials of intense breathing routines exclude people with heart, circulation or lung problems, fainting, epilepsy and pregnancy, and breathlessness guidance suggests it helps to avoid breath-holding.',
  },
];

export const SAFETY_LINKS: readonly StudyLink[] = [
  { label: 'Fincham et al. 2024 (who intense protocols exclude)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11266346/' },
  {
    label: 'Asthma + Lung UK (managing breathlessness)',
    url: 'https://www.asthmaandlung.org.uk/symptoms-tests-treatments/symptoms/breathlessness/how-can-i-manage-my-breathlessness',
  },
];

/** How to read the evidence. Everything here is in docs/RESEARCH.md section 4. */
export const EVIDENCE_POINTS: readonly AboutPoint[] = [
  {
    title: 'Modest, not magic',
    text: 'A review of controlled trials found small to moderate effects of breathing exercises on stress and mood, with most studies at moderate risk of bias. Its authors urge caution about hype.',
  },
  {
    title: 'The best-controlled test was a null result',
    text: 'In a blinded trial of 400 people, breathing at about 5.5 breaths a minute did no better than a well-designed placebo breathing exercise. That is why this app says "may help you relax and settle" and nothing more.',
  },
  {
    title: 'Length',
    text: 'The shortest sessions studied were four to five minutes. We found no study of one-to-three-minute sessions, so a short pause is a choice, not a tested dose.',
  },
  {
    title: 'How patterns are grouped',
    text: 'Calm, Wind down and Steady describe what people often pick for a moment. They are preferences, not results to expect.',
  },
];

export const EVIDENCE_LINKS: readonly StudyLink[] = [
  { label: 'Fincham et al. 2023 (breathwork meta-analysis)', url: 'https://pubmed.ncbi.nlm.nih.gov/36624160/' },
  { label: 'Fincham et al. 2023 (coherent vs placebo)', url: 'https://pubmed.ncbi.nlm.nih.gov/38092805/' },
];
