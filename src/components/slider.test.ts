import { snapToStep } from './slider';

describe('snapToStep', () => {
  it('snaps to the nearest step and stays in range', () => {
    expect(snapToStep(0.47, 0.1, 1, 0.05)).toBe(0.45);
    expect(snapToStep(0.48, 0.1, 1, 0.05)).toBe(0.5);
    expect(snapToStep(-3, 0.1, 1, 0.05)).toBe(0.1);
    expect(snapToStep(9, 0.1, 1, 0.05)).toBe(1);
  });

  it('has no floating point noise', () => {
    expect(snapToStep(0.1 + 0.2, 0, 1, 0.05)).toBe(0.3);
    expect(snapToStep(0.7000000001, 0.1, 1, 0.05)).toBe(0.7);
  });
});
