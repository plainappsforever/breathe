import { canUseLock, initialGateState, LOCK_HOLD_MAX_MS, lockHeldOpen, lockUnavailableReason, withLockHeldOpen, type LockCapability } from './history-lock';

const cap = (hasHardware: boolean, level: LockCapability['level']): LockCapability => ({ hasHardware, level });

describe('history lock decisions', () => {
  it('can be used with biometrics, or with a passcode alone', () => {
    expect(canUseLock(cap(true, 'biometric'))).toBe(true);
    expect(canUseLock(cap(true, 'secret'))).toBe(true);
    expect(canUseLock(cap(false, 'secret'))).toBe(true); // Android without a sensor but with a PIN
    expect(canUseLock(cap(true, 'none'))).toBe(false);
    expect(canUseLock(cap(false, 'none'))).toBe(false);
  });

  it('starts locked only when switched on and possible', () => {
    expect(initialGateState(true, cap(true, 'biometric'))).toBe('locked');
    expect(initialGateState(false, cap(true, 'biometric'))).toBe('open');
  });

  it('never locks the owner out when the phone can no longer ask', () => {
    expect(initialGateState(true, cap(true, 'none'))).toBe('open');
    expect(initialGateState(true, cap(false, 'none'))).toBe('open');
  });

  it('explains why the switch is unavailable', () => {
    expect(lockUnavailableReason(cap(true, 'biometric'))).toBeNull();
    expect(lockUnavailableReason(cap(true, 'none'))).toMatch(/Set up Face ID/);
    expect(lockUnavailableReason(cap(false, 'none'))).toMatch(/no Face ID/);
  });
});

describe('lock held open for the app\'s own picker / share sheet (REVIEW_V3 #10)', () => {
  it('holds while the system screen is open and releases when it returns, also after an error', async () => {
    expect(lockHeldOpen()).toBe(false);
    let during = false;
    await withLockHeldOpen(async () => {
      during = lockHeldOpen();
    });
    expect(during).toBe(true);
    expect(lockHeldOpen()).toBe(false);
    await expect(
      withLockHeldOpen(async () => {
        throw new Error('picker failed');
      })
    ).rejects.toThrow('picker failed');
    expect(lockHeldOpen()).toBe(false);
  });

  it('never holds longer than LOCK_HOLD_MAX_MS (the user left the app from the picker)', async () => {
    let release: () => void = () => {};
    const open = withLockHeldOpen(() => new Promise<void>((resolve) => (release = resolve)), () => 1_000);
    expect(lockHeldOpen(1_000 + LOCK_HOLD_MAX_MS - 1)).toBe(true);
    expect(lockHeldOpen(1_000 + LOCK_HOLD_MAX_MS)).toBe(false);
    release();
    await open;
  });
});
