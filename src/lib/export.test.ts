import {
  backupFileName,
  backupToJson,
  buildBackup,
  csvCell,
  parseBackup,
  sessionsToCsv,
  sessionsToJson,
  type BackupData,
  type ExportSession,
} from './export';

const session = (extra: Partial<ExportSession> = {}): ExportSession => ({
  startedAt: Date.UTC(2026, 8, 30, 8, 0, 0),
  patternName: 'Slow',
  patternId: 'slow',
  target: 'm:3',
  phases: [
    { kind: 'inhale', seconds: 5 },
    { kind: 'exhale', seconds: 5 },
  ],
  plannedSeconds: 180,
  actualSeconds: 180.04,
  breaths: 18,
  completed: true,
  note: '',
  tags: '',
  moodBefore: null,
  moodAfter: null,
  healthSynced: false,
  interrupted: false,
  ...extra,
});

const emptyData = (over: Partial<BackupData> = {}): BackupData => ({ settings: {}, customPatterns: [], patternPrefs: [], sessions: [], reminders: [], ...over });

describe('CSV', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(true)).toBe('yes');
    expect(csvCell(12.5)).toBe('12.5');
  });

  it('defuses spreadsheet formulas in text but leaves numbers alone', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('-2 later')).toBe("'-2 later");
    expect(csvCell(-3)).toBe('-3');
  });

  it('writes a header and one line per session', () => {
    const csv = sessionsToCsv([session({ note: 'Felt, calmer', tags: 'work', moodBefore: 2, moodAfter: 4 }), session({ patternId: null, target: null, plannedSeconds: null, completed: false, interrupted: true })]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('started_at,pattern,pattern_id,target,planned_seconds,actual_seconds,breaths,completed,mood_before,mood_after,tags,note,interrupted');
    expect(lines[1]).toBe('2026-09-30T08:00:00.000Z,Slow,slow,m:3,180,180,18,yes,2,4,work,"Felt, calmer",no');
    expect(lines[2]).toBe('2026-09-30T08:00:00.000Z,Slow,,,,180,18,no,,,,,yes');
  });

  it('is just the header with no sessions', () => {
    expect(sessionsToCsv([]).trimEnd().split('\r\n')).toHaveLength(1);
  });
});

describe('JSON and file names', () => {
  it('exports sessions as JSON', () => {
    const parsed = JSON.parse(sessionsToJson([session()], Date.UTC(2026, 8, 30)));
    expect(parsed.app).toBe('breathe-well');
    expect(parsed.sessions).toHaveLength(1);
  });

  it('names files with the local date', () => {
    expect(backupFileName(new Date(2026, 8, 5, 12).getTime())).toBe('breathe-backup-2026-09-05.json');
    expect(backupFileName(new Date(2026, 11, 31, 23).getTime(), 'csv', 'breathe-sessions')).toBe('breathe-sessions-2026-12-31.csv');
  });
});

describe('parseBackup', () => {
  const good = () =>
    backupToJson(
      buildBackup(
        emptyData({
          settings: { accent: 'teal', activeSession: '{"x":1}' },
          customPatterns: [{ id: 'c_1', name: 'Mine', phases: [{ kind: 'inhale', seconds: 4 }, { kind: 'exhale', seconds: 6 }], createdAt: 1, updatedAt: 2 }],
          patternPrefs: [{ patternId: 'box', target: 'm:5', haptics: null, sound: 0, fade: null, guidance: null, favorite: 1, lastUsedAt: 5 }],
          sessions: [session({ note: 'n', tags: 'a,b', moodBefore: 1, moodAfter: 5 })],
          reminders: [{ hour: 7, minute: 15, weekdays: '1,2', patternId: null, enabled: 1 }],
        }),
        3,
        Date.UTC(2026, 8, 30)
      )
    );

  it('reads what buildBackup wrote, without the running-session record', () => {
    const result = parseBackup(good());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts).toEqual({ sessions: 1, customPatterns: 1, reminders: 1 });
    expect(result.backup.data.settings).toEqual({ accent: 'teal' });
    expect(result.backup.data.sessions[0]).toMatchObject({ note: 'n', tags: 'a,b', moodBefore: 1, moodAfter: 5, completed: true });
    expect(result.backup.data.patternPrefs[0].favorite).toBe(1);
  });

  it('refuses things that are not backups', () => {
    for (const text of ['', 'not json', '[]', '{}', '{"app":"other","backupVersion":1,"data":{}}', '{"app":"breathe-well","data":{}}']) {
      expect(parseBackup(text).ok).toBe(false);
    }
  });

  it('refuses a backup from a newer version', () => {
    const newer = JSON.parse(good());
    newer.backupVersion = 99;
    const result = parseBackup(JSON.stringify(newer));
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toMatch(/newer version/);
  });

  it('refuses damaged parts instead of half-restoring', () => {
    const damage = (edit: (b: any) => void) => {
      const b = JSON.parse(good());
      edit(b);
      return parseBackup(JSON.stringify(b)).ok;
    };
    expect(damage((b) => (b.data.sessions[0].phases = []))).toBe(false);
    expect(damage((b) => (b.data.sessions[0].phases = [{ kind: 'shout', seconds: 3 }]))).toBe(false);
    expect(damage((b) => (b.data.sessions[0].actualSeconds = 'long'))).toBe(false);
    expect(damage((b) => (b.data.sessions = 'x'))).toBe(false);
    expect(damage((b) => (b.data.customPatterns[0].phases[0].seconds = -1))).toBe(false);
    expect(damage((b) => b.data.customPatterns.push(b.data.customPatterns[0]))).toBe(false);
    expect(damage((b) => (b.data.settings.accent = 5))).toBe(false);
    expect(damage((b) => (b.data.reminders[0].hour = 25))).toBe(false);
    expect(damage((b) => b.data.patternPrefs.push(b.data.patternPrefs[0]))).toBe(false);
  });

  it('restores only custom patterns the editor itself could make (REVIEW_V3 #16)', () => {
    const withPhases = (phases: unknown) => {
      const b = JSON.parse(good());
      b.data.customPatterns[0].phases = phases;
      return parseBackup(JSON.stringify(b)).ok;
    };
    expect(withPhases([{ kind: 'inhale', seconds: 4 }, { kind: 'hold', seconds: 7 }, { kind: 'exhale', seconds: 8 }])).toBe(true);
    expect(withPhases([{ kind: 'inhale', seconds: 4 }, { kind: 'hold', seconds: 600 }, { kind: 'exhale', seconds: 6 }])).toBe(false);
    expect(withPhases([{ kind: 'inhale', seconds: 0.001 }, { kind: 'exhale', seconds: 6 }])).toBe(false);
    expect(withPhases([{ kind: 'inhale', seconds: 4.3 }, { kind: 'exhale', seconds: 6 }])).toBe(false);
    expect(withPhases([{ kind: 'exhale', seconds: 6 }, { kind: 'inhale', seconds: 4 }])).toBe(false);
    // Session history is not held to the editor's rules (old or preset sessions stay restorable).
    const b = JSON.parse(good());
    b.data.sessions[0].phases = [{ kind: 'inhale', seconds: 30 }, { kind: 'hold', seconds: 40 }, { kind: 'exhale', seconds: 30 }];
    expect(parseBackup(JSON.stringify(b)).ok).toBe(true);
  });

  it('fills defaults for optional fields and clears an impossible mood', () => {
    const b = JSON.parse(good());
    delete b.data.sessions[0].note;
    delete b.data.sessions[0].tags;
    b.data.sessions[0].moodBefore = 9;
    delete b.data.reminders;
    const result = parseBackup(JSON.stringify(b));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.data.sessions[0]).toMatchObject({ note: '', tags: '', moodBefore: null });
    expect(result.backup.data.reminders).toEqual([]);
  });

  it('refuses an oversized file without parsing it', () => {
    expect(parseBackup('x'.repeat(20_000_001)).ok).toBe(false);
  });
});
