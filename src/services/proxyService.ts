import axios from 'axios';
import { Request, Response } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const DVR_BASE_URL = process.env.DVR_BASE_URL || 'http://192.168.68.129:8090';

export async function proxySnapshot(cameraId: string, res: Response): Promise<void> {
  const url = `${DVR_BASE_URL}/grab.jpg?oid=${cameraId}`;

  const response = await axios.get(url, { responseType: 'stream', timeout: 10000 });

  res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
  response.data.pipe(res);
}

export async function proxyStream(cameraId: string, req: Request, res: Response): Promise<void> {
  const url = `${DVR_BASE_URL}/video.mjpg?oid=${cameraId}`;

  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 0,
    headers: { Connection: 'keep-alive' },
  });

  res.setHeader('Content-Type', response.headers['content-type'] || 'multipart/x-mixed-replace');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  response.data.pipe(res);

  req.on('close', () => {
    response.data.destroy();
  });
}
