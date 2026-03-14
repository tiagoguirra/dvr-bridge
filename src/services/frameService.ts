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
  const targetTimestamp = new Date(`${date}T${time}`);

  if (isNaN(targetTimestamp.getTime())) {
    throw new Error('Invalid date or time format. Use YYYY-MM-DD and HH:MM:SS');
  }

  const recording = getRecordingAtTime(cameraId, targetTimestamp);
  if (!recording) {
    throw new Error(`No recording found for camera ${cameraId} at ${date} ${time}`);
  }

  const recordedAt = new Date(recording.recorded_at!);
  const offsetSeconds = (targetTimestamp.getTime() - recordedAt.getTime()) / 1000;

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
