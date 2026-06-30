import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BringApi = require('bring-api').default;

let instance = null;

async function initBring() {
  if (instance) return instance;
  const api = new BringApi();
  await api.login(process.env.BRING_EMAIL, process.env.BRING_PASSWORD);
  instance = api;
  return instance;
}

export async function addToBring(itemName) {
  const api = await initBring();
  await api.addListItem(api.bringListUUID, itemName);
}
