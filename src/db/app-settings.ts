import { DEFAULT_ACCENT, parseAccent, type AccentKey } from '@/lib/accent';
import { DEFAULT_TARGET, parseTarget, serializeTarget, type SessionTarget } from '@/lib/patterns';

import { getAllSettings, setSetting } from './settings';
import type { Db } from './types';

/** v1 stored 'gentle' | 'strong'; v3 stores on/off plus a strength (0.1-1.0). Old values are still read. */
export type HapticsLevel = 'off' | 'on';

export const MIN_STRENGTH = 0.1;
/** What v1's "Gentle" and "Strong" mean as a strength (V3_PLAN "Modules"). */
export const LEGACY_GENTLE_STRENGTH = 0.45;
export const LEGACY_STRONG_STRENGTH = 0.9;

/** How long after the last touch the screen fades to dark. */
export type FadeDelay = 3 | 5 | 10 | 30;
export const FADE_DELAY_OPTIONS: readonly FadeDelay[] = [3, 5, 10, 30];

export type EndSound = 'chime' | 'bell' | 'bowl' | 'none';
export const END_SOUND_OPTIONS: readonly EndSound[] = ['chime', 'bell', 'bowl', 'none'];

export type VisualKind = 'orb' | 'ring' | 'bar' | 'text';
export const VISUAL_OPTIONS: readonly VisualKind[] = ['orb', 'ring', 'bar', 'text'];

/** 'system' follows the OS "reduce motion" setting; 'on' always cross-fades instead of scaling. */
export type ReduceMotion = 'system' | 'on';
/** 'large' enlarges the phase word; the OS font scale is respected either way. */
export type TextScale = 'default' | 'large';

/** Get-ready countdown before the first breath. 0 = Off: the short 1.5 s settle from v1. */
export type PrepSeconds = 0 | 3 | 5 | 10;
export const PREP_OPTIONS: readonly PrepSeconds[] = [0, 3, 5, 10];

export type AppSettings = {
  patternId: string;
  target: SessionTarget;
  prepSeconds: PrepSeconds;
  haptics: HapticsLevel;
  hapticStrength: number;
  sound: boolean;
  volume: number;
  endSound: EndSound;
  fadeToDark: boolean;
  fadeDelay: FadeDelay;
  visual: VisualKind;
  reduceMotion: ReduceMotion;
  textScale: TextScale;
  accent: AccentKey;
  shakeToPause: boolean;
  lockGuidance: boolean;
  startOnOpen: boolean;
  hasSeenFirstRun: boolean;
  /** V3 P5, all default off: a 1-5 mood tap before and after a session, a quiet milestones list, a lock on History. */
  moodCheckin: boolean;
  milestones: boolean;
  historyLock: boolean;
  /** V3 P6, default off: write each saved session to Apple Health / Health Connect (write-only). */
  healthSync: boolean;
  /** Sessions that started before this moment (ms) are not written to Health: turning it on does not copy history. */
  healthSyncSince: number;
  /** V3 P7, iOS, default off: show the running session as a Live Activity (Lock Screen, Dynamic Island). */
  liveActivity: boolean;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  patternId: 'slow',
  target: DEFAULT_TARGET,
  prepSeconds: 0,
  haptics: 'on',
  hapticStrength: LEGACY_GENTLE_STRENGTH,
  sound: true,
  volume: 1,
  endSound: 'chime',
  fadeToDark: true,
  fadeDelay: 5,
  visual: 'orb',
  reduceMotion: 'system',
  textScale: 'default',
  accent: DEFAULT_ACCENT,
  shakeToPause: false,
  lockGuidance: false,
  startOnOpen: false,
  hasSeenFirstRun: false,
  moodCheckin: false,
  milestones: false,
  historyLock: false,
  healthSync: false,
  healthSyncSince: 0,
  liveActivity: false,
};

const KEYS = {
  patternId: 'patternId',
  target: 'target',
  legacyDurationMinutes: 'durationMinutes',
  prepSeconds: 'prepSeconds',
  haptics: 'haptics',
  hapticStrength: 'hapticStrength',
  sound: 'sound',
  volume: 'volume',
  endSound: 'endSound',
  fadeToDark: 'fadeToDark',
  fadeDelay: 'fadeDelay',
  visual: 'visual',
  reduceMotion: 'reduceMotion',
  textScale: 'textScale',
  accent: 'accent',
  shakeToPause: 'shakeToPause',
  lockGuidance: 'lockGuidance',
  startOnOpen: 'startOnOpen',
  hasSeenFirstRun: 'hasSeenFirstRun',
  moodCheckin: 'moodCheckin',
  milestones: 'milestones',
  historyLock: 'historyLock',
  healthSync: 'healthSync',
  healthSyncSince: 'healthSyncSince',
  liveActivity: 'liveActivity',
} as const;

export function clampStrength(value: number): number {
  return Math.min(1, Math.max(MIN_STRENGTH, Math.round(value * 100) / 100));
}

function parseNumber(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseOneOf<T extends string | number>(value: string | null, options: readonly T[], fallback: T): T {
  const found = options.find((option) => String(option) === value);
  return found === undefined ? fallback : found;
}

function parseBool(value: string | null, fallback: boolean): boolean {
  return value === null ? fallback : value === '1';
}

/** v1 stored minutes (or "open") under durationMinutes; read it when no v3 target has been saved yet. */
function parseLegacyDuration(value: string | null): SessionTarget | null {
  if (value === null) return null;
  if (value === 'open') return { kind: 'open' };
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? { kind: 'minutes', value: n } : null;
}

function parsePrep(value: string | null): PrepSeconds {
  const n = Number(value);
  return PREP_OPTIONS.includes(n as PrepSeconds) && value !== null ? (n as PrepSeconds) : DEFAULT_APP_SETTINGS.prepSeconds;
}

export async function getAppSettings(db: Db): Promise<AppSettings> {
  const stored = await getAllSettings(db);
  const raw = Object.fromEntries(Object.keys(KEYS).map((key) => [key, stored[KEYS[key as keyof typeof KEYS]] ?? null])) as Record<
    keyof typeof KEYS,
    string | null
  >;

  // v1 stored 'gentle' | 'strong'; both mean "on", with the v1 strength unless a slider value exists.
  const haptics: HapticsLevel = raw.haptics === 'off' ? 'off' : 'on';
  const legacyStrength = raw.haptics === 'strong' ? LEGACY_STRONG_STRENGTH : LEGACY_GENTLE_STRENGTH;
  const storedStrength = parseNumber(raw.hapticStrength);
  const storedVolume = parseNumber(raw.volume);

  return {
    patternId: raw.patternId ?? DEFAULT_APP_SETTINGS.patternId,
    target: parseTarget(raw.target) ?? parseLegacyDuration(raw.legacyDurationMinutes) ?? DEFAULT_APP_SETTINGS.target,
    prepSeconds: parsePrep(raw.prepSeconds),
    haptics,
    hapticStrength: storedStrength === null ? legacyStrength : clampStrength(storedStrength),
    sound: parseBool(raw.sound, DEFAULT_APP_SETTINGS.sound),
    volume: storedVolume === null ? DEFAULT_APP_SETTINGS.volume : Math.min(1, Math.max(0, storedVolume)),
    endSound: parseOneOf(raw.endSound, END_SOUND_OPTIONS, DEFAULT_APP_SETTINGS.endSound),
    fadeToDark: parseBool(raw.fadeToDark, DEFAULT_APP_SETTINGS.fadeToDark),
    fadeDelay: parseOneOf(raw.fadeDelay, FADE_DELAY_OPTIONS, DEFAULT_APP_SETTINGS.fadeDelay),
    visual: parseOneOf(raw.visual, VISUAL_OPTIONS, DEFAULT_APP_SETTINGS.visual),
    reduceMotion: parseOneOf(raw.reduceMotion, ['system', 'on'] as const, DEFAULT_APP_SETTINGS.reduceMotion),
    textScale: parseOneOf(raw.textScale, ['default', 'large'] as const, DEFAULT_APP_SETTINGS.textScale),
    accent: parseAccent(raw.accent),
    shakeToPause: parseBool(raw.shakeToPause, DEFAULT_APP_SETTINGS.shakeToPause),
    lockGuidance: parseBool(raw.lockGuidance, DEFAULT_APP_SETTINGS.lockGuidance),
    startOnOpen: parseBool(raw.startOnOpen, DEFAULT_APP_SETTINGS.startOnOpen),
    hasSeenFirstRun: parseBool(raw.hasSeenFirstRun, DEFAULT_APP_SETTINGS.hasSeenFirstRun),
    moodCheckin: parseBool(raw.moodCheckin, DEFAULT_APP_SETTINGS.moodCheckin),
    milestones: parseBool(raw.milestones, DEFAULT_APP_SETTINGS.milestones),
    historyLock: parseBool(raw.historyLock, DEFAULT_APP_SETTINGS.historyLock),
    healthSync: parseBool(raw.healthSync, DEFAULT_APP_SETTINGS.healthSync),
    healthSyncSince: Math.max(0, parseNumber(raw.healthSyncSince) ?? 0),
    liveActivity: parseBool(raw.liveActivity, DEFAULT_APP_SETTINGS.liveActivity),
  };
}

/** Selects the pattern (preset id or custom pattern id) shown on Home. */
export async function setPattern(db: Db, patternId: string): Promise<void> {
  await setSetting(db, KEYS.patternId, patternId);
}

export async function setTarget(db: Db, target: SessionTarget): Promise<void> {
  await setSetting(db, KEYS.target, serializeTarget(target));
}

export async function setPrepSeconds(db: Db, seconds: PrepSeconds): Promise<void> {
  await setSetting(db, KEYS.prepSeconds, String(seconds));
}

export async function setHaptics(db: Db, haptics: HapticsLevel): Promise<void> {
  await setSetting(db, KEYS.haptics, haptics);
}

export async function setBoolSetting(
  db: Db,
  key: 'sound' | 'fadeToDark' | 'lockGuidance' | 'startOnOpen' | 'hasSeenFirstRun' | 'shakeToPause' | 'moodCheckin' | 'milestones' | 'historyLock' | 'healthSync' | 'liveActivity',
  value: boolean
): Promise<void> {
  await setSetting(db, KEYS[key], value ? '1' : '0');
}

export async function setHapticStrength(db: Db, strength: number): Promise<void> {
  await setSetting(db, KEYS.hapticStrength, String(clampStrength(strength)));
}

export async function setVolume(db: Db, volume: number): Promise<void> {
  await setSetting(db, KEYS.volume, String(Math.min(1, Math.max(0, Math.round(volume * 100) / 100))));
}

/** Choice settings (end sound, fade delay, visual, reduce motion, text size, accent): one setter, typed per key. */
export async function setChoiceSetting<K extends 'endSound' | 'fadeDelay' | 'visual' | 'reduceMotion' | 'textScale' | 'accent'>(
  db: Db,
  key: K,
  value: AppSettings[K]
): Promise<void> {
  await setSetting(db, KEYS[key], String(value));
}

/** Turns Health writing on (remembering from when) or off. Call it only after the permission was granted. */
export async function setHealthSync(db: Db, on: boolean, nowMs = Date.now()): Promise<void> {
  await setBoolSetting(db, 'healthSync', on);
  if (on) await setSetting(db, KEYS.healthSyncSince, String(nowMs));
}
