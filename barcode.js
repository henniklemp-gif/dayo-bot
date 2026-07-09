const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product';

function parseQuantity(qStr) {
  if (!qStr) return { quantity: null, unit: null };
  const match = qStr.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|stk|st)\b/i);
  if (!match) return { quantity: null, unit: qStr };
  const quantity = parseFloat(match[1].replace(',', '.'));
  const rawUnit = match[2].toLowerCase();
  const unit = rawUnit === 'stk' || rawUnit === 'st' ? 'Stk' : rawUnit;
  return { quantity, unit };
}

export async function lookupProduct(code) {
  const res = await fetch(`${OFF_URL}/${encodeURIComponent(code)}.json?fields=product_name,product_name_de,quantity,brands`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const p = data.product;
  const name = p.product_name_de?.trim() || p.product_name?.trim();
  if (!name) return null;

  const { quantity, unit } = parseQuantity(p.quantity);
  return { name, quantity, unit };
}
