// Two real browser sessions, real password login, BFF and private Supabase WebSockets.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { devHarness } from '../../scripts/dev-harness.mjs';

const h = devHarness();
assert.equal(h.config.url, 'http://127.0.0.1:54321');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_PATH ?? import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
const errors = [];
let stage = 'fixture setup';

class ChatPage {
  constructor(page) { this.page = page; page.on('pageerror', () => errors.push('Browser runtime error')); }
  async login(actor) {
    await this.page.goto('http://localhost:5175/auth');
    await this.page.getByRole('heading', { name: 'Chào mừng trở lại' }).waitFor();
    await this.page.getByLabel('Email (tài khoản)').fill(actor.email);
    await this.page.getByLabel('Mật khẩu', { exact: true }).fill(actor.password);
    await this.page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await this.page.waitForURL('**/profile', { timeout: 20000 });
  }
  async open(shop) {
    await this.page.goto(`http://localhost:5175/chat${shop ? `?shop=${shop}` : ''}`);
    await this.page.getByRole('status').filter({ hasText: 'Đang cập nhật trực tiếp' }).waitFor({ timeout: 20000 });
  }
  async send(text) {
    await this.page.getByPlaceholder('Nhập tin nhắn...').fill(text);
    await this.page.getByRole('button', { name: 'Gửi', exact: true }).click();
  }
  async message(text) {
    await this.page.locator('.chat-messages').getByText(text, { exact: true }).waitFor({ timeout: 20000 });
  }
}

try {
  const buyer = await h.actor('browser-buyer'), seller = await h.actor('browser-seller');
  h.checked(await buyer.client.auth.updateUser({ data: { display_name: 'Untrusted name' } }), 'Fixture metadata');
  await h.allowed(buyer, '/me', { method: 'PATCH', body: { display_name: 'Browser buyer' } });
  const shop = h.checked(await h.admin.from('shops').insert({ owner_user_id: seller.id, name: 'Browser realtime shop', slug: `browser-rt-${h.runId}`, status: 'active' }).select('id').single(), 'Fixture shop').id;
  h.created.shops.push(shop);
  h.checked(await h.admin.from('shop_members').insert({ shop_id: shop, user_id: seller.id, role: 'owner' }), 'Fixture seller');
  const buyerPage = new ChatPage(await browser.newPage()), sellerPage = new ChatPage(await browser.newPage());
  stage = 'real browser login';
  await buyerPage.login(buyer); await sellerPage.login(seller);
  stage = 'realtime connection';
  await sellerPage.open(); await buyerPage.open(shop);
  await buyerPage.page.getByPlaceholder('Nhập tin nhắn...').waitFor();
  stage = 'live buyer → seller';
  await buyerPage.send('Browser buyer message');
  const conversation = sellerPage.page.getByRole('button').filter({ hasText: 'Browser buyer' });
  await conversation.waitFor({ timeout: 20000 });
  await conversation.click();
  await sellerPage.message('Browser buyer message');
  stage = 'live seller → buyer';
  await sellerPage.send('Browser seller reply');
  await buyerPage.message('Browser seller reply');
  stage = 'persistent history';
  await buyerPage.page.reload();
  await buyerPage.message('Browser seller reply');
  assert.deepEqual(errors, []);
  console.log('PASS real browser chat: two password sessions, private connection, new conversation notification, bidirectional updates without manual reload, persistent history.');
} catch {
  console.error(`FAIL browser realtime at ${stage}; no credential or chat payload logged.`);
  process.exitCode = 1;
} finally {
  await browser.close();
  for (const client of h.clients) { client.auth.stopAutoRefresh(); await client.removeAllChannels(); }
  console.log(`Fixture local giữ lại: ${JSON.stringify({ run_id: h.runId, ...h.created })}`);
}
