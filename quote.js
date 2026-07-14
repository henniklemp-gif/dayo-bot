import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';

// accept-encoding: identity umgeht einen node-fetch/Node-Kompatibilitätsbug
// bei gzip-komprimierten Antworten auf manchen Node-Versionen.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: { 'accept-encoding': 'identity' },
});
const redis = Redis.fromEnv();
const HISTORY_KEY = 'dayo:quote_history';
const HISTORY_SIZE = 30;

export async function getDailyQuote() {
  try {
    const history = (await redis.get(HISTORY_KEY)) || [];
    const avoidBlock = history.length
      ? `\n\nDiese Zitate wurden in den letzten Tagen schon verwendet, wähle bewusst etwas anderes:\n${history.join('\n')}`
      : '';

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: `Gib mir ein einziges kurzes, inspirierendes Zitat auf Englisch von einer bekannten, real existierenden Person. Wähle bewusst ein weniger naheliegendes Zitat abseits der immer gleichen Klassiker und variiere Person sowie Thema. Kein erfundenes Zitat, keine Erklärung, keine Anführungszeichen. Antworte NUR im Format: Zitat — Autor:in${avoidBlock}`,
      }],
    });
    const quote = response.content[0].text.trim();

    await redis.set(HISTORY_KEY, [quote, ...history].slice(0, HISTORY_SIZE));

    return quote;
  } catch (e) {
    console.error('[quote] Fehler:', e?.message ?? String(e));
    return null;
  }
}
