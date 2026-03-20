import { Request, Response } from 'express';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import { getCameras, getCameraById } from '../config/cameras';
import { proxySnapshot, proxyStream } from '../services/proxyService';
import { listRecordings, getRecordingByFilename } from '../services/recordingService';
import { extractFrame } from '../services/frameService';
import { analyzeImage, callReplicate as analyzeImageDirect } from '../services/aiService';
import { saveEvent, listEvents } from '../services/eventService';
import { callOpenClawHook } from '../services/openclawService'

dotenv.config();
const DVR_BASE_URL = process.env.DVR_BASE_URL || 'http://localhost:8090';


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
  const { oid, event, base64, filename } = req.body;

  if (typeof oid !== 'string' || !oid) {
    res.status(400).json({ error: 'Body param "oid" is required' });
    return;
  }
  if (typeof event !== 'string' || !event) {
    res.status(400).json({ error: 'Body param "event" is required' });
    return;
  }

  const camera = getCameraById(oid);
  if (!camera) {
    console.warn(`[event] Camera not found: oid=${oid}`);
    res.status(404).json({ error: 'Camera not found' });
    return;
  }

  const occurredAt = new Date().toISOString();
  console.log(`[event] Received event="${event}" oid=${oid} camera="${camera.name}" at=${occurredAt} hasImage=${typeof base64 === 'string' && base64.length > 0}`);

  res.status(202).json({ message: 'Event received' });

  const imageBuffer = typeof base64 === 'string' && base64
    ? Buffer.from(base64, 'base64')
    : Buffer.alloc(0);

  (async () => {
    let description: string | null = null;
    let should_notify: boolean | null = null;
    if (camera.aiAnalysis !== false) {
      try {
        console.log(`[event] Sending image to AI oid=${oid}`);
        const aiResult = await analyzeImage(imageBuffer, camera.description ?? '');
        description = aiResult.description;
        should_notify = aiResult.should_notify;
        console.log(`[event] AI result oid=${oid} should_notify=${should_notify}`);
      } catch (err) {
        console.warn(`[event] AI unavailable, saving event without analysis — ${err instanceof Error ? err.message : err}`);
      }

      if (should_notify) {
        try {
          await callOpenClawHook(camera, description as string);
        } catch (error) {
          console.error(`[event] Failed to call OpenClaw hook: ${error}`);
        }
      }
    } else {
      console.log(`[event] AI analysis disabled for oid=${oid}, skipping`);
    }

    const saved = saveEvent({
      camera_id: oid,
      event_type: event,
      occurred_at: occurredAt,
      filename: typeof filename === 'string' && filename ? filename : null,
      description,
      should_notify,
    });

    console.log(`[event] Saved id=${saved.id} oid=${oid} event="${event}"`);
  })().catch((err) => console.error(`[event] Unexpected error oid=${oid} — ${err instanceof Error ? err.message : err}`));
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

export async function analyzeCamera(req: Request, res: Response): Promise<void> {
  const camera = getCameraById(req.params['id'] as string);
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }

  const query = typeof req.query['query'] === 'string' ? req.query['query'] : undefined;

  let imageBuffer: Buffer;
  try {
    const response = await axios.get(`${DVR_BASE_URL}/grab.jpg?oid=${camera.id}`, {
      responseType: 'arraybuffer',
      timeout: 10000,
    });
    imageBuffer = Buffer.from(response.data);
  } catch {
    res.status(502).json({ error: 'Failed to fetch snapshot from DVR' });
    return;
  }

  try {
    const result = await analyzeImageDirect(imageBuffer, camera.description ?? '', query);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to analyze image';
    res.status(503).json({ error: message });
  }
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
