import Anthropic from '@anthropic-ai/sdk';

// accept-encoding: identity umgeht einen node-fetch/Node-Kompatibilitätsbug
// bei gzip-komprimierten Antworten auf manchen Node-Versionen.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: { 'accept-encoding': 'identity' },
});

export async function getDailyQuote() {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: 'Gib mir ein einziges kurzes, inspirierendes Zitat auf Englisch von einer bekannten, real existierenden Person. Kein erfundenes Zitat, keine Erklärung, keine Anführungszeichen. Antworte NUR im Format: Zitat — Autor:in',
      }],
    });
    return response.content[0].text.trim();
  } catch (e) {
    console.error('[quote] Fehler:', e?.message ?? String(e));
    return null;
  }
}
