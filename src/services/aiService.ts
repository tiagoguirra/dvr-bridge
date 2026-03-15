import os from "os";
import path from "path";
import fs from "fs";
import Replicate from "replicate";

export interface AiAnalysisResult {
  description: string;
  security_risk: boolean;
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// TODO: implement actual AI integration
export async function analyzeImage(
  imageBuffer: Buffer,
  cameraDescription: string,
  query?: string,
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
    Marque security_risk=true se identificar atividade suspeita com risco a segurança da residência.`;

    const output = (await replicate.run(
      process.env.REPLICATE_MODEL as `${string}/${string}`,
      {
        input: {
          image_input: [image],
          prompt: prompt,
          simple_schema: ["description", "security_risk"],
        },
      },
    )) as { json_output: { description: string; security_risk: string } };

    return {
      description: output.json_output.description,
      security_risk: output.json_output.security_risk == "true",
    };
  } catch (error) {
    console.error("Error analyzing image:", error);
    throw new Error("Failed to analyze image");
  } finally {
    fs.unlinkSync(tmpFile);
  }
}
