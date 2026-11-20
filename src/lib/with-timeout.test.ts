import { withTimeout } from './with-timeout';

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns the value when the promise answers in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'late')).resolves.toBe('ok');
  });

  it('returns the fallback when the promise never answers', async () => {
    const pending = withTimeout(new Promise<string>(() => {}), 3000, 'fallback');
    jest.advanceTimersByTime(3000);
    await expect(pending).resolves.toBe('fallback');
  });

  it('returns the fallback when the promise rejects', async () => {
    await expect(withTimeout(Promise.reject(new Error('x')), 1000, 'fallback')).resolves.toBe('fallback');
  });

  it('ignores an answer that arrives after the timeout', async () => {
    let resolveLate: (v: string) => void = () => {};
    const pending = withTimeout(new Promise<string>((r) => (resolveLate = r)), 1000, 'fallback');
    jest.advanceTimersByTime(1000);
    resolveLate('late');
    await expect(pending).resolves.toBe('fallback');
  });
});
