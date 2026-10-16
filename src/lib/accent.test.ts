import { Colors } from '@/constants/theme';

import { ACCENT_KEYS, ACCENTS, DEFAULT_ACCENT, getAccent, parseAccent, setAccent } from './accent';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('accent colours', () => {
  it('offers exactly five, and blue is the v1 colour', () => {
    expect(ACCENT_KEYS).toHaveLength(5);
    expect(ACCENTS.blue.light).toBe(Colors.light.tint);
    expect(ACCENTS.blue.dark).toBe(Colors.dark.tint);
    expect(DEFAULT_ACCENT).toBe('blue');
  });

  it.each(ACCENT_KEYS)('%s is readable as text and as a button colour in both appearances', (key) => {
    expect(contrast(ACCENTS[key].light, Colors.light.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ACCENTS[key].dark, Colors.dark.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(Colors.light.onTint, ACCENTS[key].light)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(Colors.dark.onTint, ACCENTS[key].dark)).toBeGreaterThanOrEqual(4.5);
  });

  it('parses stored values, falling back to blue', () => {
    expect(parseAccent('rose')).toBe('rose');
    expect(parseAccent('plaid')).toBe('blue');
    expect(parseAccent(null)).toBe('blue');
  });

  it('holds the chosen accent for every screen', () => {
    setAccent('teal');
    expect(getAccent()).toBe('teal');
    setAccent('blue');
  });
});
