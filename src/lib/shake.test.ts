import { ShakeDetector } from './shake';

/** Feeds magnitudes (in g) as (0, 0, g) samples, 100 ms apart from t0; returns the times where a shake fired. */
function run(magnitudes: number[], t0 = 1000): number[] {
  const detector = new ShakeDetector();
  const fired: number[] = [];
  magnitudes.forEach((g, i) => {
    const at = t0 + i * 100;
    if (detector.push(0, 0, g, at)) fired.push(at);
  });
  return fired;
}

describe('ShakeDetector', () => {
  it('stays quiet for a phone lying still or being carried', () => {
    expect(run([1, 1, 1.02, 0.98, 1.1, 1.3, 1.5, 1.2, 1, 1])).toEqual([]);
  });

  it('fires on the second hit above 1.8 g within 500 ms', () => {
    // hit at index 1 (t=1100), back to rest, hit at index 3 (t=1300)
    expect(run([1, 2.4, 1, 2.6, 1, 1])).toEqual([1300]);
  });

  it('counts one long spike as one hit, not two', () => {
    expect(run([1, 2.5, 2.7, 2.6, 1, 1])).toEqual([]);
  });

  it('ignores two hits more than 500 ms apart', () => {
    expect(run([1, 2.4, 1, 1, 1, 1, 1, 2.4, 1, 1])).toEqual([]);
  });

  it('uses all three axes', () => {
    const detector = new ShakeDetector();
    expect(detector.push(1.5, 1.5, 0, 0)).toBe(false); // magnitude 2.12: first hit
    detector.push(0, 0, 1, 100);
    expect(detector.push(0, 1.4, 1.4, 200)).toBe(true); // magnitude 1.98: second hit
  });

  it('fires once per shake and again after the quiet period', () => {
    const detector = new ShakeDetector();
    const results: boolean[] = [];
    for (const [g, t] of [[2.4, 0], [1, 100], [2.4, 200], [1, 300], [2.4, 400], [1, 500], [2.4, 600]] as const) {
      results.push(detector.push(0, 0, g, t));
    }
    expect(results).toEqual([false, false, true, false, false, false, false]); // cooldown swallows the rest
    // A second shake 2 s later works.
    detector.push(0, 0, 1, 1700);
    expect(detector.push(0, 0, 2.4, 2000)).toBe(false);
    detector.push(0, 0, 1, 2100);
    expect(detector.push(0, 0, 2.4, 2200)).toBe(true);
  });

  it('can be reset', () => {
    const detector = new ShakeDetector();
    detector.push(0, 0, 2.4, 0);
    detector.reset();
    detector.push(0, 0, 1, 50);
    expect(detector.push(0, 0, 2.4, 100)).toBe(false);
  });
});
