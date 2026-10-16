import type { Db } from './types';

// Append-only. Never edit a migration that has shipped; add a new one instead.
const MIGRATIONS: string[] = [
  `CREATE TABLE items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     note TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL
   );
   CREATE TABLE settings (
     key TEXT PRIMARY KEY NOT NULL,
     value TEXT NOT NULL
   );`,
  `DROP TABLE items;
   CREATE TABLE sessions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     started_at INTEGER NOT NULL,
     pattern_name TEXT NOT NULL,
     phases TEXT NOT NULL,
     planned_seconds INTEGER,
     actual_seconds REAL NOT NULL,
     breaths INTEGER NOT NULL,
     completed INTEGER NOT NULL
   );`,
  // v3 foundations (docs/V3_PLAN.md "Data"). Later phases fill in sessions.note/tags/mood_*/health_synced,
  // pattern_prefs' haptics/sound/fade/guidance/favorite, and reminders; the tables exist from here on.
  `CREATE TABLE custom_patterns (
     id TEXT PRIMARY KEY NOT NULL,
     name TEXT NOT NULL,
     phases TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE pattern_prefs (
     pattern_id TEXT PRIMARY KEY NOT NULL,
     target TEXT,
     haptics TEXT,
     sound INTEGER,
     fade INTEGER,
     guidance TEXT,
     favorite INTEGER NOT NULL DEFAULT 0,
     last_used_at INTEGER
   );
   CREATE TABLE reminders (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     hour INTEGER NOT NULL,
     minute INTEGER NOT NULL,
     weekdays TEXT NOT NULL,
     pattern_id TEXT,
     enabled INTEGER NOT NULL DEFAULT 1
   );
   ALTER TABLE sessions ADD COLUMN pattern_id TEXT;
   ALTER TABLE sessions ADD COLUMN target TEXT;
   ALTER TABLE sessions ADD COLUMN note TEXT NOT NULL DEFAULT '';
   ALTER TABLE sessions ADD COLUMN tags TEXT NOT NULL DEFAULT '';
   ALTER TABLE sessions ADD COLUMN mood_before INTEGER;
   ALTER TABLE sessions ADD COLUMN mood_after INTEGER;
   ALTER TABLE sessions ADD COLUMN health_synced INTEGER NOT NULL DEFAULT 0;`,
  // 4 (v3.1): a session the app saved itself after it was closed mid-session (crash, force-quit, OS kill).
  // Only the time it really guided is stored, as a partial session; this flag says why (REVIEW_V3 #3, L26).
  `ALTER TABLE sessions ADD COLUMN interrupted INTEGER NOT NULL DEFAULT 0;`,
];

export const LATEST_VERSION = MIGRATIONS.length;

export async function migrate(db: Db): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    await db.execAsync(`BEGIN; ${MIGRATIONS[version]} PRAGMA user_version = ${version + 1}; COMMIT;`);
    version++;
  }
}
