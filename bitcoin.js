const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';

export async function getBitcoinPrice() {
  try {
    const res = await fetch(COINGECKO_URL);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.bitcoin?.usd ?? null;
  } catch (e) {
    console.error('[bitcoin] Fehler:', e?.message ?? String(e));
    return null;
  }
}
