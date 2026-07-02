import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, 'kuehlschrank.json');

function load() {
  if (!existsSync(FILE)) return { items: [] };
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    return { items: [] };
  }
}

function save(data) {
  data.updatedAt = new Date().toISOString();
  writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function getFridgeContents() {
  return load().items;
}

export function addItems(newItems) {
  const data = load();
  for (const newItem of newItems) {
    const name = newItem.name?.trim();
    if (!name) continue;
    const existing = data.items.find(
      i => i.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      if (newItem.quantity && existing.unit === newItem.unit) {
        existing.quantity = (parseFloat(existing.quantity) || 0) + (parseFloat(newItem.quantity) || 1);
      } else {
        existing.quantity = newItem.quantity ?? existing.quantity;
        existing.unit = newItem.unit ?? existing.unit;
      }
    } else {
      data.items.push({ name, quantity: newItem.quantity ?? null, unit: newItem.unit ?? null });
    }
  }
  save(data);
}

export function removeItem(name) {
  const data = load();
  const lower = name.toLowerCase().trim();
  const before = data.items.length;
  data.items = data.items.filter(i => !i.name.toLowerCase().includes(lower));
  save(data);
  return data.items.length < before;
}

export function decrementItem(name, amount = 1) {
  const data = load();
  const item = data.items.find(i => i.name.toLowerCase() === name.toLowerCase().trim());
  if (!item) return { found: false };
  if (item.quantity === null || item.quantity - amount <= 0) {
    data.items = data.items.filter(i => i !== item);
    save(data);
    return { found: true, removed: true };
  }
  item.quantity = parseFloat((item.quantity - amount).toFixed(3));
  save(data);
  return { found: true, removed: false, newQuantity: item.quantity };
}

export function clearFridge() {
  save({ items: [] });
}
