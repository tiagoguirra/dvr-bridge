import Database from 'better-sqlite3';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || 'dvr.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    migrate(db);
  }
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recordings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id   TEXT NOT NULL,
      filename    TEXT NOT NULL,
      filepath    TEXT NOT NULL,
      size        INTEGER,
      duration    REAL,
      recorded_at DATETIME,
      created_at  DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(camera_id, filename)
    );

    CREATE INDEX IF NOT EXISTS idx_recordings_camera_id ON recordings(camera_id);
    CREATE INDEX IF NOT EXISTS idx_recordings_recorded_at ON recordings(recorded_at);

    CREATE TABLE IF NOT EXISTS events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id     TEXT NOT NULL,
      event_type    TEXT NOT NULL,
      occurred_at   DATETIME NOT NULL,
      filename      TEXT,
      description   TEXT,
      should_notify INTEGER,
      created_at    DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_events_camera_id ON events(camera_id);
    CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at);
  `);

}
