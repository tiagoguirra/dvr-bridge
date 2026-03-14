import { Router } from 'express';
import {
  listCameras,
  getSnapshot,
  getStream,
  getRecordings,
  serveRecording,
  getFrame,
} from '../controllers/cameraController';

const router = Router();

router.get('/', listCameras);
router.get('/:id/snapshot', getSnapshot);
router.get('/:id/stream', getStream);
router.get('/:id/recordings', getRecordings);
router.get('/:id/recordings/:filename', serveRecording);
router.get('/:id/frames', getFrame);

export default router;
