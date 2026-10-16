// Export and backup formats (V3 P5). Pure: no files, no database. The screen writes the strings to a file.

import { customInputFromPhases, validateCustomPattern, type Phase, type PhaseKind } from './patterns';

export const BACKUP_APP = 'breathe-well';
export const BACKUP_VERSION = 1;
/** A backup file larger than this is refused before it is parsed. */
export const MAX_BACKUP_CHARS = 20_000_000;
/**
 * Settings that describe a running session, or a permission that belongs to one phone (the Health toggle:
 * a restored "on" would write without ever having asked, V3 P6). Never exported, never restored.
 */
export const TRANSIENT_SETTING_KEYS: readonly string[] = ['activeSession', 'healthSync', 'healthSyncSince'];

export type ExportSession = {
  startedAt: number;
  patternName: string;
  patternId: string | null;
  /** Serialized target ("m:3", "b:20", "open") or null. */
  target: string | null;
  phases: Phase[];
  plannedSeconds: number | null;
  actualSeconds: number;
  breaths: number;
  completed: boolean;
  note: string;
  tags: string;
  moodBefore: number | null;
  moodAfter: number | null;
  healthSynced: boolean;
  /** v3.1: saved by the app after it was closed mid-session (guided time only). Older backups: false. */
  interrupted: boolean;
};

export type BackupCustomPattern = { id: string; name: string; phases: Phase[]; createdAt: number; updatedAt: number };

export type BackupPatternPrefs = {
  patternId: string;
  target: string | null;
  haptics: string | null;
  sound: number | null;
  fade: number | null;
  guidance: string | null;
  favorite: number;
  lastUsedAt: number | null;
};

export type BackupReminder = { hour: number; minute: number; weekdays: string; patternId: string | null; enabled: number };

export type BackupData = {
  settings: Record<string, string>;
  customPatterns: BackupCustomPattern[];
  patternPrefs: BackupPatternPrefs[];
  sessions: ExportSession[];
  reminders: BackupReminder[];
};

export type BackupFile = {
  app: typeof BACKUP_APP;
  backupVersion: number;
  exportedAt: string;
  /** The database schema version the data came from (informational). */
  schemaVersion: number;
  data: BackupData;
};

// ---- CSV ----

export const CSV_COLUMNS = [
  'started_at',
  'pattern',
  'pattern_id',
  'target',
  'planned_seconds',
  'actual_seconds',
  'breaths',
  'completed',
  'mood_before',
  'mood_after',
  'tags',
  'note',
  'interrupted',
] as const;

/**
 * One CSV cell. Quotes when needed (RFC 4180). Text that a spreadsheet would read as a formula (starts with
 * = + - @ or a control character) gets a leading apostrophe so opening the file cannot run anything.
 */
export function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  let text = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function sessionsToCsv(sessions: readonly ExportSession[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const s of sessions) {
    lines.push(
      [
        csvCell(new Date(s.startedAt).toISOString()),
        csvCell(s.patternName),
        csvCell(s.patternId),
        csvCell(s.target),
        csvCell(s.plannedSeconds),
        csvCell(round1(s.actualSeconds)),
        csvCell(s.breaths),
        csvCell(s.completed),
        csvCell(s.moodBefore),
        csvCell(s.moodAfter),
        csvCell(s.tags),
        csvCell(s.note),
        csvCell(s.interrupted),
      ].join(',')
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

// ---- JSON: sessions only, and the full backup ----

export function sessionsToJson(sessions: readonly ExportSession[], now: number): string {
  return JSON.stringify({ app: BACKUP_APP, kind: 'sessions', exportedAt: new Date(now).toISOString(), sessions }, null, 2);
}

export function buildBackup(data: BackupData, schemaVersion: number, now: number): BackupFile {
  const settings = Object.fromEntries(Object.entries(data.settings).filter(([key]) => !TRANSIENT_SETTING_KEYS.includes(key)));
  return { app: BACKUP_APP, backupVersion: BACKUP_VERSION, exportedAt: new Date(now).toISOString(), schemaVersion, data: { ...data, settings } };
}

export function backupToJson(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

/** `breathe-backup-2026-09-30.json` (local date). */
export function backupFileName(now: number, extension: 'json' | 'csv' = 'json', prefix = 'breathe-backup'): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.${extension}`;
}

// ---- Parsing a backup back in ----

export type ParsedBackup = { ok: true; backup: BackupFile; counts: { sessions: number; customPatterns: number; reminders: number } } | { ok: false; error: string };

const PHASE_KINDS: readonly PhaseKind[] = ['inhale', 'sip', 'hold', 'exhale'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const nullableNum = (v: unknown) => v === null || v === undefined || isNum(v);
const nullableStr = (v: unknown) => v === null || v === undefined || isStr(v);

function validPhases(v: unknown): v is Phase[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.length <= 12 &&
    v.every((p) => isObj(p) && PHASE_KINDS.includes(p.kind as PhaseKind) && isNum(p.seconds) && p.seconds > 0 && p.seconds <= 600)
  );
}

/**
 * A restored custom pattern must be one the editor itself could make (0.5 s steps, phase and breath limits, no
 * long holds): a hand-edited file must not get around them (REVIEW_V3 #16). Session history keeps validPhases.
 */
function editorAccepts(phases: Phase[]): boolean {
  const result = validateCustomPattern(customInputFromPhases(phases));
  return (
    result.ok &&
    result.phases.length === phases.length &&
    result.phases.every((p, i) => p.kind === phases[i].kind && p.seconds === phases[i].seconds)
  );
}

function fail(error: string): ParsedBackup {
  return { ok: false, error };
}

/**
 * Reads and checks a backup file. Anything doubtful refuses the whole file, so a restore never half-applies.
 * Missing optional fields are filled with their defaults.
 */
export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_BACKUP_CHARS) return fail('That file is too large to be a Breathe Well backup.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('That file is not a Breathe Well backup (it could not be read as JSON).');
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP || !isObj(raw.data)) return fail('That file is not a Breathe Well backup.');
  if (!isNum(raw.backupVersion) || raw.backupVersion < 1) return fail('That backup has no version number.');
  if (raw.backupVersion > BACKUP_VERSION) return fail('That backup was made by a newer version of the app. Update the app first.');

  const data = raw.data;
  const settingsIn = data.settings ?? {};
  if (!isObj(settingsIn) || !Object.values(settingsIn).every(isStr)) return fail('The backup\'s settings are damaged.');
  const settings = Object.fromEntries(Object.entries(settingsIn as Record<string, string>).filter(([key]) => !TRANSIENT_SETTING_KEYS.includes(key)));

  const customIn = data.customPatterns ?? [];
  if (!Array.isArray(customIn)) return fail('The backup\'s custom patterns are damaged.');
  const customPatterns: BackupCustomPattern[] = [];
  const seenIds = new Set<string>();
  for (const c of customIn) {
    if (!isObj(c) || !isStr(c.id) || !isStr(c.name) || !validPhases(c.phases) || !editorAccepts(c.phases) || !isNum(c.createdAt) || !isNum(c.updatedAt) || seenIds.has(c.id)) {
      return fail('The backup\'s custom patterns are damaged.');
    }
    seenIds.add(c.id);
    customPatterns.push({ id: c.id, name: c.name, phases: c.phases, createdAt: c.createdAt, updatedAt: c.updatedAt });
  }

  const prefsIn = data.patternPrefs ?? [];
  if (!Array.isArray(prefsIn)) return fail('The backup\'s pattern settings are damaged.');
  const patternPrefs: BackupPatternPrefs[] = [];
  const seenPrefs = new Set<string>();
  for (const p of prefsIn) {
    if (
      !isObj(p) ||
      !isStr(p.patternId) ||
      seenPrefs.has(p.patternId) ||
      !nullableStr(p.target) ||
      !nullableStr(p.haptics) ||
      !nullableNum(p.sound) ||
      !nullableNum(p.fade) ||
      !nullableStr(p.guidance) ||
      !nullableNum(p.lastUsedAt)
    ) {
      return fail('The backup\'s pattern settings are damaged.');
    }
    seenPrefs.add(p.patternId);
    patternPrefs.push({
      patternId: p.patternId,
      target: (p.target as string | null | undefined) ?? null,
      haptics: (p.haptics as string | null | undefined) ?? null,
      sound: (p.sound as number | null | undefined) ?? null,
      fade: (p.fade as number | null | undefined) ?? null,
      guidance: (p.guidance as string | null | undefined) ?? null,
      favorite: p.favorite === 1 || p.favorite === true ? 1 : 0,
      lastUsedAt: (p.lastUsedAt as number | null | undefined) ?? null,
    });
  }

  const sessionsIn = data.sessions ?? [];
  if (!Array.isArray(sessionsIn)) return fail('The backup\'s sessions are damaged.');
  const sessions: ExportSession[] = [];
  for (const s of sessionsIn) {
    if (
      !isObj(s) ||
      !isNum(s.startedAt) ||
      !isStr(s.patternName) ||
      !validPhases(s.phases) ||
      !isNum(s.actualSeconds) ||
      s.actualSeconds < 0 ||
      !isNum(s.breaths) ||
      !nullableNum(s.plannedSeconds) ||
      !nullableStr(s.patternId) ||
      !nullableStr(s.target) ||
      !nullableNum(s.moodBefore) ||
      !nullableNum(s.moodAfter) ||
      (s.note !== undefined && !isStr(s.note)) ||
      (s.tags !== undefined && !isStr(s.tags))
    ) {
      return fail('The backup\'s sessions are damaged.');
    }
    sessions.push({
      startedAt: s.startedAt,
      patternName: s.patternName,
      patternId: (s.patternId as string | null | undefined) ?? null,
      target: (s.target as string | null | undefined) ?? null,
      phases: s.phases,
      plannedSeconds: (s.plannedSeconds as number | null | undefined) ?? null,
      actualSeconds: s.actualSeconds,
      breaths: s.breaths,
      completed: s.completed === true || s.completed === 1,
      note: (s.note as string | undefined) ?? '',
      tags: (s.tags as string | undefined) ?? '',
      moodBefore: validMood(s.moodBefore),
      moodAfter: validMood(s.moodAfter),
      healthSynced: s.healthSynced === true || s.healthSynced === 1,
      interrupted: s.interrupted === true || s.interrupted === 1,
    });
  }

  const remindersIn = data.reminders ?? [];
  if (!Array.isArray(remindersIn)) return fail('The backup\'s reminders are damaged.');
  const reminders: BackupReminder[] = [];
  for (const r of remindersIn) {
    if (!isObj(r) || !isNum(r.hour) || !isNum(r.minute) || !isStr(r.weekdays) || !nullableStr(r.patternId) || r.hour < 0 || r.hour > 23 || r.minute < 0 || r.minute > 59) {
      return fail('The backup\'s reminders are damaged.');
    }
    reminders.push({
      hour: r.hour,
      minute: r.minute,
      weekdays: r.weekdays,
      patternId: (r.patternId as string | null | undefined) ?? null,
      enabled: r.enabled === 0 || r.enabled === false ? 0 : 1,
    });
  }

  const backup: BackupFile = {
    app: BACKUP_APP,
    backupVersion: raw.backupVersion,
    exportedAt: isStr(raw.exportedAt) ? raw.exportedAt : '',
    schemaVersion: isNum(raw.schemaVersion) ? raw.schemaVersion : 0,
    data: { settings, customPatterns, patternPrefs, sessions, reminders },
  };
  return { ok: true, backup, counts: { sessions: sessions.length, customPatterns: customPatterns.length, reminders: reminders.length } };
}

/** A mood is a whole number 1-5; anything else becomes "not answered". */
function validMood(v: unknown): number | null {
  return isNum(v) && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;
}
