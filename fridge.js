import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, 'kuehlschrank.json');

const CATEGORIES = ['kuehlschrank', 'tiefkuehlfach', 'speisekammer'];
const MEASURABLE_UNITS = ['g', 'kg', 'ml', 'l'];

function isMeasurableUnit(unit) {
  return !!unit && MEASURABLE_UNITS.includes(unit.toLowerCase());
}

function load() {
  if (!existsSync(FILE)) return { items: [] };
  try {
    const data = JSON.parse(readFileSync(FILE, 'utf8'));
    data.items = (data.items || []).map(i => ({
      ...i,
      category: CATEGORIES.includes(i.category) ? i.category : 'kuehlschrank',
      expiryDate: i.expiryDate ?? null,
      fullQuantity: i.fullQuantity ?? null,
    }));
    return data;
  } catch {
    return { items: [] };
  }
}

let snapshot = null;

function save(data) {
  if (existsSync(FILE)) {
    try { snapshot = readFileSync(FILE, 'utf8'); } catch { snapshot = null; }
  }
  data.updatedAt = new Date().toISOString();
  writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function undoLastChange() {
  if (!snapshot) return false;
  writeFileSync(FILE, snapshot);
  snapshot = null;
  return true;
}

export function getFridgeContents() {
  return load().items;
}

function earliestDate(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return a < b ? a : b;
}

export function addItems(newItems) {
  const data = load();
  for (const newItem of newItems) {
    const name = newItem.name?.trim();
    if (!name) continue;
    const category = CATEGORIES.includes(newItem.category) ? newItem.category : null;
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
      if (isMeasurableUnit(existing.unit) && existing.quantity != null) {
        existing.fullQuantity = existing.quantity;
      }
      existing.expiryDate = earliestDate(existing.expiryDate, newItem.expiryDate ?? null);
      if (category) existing.category = category;
    } else {
      const quantity = newItem.quantity ?? null;
      const unit = newItem.unit ?? null;
      data.items.push({
        name,
        quantity,
        unit,
        category: category ?? 'kuehlschrank',
        expiryDate: newItem.expiryDate ?? null,
        fullQuantity: isMeasurableUnit(unit) && quantity != null ? quantity : null,
      });
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

export function adjustItem(name, delta) {
  const data = load();
  const item = data.items.find(i => i.name.toLowerCase() === name.toLowerCase().trim());
  if (!item) return { found: false };
  const newQty = item.quantity === null
    ? (delta > 0 ? delta : 0)
    : parseFloat((parseFloat(item.quantity) + delta).toFixed(3));
  if (newQty <= 0) {
    data.items = data.items.filter(i => i !== item);
    save(data);
    return { found: true, removed: true };
  }
  item.quantity = newQty;
  save(data);
  return { found: true, removed: false, newQuantity: item.quantity };
}

export function updateItem(name, patch) {
  const data = load();
  const item = data.items.find(i => i.name.toLowerCase() === name.toLowerCase().trim());
  if (!item) return { found: false };

  if (patch.quantity != null) {
    const newQty = parseFloat(patch.quantity);
    if (newQty <= 0) {
      data.items = data.items.filter(i => i !== item);
      save(data);
      return { found: true, removed: true };
    }
    item.quantity = newQty;
  }
  if (patch.category !== undefined && CATEGORIES.includes(patch.category)) {
    item.category = patch.category;
  }
  if (patch.expiryDate !== undefined) {
    item.expiryDate = patch.expiryDate || null;
  }
  if (patch.fullQuantity !== undefined) {
    item.fullQuantity = patch.fullQuantity != null ? parseFloat(patch.fullQuantity) : null;
  }
  save(data);
  return { found: true, removed: false, item };
}

export function removeItems(names) {
  const data = load();
  const lowers = names.map(n => n.toLowerCase().trim());
  data.items = data.items.filter(i => !lowers.includes(i.name.toLowerCase()));
  save(data);
}

export function clearFridge() {
  save({ items: [] });
}
