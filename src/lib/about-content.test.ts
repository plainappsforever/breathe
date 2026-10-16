import { EVIDENCE_LINKS, EVIDENCE_POINTS, SAFETY_LINE, SAFETY_LINKS, SAFETY_POINTS } from './about-content';

describe('about content', () => {
  const forbidden = /proven|clinically|scientifically|\btreats?\b|\bcures?\b|\bprevents?\b|anxiety disorder|insomnia|blood[- ]pressure|panic|HRV|heart rate variability|parasympathetic|vagal|\bheals?\b/i;

  it('follows the claims wording of D14 (the safety line itself names conditions to be careful about, so it is exempt)', () => {
    const text = [...SAFETY_POINTS, ...EVIDENCE_POINTS].map((p) => `${p.title} ${p.text}`).join(' ');
    expect(text).not.toMatch(forbidden);
  });

  it('keeps the safety line and the "not a treatment" wording', () => {
    expect(SAFETY_LINE).toMatch(/not a treatment/);
    expect(SAFETY_LINE).toMatch(/skip breath-holds/);
  });

  it('every link is https and titled', () => {
    for (const l of [...SAFETY_LINKS, ...EVIDENCE_LINKS]) {
      expect(l.url).toMatch(/^https:\/\//);
      expect(l.label.length).toBeGreaterThan(5);
    }
  });

  it('says what is left out on purpose and that holds are never required', () => {
    const titles = SAFETY_POINTS.map((p) => p.title);
    expect(titles).toContain('Holds are never required');
    expect(titles).toContain('What we leave out on purpose');
  });
});
