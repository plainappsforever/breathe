/**
 * Resolves with the promise's value, or with `fallback` when it has not answered within `ms` (or it rejects).
 * Used so no screen waits on the phone's notification service, which can stay silent (seen on the iOS 27.0 simulator).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}
