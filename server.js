import express from 'express';
import crypto from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getFridgeContents, addItems, removeItem, removeItems, adjustItem, undoLastChange } from './fridge.js';
import { addToBring } from './bring.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

function validateInitData(initDataString) {
  if (!initDataString) return false;
  const params = new URLSearchParams(initDataString);
  const hash = params.get('hash');
  if (!hash) return false;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(process.env.TELEGRAM_BOT_TOKEN)
    .digest();
  const expectedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (expectedHash.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(hash));
}

function authMiddleware(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();
  const initData = req.headers['authorization'];
  if (!validateInitData(initData)) return res.status(403).json({ error: 'Unauthorized' });
  next();
}

app.get('/api/fridge', authMiddleware, (req, res) => {
  res.json(getFridgeContents());
});

app.delete('/api/fridge/:name', authMiddleware, (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const removed = removeItem(name);
  res.json({ success: removed });
});

app.patch('/api/fridge/:name', authMiddleware, (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const delta = parseFloat(req.body.delta);
  if (isNaN(delta)) return res.status(400).json({ error: 'delta required' });
  const result = adjustItem(name, delta);
  res.json(result);
});

app.post('/api/fridge/undo', authMiddleware, (req, res) => {
  const success = undoLastChange();
  res.json({ success, items: getFridgeContents() });
});

app.post('/api/fridge/add', authMiddleware, (req, res) => {
  const { name, quantity, unit } = req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  addItems([{ name: name.trim(), quantity: quantity ?? null, unit: unit?.trim() || null }]);
  res.json({ success: true, items: getFridgeContents() });
});

app.post('/api/fridge/delete-batch', authMiddleware, (req, res) => {
  const names = req.body?.names;
  if (!Array.isArray(names)) return res.status(400).json({ error: 'names required' });
  removeItems(names);
  res.json({ success: true });
});

app.post('/api/fridge/bring', authMiddleware, async (req, res) => {
  try {
    await addToBring(req.body.name);
    res.json({ success: true });
  } catch (err) {
    console.error('Bring! Fehler:', err.message);
    res.status(500).json({ error: 'Bring! Fehler' });
  }
});

const seenUpdates = new Set();

export function registerBotWebhook(bot) {
  app.post('/webhook', (req, res) => {
    const body = req.body;
    const updateId = body?.update_id;

    if (updateId && seenUpdates.has(updateId)) {
      console.log(`[webhook] Duplikat ignoriert: update_id=${updateId}`);
      return res.sendStatus(200);
    }
    if (updateId) {
      seenUpdates.add(updateId);
      setTimeout(() => seenUpdates.delete(updateId), 5 * 60 * 1000);
    }

    const type = body?.message?.document ? 'document' :
                 body?.message?.photo    ? 'photo' :
                 body?.message?.text     ? 'text' :
                 body?.message?.voice    ? 'voice' : 'other';
    console.log(`[webhook] Update: ${type} (update_id=${updateId})`);
    bot.processUpdate(body);
    res.sendStatus(200);
  });
}

export function startServer() {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`🌐 Mini App läuft auf Port ${port}`));
}
