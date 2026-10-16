import { formatSeconds } from './patterns';

/** End view summary line, e.g. "3 min · 18 breaths" or "45 s · 1 breath". SPEC "End view". */
export function formatSessionSummary(actualSeconds: number, breaths: number): string {
  const duration = actualSeconds < 60 ? `${Math.round(actualSeconds)} s` : `${formatSeconds(Math.round((actualSeconds / 60) * 2) / 2)} min`;
  const breathWord = breaths === 1 ? 'breath' : 'breaths';
  return `${duration} · ${breaths} ${breathWord}`;
}
