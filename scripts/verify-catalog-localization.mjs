import assert from 'node:assert/strict';
const origin = process.env.CATALOG_VERIFY_ORIGIN || 'http://localhost:3000';
async function get(path) {
  const response = await fetch(new URL('/api/v1/' + path, origin), {signal:AbortSignal.timeout(15000)});
  assert.equal(response.status, 200);
  return response.json();
}
const english = await get('products?language=en&limit=24');
const vietnamese = await get('products?language=vi&limit=24');
assert.equal(english.total, vietnamese.total);
assert.deepEqual(english.items.map(p=>p.id), vietnamese.items.map(p=>p.id));
assert(english.items.length > 0);
let translated = 0;
for (let i = 0; i < english.items.length; i++) {
  const en = english.items[i], vi = vietnamese.items[i];
  assert.equal(en.display_title, en.title);
  assert.equal(en.display_currency, 'USD');
  assert.equal(en.display_price, en.price_usd);
  assert.equal(vi.price_usd, en.price_usd);
  assert.equal(vi.currency, 'USD');
  assert.equal(vi.display_currency, 'VND');
  assert.equal(vi.display_price, Math.round(en.price_usd * vi.exchange.rate));
  if (vi.display_title !== en.title) translated++;
}
assert(translated > 0, 'Expected actual stored Vietnamese translations');
const id = english.items[0].id;
const detail = await get('products/' + id + '?language=vi');
assert.equal(detail.display_title, vietnamese.items[0].display_title);
assert.equal(detail.display_price, vietnamese.items[0].display_price);
const status = await get('catalog/presentation');
assert.equal(status.translation, 'ready');
assert(status.exchange.rate > 0);
console.log(JSON.stringify({checked:english.items.length,translated,total:english.total,detail:id,exchange_updated_at:status.exchange.updated_at}));
