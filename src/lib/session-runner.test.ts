import { usesNativeRunner } from './session-runner';

describe('usesNativeRunner', () => {
  it('only Android with "Keep guiding when locked" on and the module built in', () => {
    expect(usesNativeRunner('android', true, true)).toBe(true);
    expect(usesNativeRunner('android', false, true)).toBe(false);
    expect(usesNativeRunner('android', true, false)).toBe(false);
    expect(usesNativeRunner('ios', true, true)).toBe(false);
    expect(usesNativeRunner('web', true, true)).toBe(false);
  });
});
