import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function analyzeReceipt(buffer, mimeType) {
  const base64 = buffer.toString('base64');
  const isPDF = mimeType?.includes('pdf');

  const mediaBlock = isPDF
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: normalizeImageType(mimeType), data: base64 } };

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        mediaBlock,
        {
          type: 'text',
          text: `Das ist ein Kassenbon. Erkenne alle Lebensmittelprodukte mit Menge und Einheit (wenn erkennbar). Ignoriere Nicht-Lebensmittel (Hygieneartikel, Pfand, etc.).

Bestimme außerdem pro Produkt die Lagerkategorie (category), eine von:
- "kuehlschrank": gekühlte/frische Produkte (Milchprodukte, Fleisch, Fisch, frisches Obst/Gemüse, Aufschnitt, Eier)
- "tiefkuehlfach": tiefgekühlte Produkte (Eis, TK-Gemüse, TK-Pizza, Fischstäbchen, Pommes)
- "speisekammer": haltbare/trockene Produkte (Konserven, Nudeln, Reis, Mehl, Zucker, Öl, Gewürze, Getränke, Süßigkeiten, Brot)

Antworte NUR mit einem JSON-Array ohne weitere Erklärung: [{"name": "Produktname", "quantity": 1, "unit": "Stück", "category": "kuehlschrank"}]. Wenn Menge oder Einheit nicht erkennbar, setze null.`,
        },
      ],
    }],
  });

  const text = response.content[0].text.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    console.error('[vision] Keine JSON-Array-Antwort erhalten:', text);
    return [];
  }
  try {
    return JSON.parse(match[0]);
  } catch (e) {
    console.error('[vision] JSON-Parse fehlgeschlagen:', e.message, '| Rohtext:', text);
    return [];
  }
}

function normalizeImageType(mimeType) {
  if (mimeType?.includes('png'))  return 'image/png';
  if (mimeType?.includes('gif'))  return 'image/gif';
  if (mimeType?.includes('webp')) return 'image/webp';
  return 'image/jpeg';
}
