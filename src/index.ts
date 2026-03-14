import dotenv from 'dotenv';
dotenv.config();

import './config/ffmpeg';
import express from 'express';
import { getDb } from './database/db';
import { getCameras } from './config/cameras';
import { scanAllCameras } from './services/scanService';
import { watchAllCameras, closeAllWatchers } from './services/watcherService';
import cameraRoutes from './routes/cameras';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  const app = express();
  app.use(express.json());

  // Init SQLite
  getDb();
  console.log('[db] SQLite initialized');

  // Routes
  app.use('/cameras', cameraRoutes);

  app.get('/health', (_, res) => res.json({ status: 'ok' }));

  // Start server
  const server = app.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}`);
  });

  // Scan + watch after server is up
  const cameras = getCameras();
  console.log(`[config] Loaded ${cameras.length} camera(s)`);

  await scanAllCameras(cameras);
  watchAllCameras(cameras);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[server] Shutting down...');
    await closeAllWatchers();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
