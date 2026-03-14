import path from 'path';
import { getDb } from '../database/db';
import { Recording } from '../types/camera';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.avi', '.mkv', '.mov', '.ts', '.flv', '.wmv']);

export function isVideoFile(filename: string): boolean {
  return VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

export function listRecordings(
  cameraId: string,
  options: { date?: string; page?: number; limit?: number } = {}
): Recording[] {
  const db = getDb();
  const { date, page = 1, limit = 50 } = options;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM recordings WHERE camera_id = ?';
  const params: (string | number)[] = [cameraId];

  if (date) {
    query += ' AND DATE(recorded_at) = ?';
    params.push(date);
  }

  query += ' ORDER BY recorded_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(query).all(...params) as Recording[];
}

export function getRecordingByFilename(cameraId: string, filename: string): Recording | undefined {
  const db = getDb();
  return db
    .prepare('SELECT * FROM recordings WHERE camera_id = ? AND filename = ?')
    .get(cameraId, filename) as Recording | undefined;
}

export function getRecordingAtTime(cameraId: string, targetTimestamp: Date): Recording | undefined {
  const db = getDb();
  const target = targetTimestamp.toISOString();

  return db
    .prepare(
      `SELECT * FROM recordings
       WHERE camera_id = ?
         AND recorded_at <= ?
         AND DATETIME(recorded_at, '+' || CAST(CAST(duration AS INTEGER) AS TEXT) || ' seconds') >= ?
       ORDER BY recorded_at DESC
       LIMIT 1`
    )
    .get(cameraId, target, target) as Recording | undefined;
}

export function insertRecording(
  cameraId: string,
  filename: string,
  filepath: string,
  size: number | null,
  duration: number | null,
  recordedAt: Date | null
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO recordings (camera_id, filename, filepath, size, duration, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(cameraId, filename, filepath, size, duration, recordedAt?.toISOString() ?? null);
}

export function deleteRecording(cameraId: string, filename: string): void {
  const db = getDb();
  db.prepare('DELETE FROM recordings WHERE camera_id = ? AND filename = ?').run(cameraId, filename);
}
