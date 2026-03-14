import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { Camera } from '../types/camera';
import { insertRecording, isVideoFile } from './recordingService';

function parseRecordedAt(filename: string, fallback: Date): Date {
  // Try common DVR filename patterns:
  // 20240115_143000.mp4  or  2024-01-15_14-30-00.mp4  or  20240115143000.mp4
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

export async function scanCamera(camera: Camera): Promise<void> {
  const { id, recordFolder } = camera;

  if (!fs.existsSync(recordFolder)) {
    console.warn(`[scan] Folder not found for camera ${id}: ${recordFolder}`);
    return;
  }

  const files = fs.readdirSync(recordFolder).filter(isVideoFile);
  console.log(`[scan] Camera ${id}: found ${files.length} video file(s)`);

  for (const filename of files) {
    const filepath = path.join(recordFolder, filename);
    const stat = fs.statSync(filepath);
    const recordedAt = parseRecordedAt(filename, stat.mtime);
    const { duration } = await probeFile(filepath);

    insertRecording(id, filename, filepath, stat.size, duration, recordedAt);
  }

  console.log(`[scan] Camera ${id}: scan complete`);
}

export async function scanAllCameras(cameras: Camera[]): Promise<void> {
  for (const camera of cameras) {
    await scanCamera(camera);
  }
}
