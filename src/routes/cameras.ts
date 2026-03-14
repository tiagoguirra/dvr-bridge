import { Router } from "express";
import {
  listCameras,
  getSnapshot,
  getStream,
  getRecordings,
  serveRecording,
  getFrame,
  receiveEvent,
  getAllEvents,
  getCameraEvents,
} from "../controllers/cameraController";

const router = Router();

router.get("/", listCameras);
router.get("/events", getAllEvents);
router.post("/events", receiveEvent);
router.get("/:id/snapshot", getSnapshot);
router.get("/:id/stream", getStream);
router.get("/:id/recordings", getRecordings);
router.get("/:id/recordings/:filename", serveRecording);
router.get("/:id/frames", getFrame);
router.get("/:id/events", getCameraEvents);

export default router;
