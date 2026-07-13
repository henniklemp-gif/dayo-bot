import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const KEY = 'kuehlschrank';
const SNAPSHOT_KEY = 'kuehlschrank:snapshot';

const CATEGORIES = ['kuehlschrank', 'tiefkuehlfach', 'speisekammer'];
const MEASURABLE_UNITS = ['g', 'kg', 'ml', 'l'];

function isMeasurableUnit(unit) {
  return !!unit && MEASURABLE_UNITS.includes(unit.toLowerCase());
}

async function load() {
  const data = (await redis.get(KEY)) || { items: [] };
  data.items = (data.items || []).map(i => ({
    ...i,
    category: CATEGORIES.includes(i.category) ? i.category : 'kuehlschrank',
    expiryDate: i.expiryDate ?? null,
    fullQuantity: i.fullQuantity ?? null,
  }));
  return data;
}

async function save(data) {
  const previous = await redis.get(KEY);
  if (previous) await redis.set(SNAPSHOT_KEY, previous);
  data.updatedAt = new Date().toISOString();
  await redis.set(KEY, data);
}

export async function undoLastChange() {
  const snapshot = await redis.get(SNAPSHOT_KEY);
  if (!snapshot) return false;
  await redis.set(KEY, snapshot);
  await redis.del(SNAPSHOT_KEY);
  return true;
}

export async function getFridgeContents() {
  return (await load()).items;
}

function earliestDate(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return a < b ? a : b;
}

export async function addItems(newItems) {
  const data = await load();
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
  await save(data);
}

export async function removeItem(name) {
  const data = await load();
  const lower = name.toLowerCase().trim();
  const before = data.items.length;
  data.items = data.items.filter(i => !i.name.toLowerCase().includes(lower));
  await save(data);
  return data.items.length < before;
}

export async function adjustItem(name, delta) {
  const data = await load();
  const item = data.items.find(i => i.name.toLowerCase() === name.toLowerCase().trim());
  if (!item) return { found: false };
  const newQty = item.quantity === null
    ? (delta > 0 ? delta : 0)
    : parseFloat((parseFloat(item.quantity) + delta).toFixed(3));
  if (newQty <= 0) {
    data.items = data.items.filter(i => i !== item);
    await save(data);
    return { found: true, removed: true };
  }
  item.quantity = newQty;
  await save(data);
  return { found: true, removed: false, newQuantity: item.quantity };
}

export async function updateItem(name, patch) {
  const data = await load();
  const item = data.items.find(i => i.name.toLowerCase() === name.toLowerCase().trim());
  if (!item) return { found: false };

  if (patch.quantity != null) {
    const newQty = parseFloat(patch.quantity);
    if (newQty <= 0) {
      data.items = data.items.filter(i => i !== item);
      await save(data);
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
  await save(data);
  return { found: true, removed: false, item };
}

export async function removeItems(names) {
  const data = await load();
  const lowers = names.map(n => n.toLowerCase().trim());
  data.items = data.items.filter(i => !lowers.includes(i.name.toLowerCase()));
  await save(data);
}

export async function clearFridge() {
  await save({ items: [] });
}
