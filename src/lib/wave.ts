import type { Phase } from '@/lib/patterns';

/** One phase of a breath as a stretch of the wave: `from`/`to` are levels 0 (empty lungs) .. 1 (full). */
export type WaveSeg = { startFrac: number; endFrac: number; from: number; to: number; rises: boolean; falls: boolean };

/** Level a phase leaves the lungs at: exhale empties, everything else fills; a hold keeps the level before it. */
function levelAfter(phases: readonly Phase[], index: number): number {
  for (let i = index; i >= 0; i--) {
    if (phases[i].kind === 'exhale') return 0;
    if (phases[i].kind !== 'hold') return 1;
  }
  // Holds at the very start follow the last phase of the previous breath.
  for (let i = phases.length - 1; i > index; i--) {
    if (phases[i].kind === 'exhale') return 0;
    if (phases[i].kind !== 'hold') return 1;
  }
  return 0;
}

/** The pattern as one breath wave: rising for in, flat for hold, falling for out. Fractions are of the whole breath's time. */
export function waveSegments(phases: readonly Phase[]): WaveSeg[] {
  const total = phases.reduce((sum, p) => sum + p.seconds, 0) || 1;
  let acc = 0;
  return phases.map((phase, i) => {
    const startFrac = acc / total;
    acc += phase.seconds;
    const to = levelAfter(phases, i);
    const from = i === 0 ? levelAfter(phases, phases.length - 1) : levelAfter(phases, i - 1);
    const flat = phase.kind === 'hold';
    return { startFrac, endFrac: acc / total, from: flat ? to : from, to, rises: !flat && to > from, falls: !flat && to < from };
  });
}

/** Same ease as the orb (quad in-out), so the dot and the orb breathe alike. */
export function easeInOutQuad(t: number): number {
  'worklet';
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;
}

/** Wave level (0..1) at a position `pos` (0..1) along one breath. */
export function waveLevel(segs: readonly WaveSeg[], pos: number): number {
  'worklet';
  const p = Math.min(1, Math.max(0, pos));
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (p <= s.endFrac || i === segs.length - 1) {
      const span = s.endFrac - s.startFrac;
      const t = span > 0 ? Math.min(1, Math.max(0, (p - s.startFrac) / span)) : 1;
      return s.from + (s.to - s.from) * easeInOutQuad(t);
    }
  }
  return 0;
}

/** SVG path of the wave inside a width x height box with `pad` around it (level 1 = top). */
export function wavePath(segs: readonly WaveSeg[], width: number, height: number, pad: number): string {
  const w = width - 2 * pad;
  const h = height - 2 * pad;
  const pt = (pos: number) => `${(pad + pos * w).toFixed(1)} ${(pad + (1 - waveLevel(segs, pos)) * h).toFixed(1)}`;
  const parts: string[] = [`M ${pt(0)}`];
  for (const s of segs) {
    const steps = s.rises || s.falls ? 14 : 1;
    for (let k = 1; k <= steps; k++) parts.push(`L ${pt(s.startFrac + ((s.endFrac - s.startFrac) * k) / steps)}`);
  }
  return parts.join(' ');
}
