import os from 'os';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { getRecordingAtTime } from './recordingService';

export async function extractFrame(
  cameraId: string,
  date: string,
  time: string
): Promise<Buffer> {
  // Validate format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}$/.test(time)) {
    throw new Error('Invalid format. Use date=YYYY-MM-DD and time=HH:MM:SS');
  }

  // Use local datetime string — matches how recorded_at is stored in SQLite
  const target = `${date} ${time}`;

  const recording = getRecordingAtTime(cameraId, target);
  if (!recording) {
    throw new Error(`No recording found for camera ${cameraId} at ${date} ${time}`);
  }

  // Calculate offset in seconds between recording start and target time
  // Parse both as local time (no timezone suffix) to avoid UTC shift
  const recordedAt = new Date(recording.recorded_at!.replace(' ', 'T'));
  const targetDate = new Date(`${date}T${time}`);
  const offsetSeconds = (targetDate.getTime() - recordedAt.getTime()) / 1000;

  if (offsetSeconds < 0) {
    throw new Error(`Target time is before the recording start`);
  }

  // If duration is known, warn if offset exceeds it but still attempt
  if (recording.duration !== null && offsetSeconds > recording.duration) {
    throw new Error(
      `Target time exceeds recording duration (${Math.round(recording.duration)}s). ` +
      `Requested offset: ${Math.round(offsetSeconds)}s`
    );
  }

  const tmpFile = path.join(os.tmpdir(), `dvr-frame-${Date.now()}.jpg`);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(recording.filepath)
      .seekInput(offsetSeconds)
      .outputOptions(['-frames:v 1', '-q:v 2'])
      .output(tmpFile)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  const buffer = fs.readFileSync(tmpFile);
  fs.unlinkSync(tmpFile);

  return buffer;
}
