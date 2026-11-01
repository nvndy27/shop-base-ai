// Acceptance through real Auth, BFF, PostgREST, Storage and concurrent DB requests.
// Creates isolated development data only, never deletes fixtures or changes existing shops.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { devHarness } from './dev-harness.mjs';
import { localSql } from './local-database.mjs';

const h = devHarness();
let stage = 'config', groups = 0;
const pass = name => { groups++; console.log(`PASS ${name}`); };
const address = { recipient_name: 'Dev recipient', phone: '+84900000000', address_line: 'Development fixture address', ward: 'Dev ward', district: 'Dev district', province: 'Dev province', is_default: true };
let productA, productB, shopA, shopB;

async function verify() {
  stage = 'signup/session';
  const buyerA = await h.actor('buyer-a'), buyerB = await h.actor('buyer-b');
  const sellerA = await h.actor('seller-a'), sellerB = await h.actor('seller-b'), moderator = await h.actor('moderator');
  assert.equal((await h.api(null, '/me')).status, 401);
  h.checked(await buyerA.client.auth.refreshSession(), 'Refresh');
  assert.equal(h.checked(await buyerA.client.auth.getUser(), 'Restored user').user.id, buyerA.id);
  h.checked(await buyerA.client.auth.signOut({ scope: 'local' }), 'Logout');
  assert.equal((await buyerA.client.auth.getSession()).data.session, null);
  const failed = await buyerA.client.auth.signInWithPassword({ email: buyerA.email, password: 'incorrect-fixture-password' });
  assert.ok(failed.error);
  h.checked(await buyerA.client.auth.signInWithPassword({ email: buyerA.email, password: buyerA.password }), 'Password login');
  assert.equal((await h.allowed(buyerA, '/me')).user_id, buyerA.id);
  assert.equal((await h.allowed(buyerA, '/me/purchase-eligibility')).eligible, true);
  const forged = await h.api(buyerA, '/me', { method: 'PATCH', body: { display_name: 'Buyer A', status: 'active', role: 'admin' } });
  assert.equal(forged.status, 422);
  h.checked(await buyerB.client.auth.updateUser({ data: { role: 'admin', permissions: ['shops:moderate'] } }), 'Editable metadata');
  assert.ok((await buyerB.client.from('user_roles').insert({ user_id: buyerB.id, permission: 'shops:moderate' })).error);
  try {
    h.checked(await h.admin.from('profiles').update({ status: 'banned' }).eq('user_id', buyerB.id), 'Ban own fixture');
    assert.equal((await h.api(buyerB, '/me/purchase-eligibility')).status, 403);
  } finally {
    h.checked(await h.admin.from('profiles').update({ status: 'active' }).eq('user_id', buyerB.id), 'Restore own fixture');
  }
  pass('Password signup/login, Auth getUser, refresh/logout, no SMS and no role injection');

  stage = 'addresses';
  const addrA = await h.allowed(buyerA, '/me/addresses', { method: 'POST', body: address });
  const addrB = await h.allowed(buyerB, '/me/addresses', { method: 'POST', body: address });
  assert.equal((await h.api(buyerB, '/me/addresses', { method: 'PATCH', body: { id: addrA.id, province: 'forged' } })).status, 404);
  assert.equal((await h.api(buyerB, '/me/addresses', { method: 'DELETE', body: { id: addrA.id } })).status, 404);
  assert.deepEqual((await h.allowed(buyerB, '/me/addresses')).items.map(item => item.id), [addrB.id]);
  pass('Owned shipping addresses and A/B read/write/delete denial');

  stage = 'shops/MFA';
  await h.moderator(moderator);
  async function shop(seller, name) {
    const pending = await h.allowed(seller, '/shop-applications', { method: 'POST', body: { name, slug: `dev-${h.runId}-${name.toLowerCase()}` } });
    h.created.shops.push(pending.id);
    assert.equal(pending.status, 'pending');
    assert.equal((await h.api(seller, `/admin/shops/${pending.id}/decision`, { method: 'POST', body: { decision: 'active', reason: 'Unauthorized self approval' } })).status, 403);
    const approved = await h.allowed(moderator, `/admin/shops/${pending.id}/decision`, { method: 'POST', body: { decision: 'active', reason: 'Dev acceptance review' } });
    assert.equal(approved.status, 'active');
    return pending.id;
  }
  shopA = await shop(sellerA, 'A'); shopB = await shop(sellerB, 'B');
  pass('Shop application/approval with a real MFA AAL2 moderator');

  stage = 'Storage';
  const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
  const sharp = createRequire(require.resolve('next/package.json'))('sharp');
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#cc785c' } }).png().toBuffer();
  assert.equal((await h.api(sellerB, `/seller/shops/${shopA}/images`, { method: 'POST', bytes, contentType: 'image/png' })).status, 404);
  const uploaded = await h.allowed(sellerA, `/seller/shops/${shopA}/images`, { method: 'POST', bytes, contentType: 'image/png' });
  const image = await fetch(uploaded.url, { signal: AbortSignal.timeout(10000) });
  assert.equal(image.status, 200);
  assert.ok(image.headers.get('content-type').includes('image/webp'));
  const direct = await sellerA.client.storage.from('course-product-images').upload(`${shopA}/${randomUUID()}.webp`, bytes, { contentType: 'image/webp' });
  assert.ok(direct.error, 'Browser direct upload must be blocked');
  pass('Storage server upload/re-encode/public read; direct and cross-shop uploads denied');

  stage = 'products';
  async function product(seller, shop, imageUrl, sku) {
    const body = { title: `Dev acceptance ${sku}`, description: 'Explicit development fixture', category: 'All_Beauty', image_urls: [imageUrl], sku, name: 'Default', price_vnd: 100000, stock: 5 };
    const created = await h.allowed(seller, `/seller/shops/${shop}/products`, { method: 'POST', body });
    h.created.products.push(created.id);
    const submitted = await h.allowed(seller, `/seller/shops/${shop}/products/${created.id}/submit`, { method: 'POST', body: { version: created.version } });
    return h.allowed(moderator, `/admin/products/${created.id}/decision`, { method: 'POST', body: { version: submitted.version, decision: 'published', reason: 'Dev acceptance reviewed' } });
  }
  productA = await product(sellerA, shopA, uploaded.url, 'ACCEPT-A');
  productB = await product(sellerB, shopB, 'https://m.media-amazon.com/images/I/test.jpg', 'ACCEPT-B');
  assert.equal((await h.api(sellerB, `/seller/shops/${shopA}/products/${productA.id}/archive`, { method: 'POST', body: { version: productA.version } })).status, 404);
  assert.equal((await h.allowed(null, `/marketplace/products/${productA.id}`)).id, productA.id);
  pass('Published products, SKU/stock and cross-shop seller denial');

  stage = 'COD multi-shop';
  const va = productA.variants[0].id, vb = productB.variants[0].id;
  const put = (buyer, variant, quantity = 1) => h.allowed(buyer, `/cart/items/${variant}`, { method: 'PUT', body: { quantity } });
  const quote = buyer => h.allowed(buyer, '/checkout/quote', { method: 'POST', body: {} });
  const orderBody = (q, addr) => ({ quote_id: q.id, address_id: addr, request_key: randomUUID(), payment_method: 'cod' });
  await put(buyerA, va); await put(buyerA, vb, 2);
  const q = await quote(buyerA), body = orderBody(q, addrA.id);
  assert.equal(q.total, 300000);
  assert.equal((await h.api(buyerA, '/orders', { method: 'POST', body: { ...body, total: 1 } })).status, 422);
  const order = await h.allowed(buyerA, '/orders', { method: 'POST', body });
  h.created.orders.push(order.id);
  assert.equal(order.total, 300000); assert.equal(order.shops.length, 2);
  assert.equal((await h.allowed(buyerA, '/orders', { method: 'POST', body })).id, order.id);
  assert.equal((await h.api(buyerB, `/orders/${order.id}`)).status, 404);
  const sellerOrder = (await h.allowed(sellerA, `/seller/shops/${shopA}/orders`)).items.find(item => item.id === order.id);
  assert.equal(sellerOrder.shops.length, 1); assert.equal(sellerOrder.total, 100000);
  await h.allowed(buyerA, `/orders/${order.id}/cancel`, { method: 'POST', body: { reason: 'Dev cancellation' } });
  await h.allowed(buyerA, `/orders/${order.id}/cancel`, { method: 'POST', body: { reason: 'Dev cancellation retry' } });
  assert.equal((await h.allowed(null, `/marketplace/products/${productA.id}`)).variants[0].available, 5);
  pass('Server total, multi-shop COD, idempotent create/cancel, stock restoration and order A/B denial');

  stage = 'concurrent last SKU';
  await h.allowed(sellerA, `/seller/shops/${shopA}/inventory-adjustments`, { method: 'POST', body: { variant_id: va, delta: -4, reason: 'Dev last-unit race', request_key: randomUUID() } });
  await put(buyerA, va); await put(buyerB, va);
  const qa = await quote(buyerA), qb = await quote(buyerB);
  assert.equal((await h.api(buyerB, '/orders', { method: 'POST', body: orderBody(qb, addrA.id) })).status, 404);
  assert.match(va, /^[0-9a-f-]{36}$/);
  const hook = `dev_race_${h.runId.replaceAll('-', '')}`;
  // A test-only trigger sleeps while this fixture inventory row is locked, so the second
  // real HTTP transaction overlaps the first, rather than just running two calls in order.
  await localSql(`begin; create function private.${hook}() returns trigger
    language plpgsql set search_path='' as $$ begin perform pg_sleep(1); return new; end $$;
    revoke all on function private.${hook}() from public,anon,authenticated,service_role;
    create trigger ${hook} before update on commerce.inventory
    for each row when(old.variant_id='${va}'::uuid) execute function private.${hook}(); commit;`);
  let race;
  try {
    race = await Promise.all([
      h.api(buyerA, '/orders', { method: 'POST', body: orderBody(qa, addrA.id) }),
      h.api(buyerB, '/orders', { method: 'POST', body: orderBody(qb, addrB.id) }),
    ]);
  } finally {
    await localSql(`begin; drop trigger ${hook} on commerce.inventory; drop function private.${hook}(); commit;`);
  }
  assert.equal(race.filter(result => result.status === 201).length, 1);
  assert.equal(race.filter(result => result.data?.error?.code === 'OUT_OF_STOCK').length, 1);
  const won = race.find(result => result.status === 201).data;
  h.created.orders.push(won.id);
  const winningBuyer = race[0].status === 201 ? buyerA : buyerB;
  const sub = won.shops[0];
  const confirmed = await h.allowed(sellerA, `/seller/shops/${shopA}/orders/${sub.id}/transitions`, { method: 'POST', body: { status: 'confirmed', version: sub.version, reason: 'Dev confirm' } });
  const shipped = await h.allowed(sellerA, `/seller/shops/${shopA}/orders/${sub.id}/transitions`, { method: 'POST', body: { status: 'shipped', version: confirmed.shops[0].version, reason: 'Dev ship' } });
  assert.equal((await h.api(winningBuyer, `/orders/${won.id}/cancel`, { method: 'POST', body: { reason: 'Too late' } })).data.error.code, 'INVALID_TRANSITION');
  await h.allowed(sellerA, `/seller/shops/${shopA}/orders/${sub.id}/transitions`, { method: 'POST', body: { status: 'delivered', version: shipped.shops[0].version, reason: 'Dev delivered' } });
  assert.equal((await h.allowed(null, `/marketplace/products/${productA.id}`)).variants[0].available, 0);
  pass('Two concurrent real PostgreSQL requests: one last-unit winner, correct transitions and no late cancellation');

  stage = 'Elastic worker';
  const worker = spawnSync(process.execPath, ['--env-file=apps/web/.env.local', 'scripts/marketplace-worker.mjs'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(worker.status, 0, 'Worker must index real outbox and expire reservations');
  const search = await h.allowed(null, '/marketplace/search?q=acceptance');
  assert.ok(search.items.some(item => item.id === productA.id));
  pass('Real marketplace outbox → Elasticsearch → BFF search');
  console.log(`${groups} nhóm nghiệm thu phần 1–3 đạt bằng dịch vụ local thật.`);
}

try { await verify(); }
catch (error) { console.error(`FAIL giai đoạn ${stage}: ${error.message}`); process.exitCode = 1; }
finally {
  for (const client of h.clients) { client.auth.stopAutoRefresh(); await client.removeAllChannels(); }
  console.log(`Fixture local giữ lại, không tự xóa: ${JSON.stringify({ run_id: h.runId, ...h.created })}`);
}
