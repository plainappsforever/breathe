import type { LaunchIntent } from './launch-intent';
import type { SessionTarget } from './patterns';

type Repeatable = {
  patternId: string | null;
  patternName: string;
  target: SessionTarget | null;
  plannedSeconds: number | null;
};

/** The length to repeat: the saved target, else the planned length in whole minutes (v1 sessions), else the default. */
export function repeatTarget(session: Pick<Repeatable, 'target' | 'plannedSeconds'>): SessionTarget | undefined {
  if (session.target) return session.target;
  if (session.plannedSeconds && session.plannedSeconds >= 30) {
    const minutes = Math.min(180, Math.max(1, Math.round(session.plannedSeconds / 60)));
    return { kind: 'minutes', value: minutes };
  }
  return undefined;
}

/**
 * The launch intent for "Repeat this session", or null when the pattern no longer exists (a deleted custom
 * pattern). v1 sessions have no pattern id; they match a preset by name.
 */
export function repeatIntent(session: Repeatable, patternExists: boolean, presetIdForName: string | null): LaunchIntent | null {
  const patternId = session.patternId && patternExists ? session.patternId : session.patternId ? null : presetIdForName;
  if (!patternId) return null;
  const target = repeatTarget(session);
  return target ? { action: 'start', patternId, target } : { action: 'start', patternId };
}
