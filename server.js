import express from 'express';
import crypto from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getFridgeContents, addItems, removeItem, removeItems, adjustItem, updateItem, undoLastChange } from './fridge.js';
import { addToBring } from './bring.js';
import { lookupProduct } from './barcode.js';
import { getPlanStatus } from './fitness.js';

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

app.get('/fitnessplan.html', (req, res) => {
  res.sendFile(join(__dirname, 'fitnessplan.html'));
});

app.get('/api/fitness/status', authMiddleware, (req, res) => {
  res.json(getPlanStatus());
});

app.get('/api/fridge', authMiddleware, async (req, res) => {
  res.json(await getFridgeContents());
});

app.delete('/api/fridge/:name', authMiddleware, async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const removed = await removeItem(name);
  res.json({ success: removed });
});

app.patch('/api/fridge/:name', authMiddleware, async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const { delta, quantity, category, expiryDate, fullQuantity } = req.body ?? {};

  if (delta !== undefined) {
    const d = parseFloat(delta);
    if (isNaN(d)) return res.status(400).json({ error: 'delta required' });
    return res.json(await adjustItem(name, d));
  }

  const result = await updateItem(name, { quantity, category, expiryDate, fullQuantity });
  res.json(result);
});

app.post('/api/fridge/undo', authMiddleware, async (req, res) => {
  const success = await undoLastChange();
  res.json({ success, items: await getFridgeContents() });
});

app.post('/api/fridge/add', authMiddleware, async (req, res) => {
  const { name, quantity, unit, category } = req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  await addItems([{ name: name.trim(), quantity: quantity ?? null, unit: unit?.trim() || null, category }]);
  res.json({ success: true, items: await getFridgeContents() });
});

app.post('/api/fridge/delete-batch', authMiddleware, async (req, res) => {
  const names = req.body?.names;
  if (!Array.isArray(names)) return res.status(400).json({ error: 'names required' });
  await removeItems(names);
  res.json({ success: true });
});

app.post('/api/fridge/barcode', authMiddleware, async (req, res) => {
  const code = req.body?.code;
  if (!code) return res.status(400).json({ error: 'code required' });
  try {
    const product = await lookupProduct(code);
    res.json({ found: !!product, product });
  } catch (err) {
    console.error('Barcode-Lookup Fehler:', err.message);
    res.status(500).json({ error: 'Lookup fehlgeschlagen' });
  }
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

export function startServer() {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`🌐 Mini App läuft auf Port ${port}`));
}
