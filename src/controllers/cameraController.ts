import { Request, Response } from 'express';
import path from 'path';
import { getCameras, getCameraById } from '../config/cameras';
import { proxySnapshot, proxyStream } from '../services/proxyService';
import { listRecordings, getRecordingByFilename } from '../services/recordingService';
import { extractFrame } from '../services/frameService';

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
