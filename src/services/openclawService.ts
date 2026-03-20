import axios from 'axios';
import { Camera } from '../types/camera';

export async function callOpenClawHook(camera: Camera, description: string): Promise<void> {
    try {
        const payload = {
            "name": "camnotify",
            "message": `Alerta na câmera (${camera.id}) ${camera.name}: ${description}`,
            "deliver": true,
            "wakeMode": "now",
            "channel": process.env.OPENCLAW_HOOK_CHANNEL,
            "to": process.env.OPENCLAW_HOOK_TO,
            "sessionKey": "hook:cam"
        }
        await axios.post(process.env.OPENCLAW_HOOK as string, payload, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENCLAW_HOOK_TOKEN}`
            }
        });
    } catch (error) {
        console.error(`[OpenClaw] Failed to call hook: ${error}`);
    }
}