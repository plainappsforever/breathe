import { parseDateText, rangeFromText } from './date-range';

describe('date range for deleting', () => {
  it('parses real dates only', () => {
    expect(parseDateText('2026-09-30')).toBe(new Date(2026, 8, 30).getTime());
    expect(parseDateText(' 2026-9-3 ')).toBe(new Date(2026, 8, 3).getTime());
    for (const bad of ['', '2026-02-30', '2026-13-01', '30.09.2026', '2026-09', 'yesterday', '2026-00-10']) {
      expect(parseDateText(bad)).toBeNull();
    }
    expect(parseDateText('2028-02-29')).not.toBeNull();
    expect(parseDateText('2027-02-29')).toBeNull();
  });

  it('includes both end days', () => {
    const r = rangeFromText('2026-09-01', '2026-09-30');
    expect(r).toEqual({ ok: true, from: new Date(2026, 8, 1).getTime(), toExclusive: new Date(2026, 9, 1).getTime() });
    const one = rangeFromText('2026-09-05', '2026-09-05');
    expect(one.ok && one.toExclusive - one.from).toBeGreaterThan(0);
  });

  it('explains bad input', () => {
    expect(rangeFromText('x', '2026-09-30')).toMatchObject({ ok: false });
    expect(rangeFromText('2026-10-01', '2026-09-30')).toMatchObject({ ok: false, error: expect.stringMatching(/before/) });
  });
});
