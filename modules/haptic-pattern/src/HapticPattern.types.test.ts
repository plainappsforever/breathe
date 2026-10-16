import { resolveStrength } from './HapticPattern.types';

describe('resolveStrength', () => {
  it('still accepts the v1 words', () => {
    expect(resolveStrength('gentle')).toBe(0.45);
    expect(resolveStrength('strong')).toBe(0.9);
  });

  it('keeps numbers within 0.1-1.0 and survives garbage', () => {
    expect(resolveStrength(0.6)).toBe(0.6);
    expect(resolveStrength(0)).toBe(0.1);
    expect(resolveStrength(4)).toBe(1);
    expect(resolveStrength(NaN)).toBe(0.45);
  });
});
