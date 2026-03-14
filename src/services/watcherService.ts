import fs from 'fs';
import path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import ffmpeg from 'fluent-ffmpeg';
import { Camera } from '../types/camera';
import { insertRecording, deleteRecording, isVideoFile } from './recordingService';

const watchers: FSWatcher[] = [];

function parseRecordedAt(filename: string, fallback: Date): Date {
  const patterns = [
    /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/,
    /(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/,
    /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      const [, year, month, day, hour, min, sec] = match;
      const date = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
      if (!isNaN(date.getTime())) return date;
    }
  }

  return fallback;
}

function probeFile(filepath: string): Promise<{ duration: number | null }> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filepath, (err, metadata) => {
      if (err) {
        resolve({ duration: null });
        return;
      }
      resolve({ duration: metadata.format.duration ?? null });
    });
  });
}

export function watchCamera(camera: Camera): void {
  const { id, recordFolder } = camera;

  if (!fs.existsSync(recordFolder)) {
    console.warn(`[watcher] Folder not found for camera ${id}: ${recordFolder}`);
    return;
  }

  const watcher = chokidar.watch(recordFolder, {
    ignoreInitial: true,
    persistent: true,
    depth: 0,
  });

  watcher.on('add', async (filepath: string) => {
    const filename = path.basename(filepath);
    if (!isVideoFile(filename)) return;

    console.log(`[watcher] Camera ${id}: new file detected: ${filename}`);

    // Wait briefly for the file to finish writing
    await new Promise((r) => setTimeout(r, 2000));

    const stat = fs.statSync(filepath);
    const recordedAt = parseRecordedAt(filename, stat.mtime);
    const { duration } = await probeFile(filepath);

    insertRecording(id, filename, filepath, stat.size, duration, recordedAt);
    console.log(`[watcher] Camera ${id}: indexed ${filename} (duration: ${duration}s)`);
  });

  watcher.on('unlink', (filepath: string) => {
    const filename = path.basename(filepath);
    if (!isVideoFile(filename)) return;

    deleteRecording(id, filename);
    console.log(`[watcher] Camera ${id}: removed ${filename} from index`);
  });

  watcher.on('error', (err: unknown) => {
    console.error(`[watcher] Camera ${id} error:`, err);
  });

  watchers.push(watcher);
  console.log(`[watcher] Watching ${recordFolder} for camera ${id}`);
}

export function watchAllCameras(cameras: Camera[]): void {
  for (const camera of cameras) {
    watchCamera(camera);
  }
}

export async function closeAllWatchers(): Promise<void> {
  await Promise.all(watchers.map((w) => w.close()));
}
