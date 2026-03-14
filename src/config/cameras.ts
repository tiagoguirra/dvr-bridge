import path from 'path';
import { Camera } from '../types/camera';

const RECORDINGS_BASE_PATH = process.env.RECORDINGS_BASE_PATH || 'C:/recordings';

const camerasPath = path.resolve(process.cwd(), 'cameras.json');
const rawCameras: Camera[] = require(camerasPath);

const cameras: Camera[] = rawCameras.map((c) => ({
  ...c,
  recordFolder: path.isAbsolute(c.recordFolder)
    ? c.recordFolder
    : path.join(RECORDINGS_BASE_PATH, c.recordFolder),
}));

export function getCameras(): Camera[] {
  return cameras;
}

export function getCameraById(id: string): Camera | undefined {
  return cameras.find((c) => c.id === id);
}
