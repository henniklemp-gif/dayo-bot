import OpenAI from 'openai';
import { writeFileSync, unlinkSync, createReadStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function transcribeVoice(fileUrl) {
  const tmpPath = join(tmpdir(), `dayo_voice_${Date.now()}.ogg`);
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`Download fehlgeschlagen: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(tmpPath, buffer);
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(tmpPath),
      model: 'whisper-1',
      language: 'de',
    });
    return transcription.text;
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
}
