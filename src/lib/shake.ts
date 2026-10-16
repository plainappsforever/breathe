/**
 * Shake detection for "Shake to pause" (V3 P3). Pure: feed accelerometer samples (in g, gravity
 * included, so a phone at rest reads about 1) and it says when a shake happened.
 * A shake = the magnitude rises above the threshold twice within a short window. A sample that stays
 * above the threshold counts once (one hit per rise), and after a shake the detector stays quiet
 * for a moment so one shake never fires twice.
 */
export const SHAKE_THRESHOLD_G = 1.8;
export const SHAKE_WINDOW_MS = 500;
export const SHAKE_COOLDOWN_MS = 1500;

export class ShakeDetector {
  private above = false;
  private lastHitAt: number | null = null;
  private quietUntil = 0;

  /** Returns true on the sample that completes a shake. */
  push(x: number, y: number, z: number, atMs: number): boolean {
    const isAbove = Math.hypot(x, y, z) > SHAKE_THRESHOLD_G;
    const rose = isAbove && !this.above;
    this.above = isAbove;
    if (!rose || atMs < this.quietUntil) return false;
    if (this.lastHitAt !== null && atMs - this.lastHitAt <= SHAKE_WINDOW_MS) {
      this.lastHitAt = null;
      this.quietUntil = atMs + SHAKE_COOLDOWN_MS;
      return true;
    }
    this.lastHitAt = atMs;
    return false;
  }

  reset(): void {
    this.above = false;
    this.lastHitAt = null;
    this.quietUntil = 0;
  }
}
