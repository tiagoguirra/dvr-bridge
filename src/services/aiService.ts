import os from "os";
import path from "path";
import fs from "fs";
import Replicate from "replicate";

export interface AiAnalysisResult {
  description: string;
  should_notify: boolean;
}

interface QueueItem {
  imageBuffer: Buffer;
  cameraDescription: string;
  query: string | undefined;
  resolve: (value: AiAnalysisResult) => void;
  reject: (reason: unknown) => void;
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const queue: QueueItem[] = [];
let isProcessing = false;
let rateLimitUntil = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callReplicate(
  imageBuffer: Buffer,
  cameraDescription: string,
  query: string | undefined,
): Promise<AiAnalysisResult> {
  const tmpFile = path.join(os.tmpdir(), `dvr-event-${Date.now()}.jpg`);
  fs.writeFileSync(tmpFile, imageBuffer);

  try {
    const image = new Blob([fs.readFileSync(tmpFile)], { type: "image/jpeg" });
    const prompt = query
      ? `Camera de segurança da residência. ${cameraDescription}
        Analise a imagem e forneça uma resposta concisa.
        Questão: ${query}`
      : `Analise a imagem da camera de segurança da residência. ${cameraDescription}
    Retorne uma descrição breve do que acontece na imagem.
    Marque should_notify=true se identificar atividade suspeita que merece ser avisado ao proprietário.`;

    const output = (await replicate.run(
      process.env.REPLICATE_MODEL as `${string}/${string}`,
      {
        input: {
          image_input: [image],
          prompt: prompt,
          simple_schema: ["description", "should_notify"],
        },
      },
    )) as { json_output: { description: string; should_notify: string } };

    return {
      description: output.json_output.description,
      should_notify: output.json_output.should_notify === "true",
    };
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

async function extractRetryAfterMs(error: unknown): Promise<number | null> {
  if (
    error instanceof Error &&
    "response" in error &&
    error.response instanceof Response &&
    (error.response as Response).status === 429
  ) {
    const response = error.response as Response;

    const headerValue = response.headers.get("retry-after");
    if (headerValue !== null) {
      const seconds = parseFloat(headerValue);
      if (!isNaN(seconds) && seconds > 0) {
        return Math.ceil(seconds) * 1000;
      }
    }

    try {
      const body = (await response.clone().json()) as Record<string, unknown>;
      if (typeof body["retry_after"] === "number" && body["retry_after"] > 0) {
        return Math.ceil(body["retry_after"] as number) * 1000;
      }
    } catch {
      // body not valid JSON
    }

    return 60_000;
  }

  return null;
}

async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  console.log(`[ai-queue] Processor started, items=${queue.length}`);

  while (queue.length > 0) {
    const now = Date.now();
    if (rateLimitUntil > now) {
      const waitMs = rateLimitUntil - now;
      console.log(`[ai-queue] Rate-limited, waiting ${Math.ceil(waitMs / 1000)}s`);
      await sleep(waitMs);
      rateLimitUntil = 0;
    }

    const item = queue[0];
    console.log(`[ai-queue] Processing item, queue=${queue.length}`);

    try {
      const result = await callReplicate(
        item.imageBuffer,
        item.cameraDescription,
        item.query,
      );
      queue.shift();
      console.log(`[ai-queue] Item done, remaining=${queue.length}`);
      item.resolve(result);
    } catch (error) {
      const retryMs = await extractRetryAfterMs(error);
      if (retryMs !== null) {
        rateLimitUntil = Date.now() + retryMs;
        console.warn(
          `[ai-queue] Rate limited (429), retrying in ${Math.ceil(retryMs / 1000)}s, queue=${queue.length}`,
        );
      } else {
        queue.shift();
        console.error(`[ai-queue] Item failed, remaining=${queue.length}`, error);
        item.reject(error);
      }
    }
  }

  isProcessing = false;
  console.log(`[ai-queue] Processor finished`);
}

export function analyzeImage(
  imageBuffer: Buffer,
  cameraDescription: string,
  query?: string,
): Promise<AiAnalysisResult> {
  return new Promise<AiAnalysisResult>((resolve, reject) => {
    queue.push({ imageBuffer, cameraDescription, query, resolve, reject });
    console.log(`[ai-queue] Enqueued, queue=${queue.length}`);
    processQueue();
  });
}
