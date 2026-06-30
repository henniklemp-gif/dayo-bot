import express from 'express';
import crypto from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getFridgeContents, removeItem } from './fridge.js';
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
