import { getDb } from '../database/db';
import { toLocalISO } from '../utils/date';

function formatEventDates(event: CameraEvent): CameraEvent {
  return {
    ...event,
    occurred_at: toLocalISO(event.occurred_at) ?? event.occurred_at,
    created_at: toLocalISO(event.created_at) ?? event.created_at,
  };
}

export interface CameraEvent {
  id: number;
  camera_id: string;
  event_type: string;
  occurred_at: string;
  filename: string | null;
  description: string | null;
  should_notify: boolean | null;
  created_at: string;
}

export function saveEvent(params: {
  camera_id: string;
  event_type: string;
  occurred_at: string;
  filename: string | null;
  description: string | null;
  should_notify: boolean | null;
}): CameraEvent {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO events (camera_id, event_type, occurred_at, filename, description, should_notify)
    VALUES (@camera_id, @event_type, @occurred_at, @filename, @description, @should_notify)
  `);

  const result = stmt.run({
    ...params,
    should_notify: params.should_notify == null ? null : params.should_notify ? 1 : 0,
  });

  return db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid) as CameraEvent;
}

export function listEvents(
  opts: { cameraId?: string; date?: string; page?: number; limit?: number } = {}
): { data: CameraEvent[]; total: number; page: number; limit: number } {
  const db = getDb();
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 10;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const args: unknown[] = [];

  if (opts.cameraId) {
    conditions.push('camera_id = ?');
    args.push(opts.cameraId);
  }

  if (opts.date) {
    conditions.push('DATE(occurred_at) = ?');
    args.push(opts.date);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) as count FROM events ${where}`).get(...args) as { count: number }).count;
  const data = (db.prepare(`SELECT * FROM events ${where} ORDER BY occurred_at DESC LIMIT ? OFFSET ?`).all(...args, limit, offset) as CameraEvent[]).map(formatEventDates);

  return { data, total, page, limit };
}
