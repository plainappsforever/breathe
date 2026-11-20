import { REVIEW_AFTER_SESSIONS, shouldAskForReview } from '@/lib/rating-prompt';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.1.0' } } }));
jest.mock('expo-sqlite/kv-store', () => ({ __esModule: true, default: { getItemSync: () => null, setItemSync: () => {} } }));
jest.mock('expo-store-review', () => ({ isAvailableAsync: async () => true, requestReview: async () => {} }));

describe('shouldAskForReview', () => {
  it('waits for the fifth completed session', () => {
    expect(REVIEW_AFTER_SESSIONS).toBe(5);
    expect(shouldAskForReview(0, null, '1.1.0')).toBe(false);
    expect(shouldAskForReview(4, null, '1.1.0')).toBe(false);
    expect(shouldAskForReview(5, null, '1.1.0')).toBe(true);
  });

  it('asks at most once per app version', () => {
    expect(shouldAskForReview(9, '1.1.0', '1.1.0')).toBe(false);
    expect(shouldAskForReview(9, '1.0.0', '1.1.0')).toBe(true);
  });
});
