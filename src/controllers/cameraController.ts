import { Request, Response } from 'express';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import { getCameras, getCameraById } from '../config/cameras';
import { proxySnapshot, proxyStream } from '../services/proxyService';
import { listRecordings, getRecordingByFilename } from '../services/recordingService';
import { extractFrame } from '../services/frameService';
import { analyzeImage } from '../services/aiService';
import { saveEvent, listEvents } from '../services/eventService';

dotenv.config();

const DVR_BASE_URL = process.env.DVR_BASE_URL || 'http://192.168.68.129:8090';

export function listCameras(_req: Request, res: Response): void {
  const cameras = getCameras().map(({ id, name, description }) => ({ id, name, description }));
  res.json(cameras);
}

export async function getSnapshot(req: Request, res: Response): Promise<void> {
  const camera = getCameraById(req.params['id'] as string);
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }

  try {
    await proxySnapshot(camera.id, res);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch snapshot from DVR' });
  }
}

export async function getStream(req: Request, res: Response): Promise<void> {
  const camera = getCameraById(req.params['id'] as string);
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }

  try {
    await proxyStream(camera.id, req, res);
  } catch (err) {
    res.status(502).json({ error: 'Failed to connect to DVR stream' });
  }
}

export function getRecordings(req: Request, res: Response): void {
  const camera = getCameraById(req.params['id'] as string);
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }

  const { date, page, limit } = req.query;
  const result = listRecordings(camera.id, {
    date: typeof date === 'string' ? date : undefined,
    page: page ? parseInt(page as string, 10) : undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
  });

  res.json(result);
}

export function serveRecording(req: Request, res: Response): void {
  const camera = getCameraById(req.params['id'] as string);
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }

  const filename = req.params['filename'] as string;

  // Prevent path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  const recording = getRecordingByFilename(camera.id, filename);
  if (!recording) {
    res.status(404).json({ error: 'Recording not found' });
    return;
  }

  res.sendFile(path.resolve(recording.filepath));
}

export async function receiveEvent(req: Request, res: Response): Promise<void> {
  const { oid, event } = req.query;

  if (typeof oid !== 'string' || !oid) {
    res.status(400).json({ error: 'Query param "oid" is required' });
    return;
  }
  if (typeof event !== 'string' || !event) {
    res.status(400).json({ error: 'Query param "event" is required' });
    return;
  }

  const camera = getCameraById(oid);
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }

  const occurredAt = new Date().toISOString().replace('T', ' ').substring(0, 19);

  let imageBuffer: Buffer | null = null;
  try {
    const response = await axios.get(`${DVR_BASE_URL}/grab.jpg?oid=${oid}`, {
      responseType: 'arraybuffer',
      timeout: 10000,
    });
    imageBuffer = Buffer.from(response.data);
  } catch {
    // proceed without image if snapshot fails
  }

  let description: string | null = null;
  let security_risk: boolean | null = null;
  try {
    const aiResult = await analyzeImage(imageBuffer ?? Buffer.alloc(0), camera.description ?? '');
    description = aiResult.description;
    security_risk = aiResult.security_risk;
  } catch {
    // AI offline — event is saved with null analysis
  }

  const saved = saveEvent({
    camera_id: oid,
    event_type: event,
    occurred_at: occurredAt,
    description,
    security_risk,
  });

  res.status(201).json(saved);
}

export function getAllEvents(req: Request, res: Response): void {
  const { date, page, limit } = req.query;
  const result = listEvents({
    date: typeof date === 'string' ? date : undefined,
    page: page ? parseInt(page as string, 10) : undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
  });
  res.json(result);
}

export function getCameraEvents(req: Request, res: Response): void {
  const camera = getCameraById(req.params['id'] as string);
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }

  const { date, page, limit } = req.query;
  const result = listEvents({
    cameraId: camera.id,
    date: typeof date === 'string' ? date : undefined,
    page: page ? parseInt(page as string, 10) : undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
  });

  res.json(result);
}

export async function getFrame(req: Request, res: Response): Promise<void> {
  const camera = getCameraById(req.params['id'] as string);
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }

  const { date, time } = req.query;
  if (typeof date !== 'string' || typeof time !== 'string') {
    res.status(400).json({ error: 'Query params date (YYYY-MM-DD) and time (HH:MM:SS) are required' });
    return;
  }

  try {
    const frame = await extractFrame(camera.id, date, time);
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(frame);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to extract frame';
    res.status(404).json({ error: message });
  }
}
