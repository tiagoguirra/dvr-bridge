import { getDb } from '../database/db';

export interface CameraEvent {
  id: number;
  camera_id: string;
  event_type: string;
  occurred_at: string;
  description: string | null;
  security_risk: boolean;
  created_at: string;
}

export function saveEvent(params: {
  camera_id: string;
  event_type: string;
  occurred_at: string;
  description: string | null;
  security_risk: boolean | null;
}): CameraEvent {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO events (camera_id, event_type, occurred_at, description, security_risk)
    VALUES (@camera_id, @event_type, @occurred_at, @description, @security_risk)
  `);

  const result = stmt.run({
    ...params,
    security_risk: params.security_risk == null ? null : params.security_risk ? 1 : 0,
  });

  return db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid) as CameraEvent;
}

export function listEvents(
  cameraId: string,
  opts: { date?: string; page?: number; limit?: number } = {}
): { data: CameraEvent[]; total: number; page: number; limit: number } {
  const db = getDb();
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 10;
  const offset = (page - 1) * limit;

  let where = 'WHERE camera_id = ?';
  const args: unknown[] = [cameraId];

  if (opts.date) {
    where += ' AND DATE(occurred_at) = ?';
    args.push(opts.date);
  }

  const total = (db.prepare(`SELECT COUNT(*) as count FROM events ${where}`).get(...args) as { count: number }).count;
  const data = db.prepare(`SELECT * FROM events ${where} ORDER BY occurred_at DESC LIMIT ? OFFSET ?`).all(...args, limit, offset) as CameraEvent[];

  return { data, total, page, limit };
}
