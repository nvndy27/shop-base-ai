// Browser reproduction for the M5 chat switching races. Not part of `pnpm check`: it needs a
// running Vite dev server, a real browser, and Playwright, which is deliberately NOT a project
// dependency (adding it would change package.json/lockfile). Run it by hand:
//
//   1. pnpm --filter @shop/web dev                 # Next BFF on :3000
//   2. cd frontend && pnpm dev                     # Vite on :5175, proxies /api -> :3000
//   3. PLAYWRIGHT_MODULE_PATH=<dir with playwright>/ node tests/e2e/chat-race.mjs
//
// PLAYWRIGHT_MODULE_PATH must point at a node_modules directory containing `playwright`, e.g.
// the npx cache: /home/<you>/.npm/_npx/<hash>/node_modules/. Omit it to resolve from the repo.
// `channel: 'chrome'` is used because the system Chrome is present while the Playwright
// browser download may not match the cached package build.
//
// Every fixture is declared in this file: the fake Supabase session in localStorage, the
// intercepted auth/user and /api/v1 responses, and the per-scenario `plan` that controls
// per-conversation delays. No real Supabase project and no real data are involved.
import { createRequire } from 'node:module';
const require = createRequire(process.env.PLAYWRIGHT_MODULE_PATH ?? import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.CHAT_E2E_BASE ?? 'http://localhost:5175';
// Storage key of the Supabase client in frontend/src/auth; the session below is unsigned and
// only satisfies the SDK's local checks, since every network call is intercepted.
const STORAGE_KEY = `sb-${process.env.CHAT_E2E_PROJECT_REF ?? 'rbhqkpjvbnuhhfhwrhdo'}-auth-token`;
const USER_ID = '11111111-1111-4111-8111-111111111111';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const user = { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'buyer@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'fake-refresh', user };

const CONV = {
  a: { id: 'conv-a', shop_id: 'shop-a', shop_name: 'Shop A', shop_slug: 'shop-a', counterpart_name: 'Người bán A', context_product_id: null, context_order_id: null, last_message_at: '2026-10-05T10:00:00Z', created_at: '2026-10-05T09:00:00Z', unread_count: 0, last_message: null },
  b: { id: 'conv-b', shop_id: 'shop-b', shop_name: 'Shop B', shop_slug: 'shop-b', counterpart_name: 'Người bán B', context_product_id: null, context_order_id: null, last_message_at: '2026-10-05T11:00:00Z', created_at: '2026-10-05T09:00:00Z', unread_count: 0, last_message: null },
};
const msg = (id, body, seq = 1) => ({ id, sequence: seq, kind: 'text', body, mine: false, client_message_id: `cmid-${id}`, created_at: '2026-10-05T10:00:00Z' });

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mutable fixture plan, switched per scenario before each navigation.
let plan = {};
const sent = [];
const results = [];
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail });

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => results.push({ name: 'PAGE ERROR', pass: false, detail: String(e) }));
// A duplicated bubble also makes React log "Encountered two children with the same key"; the
// console is the only place that shows up, so it counts as a failure on its own.
page.on('console', (m) => {
  if (m.type() === 'error' && /same key|duplicate/i.test(m.text())) results.push({ name: 'REACT KEY WARNING', pass: false, detail: m.text() });
});

await page.addInitScript(([key, value]) => { window.localStorage.setItem(key, value); }, [STORAGE_KEY, JSON.stringify(session)]);
await page.route('**/auth/v1/**', (route) => json(route, user));
await page.route('**/api/v1/**', async (route) => {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const method = route.request().method();
  try {
    if (path === '/api/v1/me/shops') return await json(route, { items: [] });
    if (path === '/api/v1/chat/conversations' && method === 'GET') return await json(route, { items: [CONV.a, CONV.b] });
    if (path === '/api/v1/chat/conversations' && method === 'POST') return await json(route, { conversation: CONV.a });
    const thread = path.match(/^\/api\/v1\/chat\/conversations\/([^/]+)$/);
    if (thread && method === 'GET') {
      const which = thread[1] === 'conv-a' ? 'a' : 'b';
      const cfg = plan.thread?.[which] ?? {};
      await sleep(cfg.delay ?? 0);
      return await json(route, { items: cfg.items ?? [], has_more: Boolean(cfg.hasMore) });
    }
    const send = path.match(/^\/api\/v1\/chat\/conversations\/([^/]+)\/messages$/);
    if (send && method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      sent.push({ conversation: send[1], body: body.body, client_message_id: body.client_message_id });
      const cfg = plan.send ?? {};
      await sleep(cfg.delay ?? 0);
      if (cfg.fail && cfg.fail()) return await json(route, { error: { code: 'SERVICE_UNAVAILABLE', message: 'down' } }, 503);
      return await json(route, { message: { id: `srv-${sent.length}`, sequence: 99, kind: 'text', body: body.body, mine: true, client_message_id: body.client_message_id, created_at: '2026-10-05T12:00:00Z' } });
    }
    if (/\/read$/.test(path)) return await json(route, { ok: true });
    return await json(route, { error: { code: 'NOT_FOUND', message: 'no fixture' } }, 404);
  } catch (error) {
    if (!/aborted|Target closed/i.test(String(error))) results.push({ name: 'ROUTE ERROR', pass: false, detail: `${path}: ${error}` });
  }
});

async function open(plan_) {
  plan = plan_;
  sent.length = 0;
  await page.goto(`${BASE}/chat`, { waitUntil: 'load' });
  await page.waitForSelector('.chat-item', { timeout: 8000 });
}
const pane = () => page.locator('.chat-messages').innerText();
const header = () => page.locator('.chat-header h3').innerText();
const item = (name) => page.locator('.chat-item', { hasText: name });

// --- 1. slow A then fast B: A's late response must not overwrite B ---
await open({ thread: { a: { delay: 700, items: [msg('a1', 'TIN CUA A')] }, b: { delay: 50, items: [msg('b1', 'TIN CUA B')] } } });
await item('Người bán A').click();
await page.waitForTimeout(60);
await item('Người bán B').click();
await page.waitForTimeout(1400);
check('1. late A response does not overwrite B', (await header()) === 'Người bán B' && (await pane()).includes('TIN CUA B') && !(await pane()).includes('TIN CUA A'), { header: await header(), pane: await pane() });

// --- 2. send in A then switch to B before the send resolves ---
await open({ thread: { a: { delay: 0, items: [] }, b: { delay: 0, items: [msg('b1', 'TIN CUA B')] } }, send: { delay: 700 } });
await item('Người bán A').click();
await page.waitForTimeout(200);
await page.fill('input[placeholder="Nhập tin nhắn..."]', 'GUI TU A');
await page.click('button:has-text("Gửi")');
await page.waitForTimeout(60);
await item('Người bán B').click();
await page.waitForTimeout(1400);
const pane2 = await pane();
check('2. send result does not leak into B', (await header()) === 'Người bán B' && !pane2.includes('GUI TU A'), { header: await header(), pane: pane2, sent });

// --- 3. page older in A, then switch to B ---
await open({ thread: { a: { delay: 0, items: [msg('a2', 'A MOI', 5)], hasMore: true }, b: { delay: 0, items: [msg('b1', 'TIN CUA B')] } } });
await item('Người bán A').click();
await page.waitForTimeout(200);
plan.thread.a = { delay: 700, items: [msg('a1', 'A CU', 1)], hasMore: false };
await page.click('button:has-text("Tải tin nhắn cũ hơn")');
await page.waitForTimeout(60);
await item('Người bán B').click();
await page.waitForTimeout(1400);
const pane3 = await pane();
check('3. paged result does not land in B', (await header()) === 'Người bán B' && !pane3.includes('A CU') && pane3.includes('TIN CUA B'), { header: await header(), pane: pane3 });

// --- 4. close the thread while its load is still running ---
await open({ thread: { a: { delay: 700, items: [msg('a1', 'TIN CUA A')] }, b: { delay: 0, items: [] } } });
await item('Người bán A').click();
await page.waitForTimeout(60);
await page.click('button:has-text("Quay lại")');
await page.waitForTimeout(1400);
const closed = await page.locator('.chat-empty').isVisible();
check('4. closing mid-load leaves the empty state, no crash', closed, { empty: closed, alerts: await page.locator('[role="alert"]').count() });

// --- 5. retry after a lost response reuses the same client_message_id ---
let failFirst = true;
await open({ thread: { a: { delay: 0, items: [] }, b: { delay: 0, items: [] } }, send: { delay: 0, fail: () => { if (!failFirst) return false; failFirst = false; return true; } } });
await item('Người bán A').click();
await page.waitForTimeout(200);
await page.fill('input[placeholder="Nhập tin nhắn..."]', 'GUI LAI');
await page.click('button:has-text("Gửi")');
await page.waitForSelector('[role="alert"]', { timeout: 4000 });
await page.click('button:has-text("Gửi")');
await page.waitForTimeout(600);
const ids = sent.map((s) => s.client_message_id);
const dupes = await page.locator('.chat-message', { hasText: 'GUI LAI' }).count();
check('5. retry keeps one key and one message', sent.length === 2 && ids[0] === ids[1] && dupes === 1, { sent, dupes });

// --- 6. a draft typed in B survives a send that finishes in A ---
await open({ thread: { a: { delay: 0, items: [] }, b: { delay: 0, items: [] } }, send: { delay: 600 } });
await item('Người bán A').click();
await page.waitForTimeout(200);
await page.fill('input[placeholder="Nhập tin nhắn..."]', 'GUI TU A');
await page.click('button:has-text("Gửi")');
await item('Người bán B').click();
await page.waitForTimeout(200);
// A send is still in flight here: B's composer must not be disabled by it, otherwise the
// fill below would silently block until the send finishes and hide the draft-wipe bug.
const lockedInB = await page.locator('input[placeholder="Nhập tin nhắn..."]').isDisabled();
await page.fill('input[placeholder="Nhập tin nhắn..."]', 'NHAP DO B');
await page.waitForTimeout(900);
const draftB = await page.inputValue('input[placeholder="Nhập tin nhắn..."]');
check('6. B draft survives a send completing in A', draftB === 'NHAP DO B' && !lockedInB, { draftB, lockedInB });

// --- 7. send in A, leave to B, come back to A before the send resolves ---
// The message is already persisted, so returning to A reloads a thread that contains it; the
// send response then carries the same row. Merging by id must keep a single bubble.
await open({ thread: { a: { delay: 0, items: [] }, b: { delay: 0, items: [] } }, send: { delay: 700 } });
await item('Người bán A').click();
await page.waitForTimeout(200);
await page.fill('input[placeholder="Nhập tin nhắn..."]', 'GUI TU A');
await page.click('button:has-text("Gửi")');
await item('Người bán B').click();
await page.waitForTimeout(100);
plan.thread.a = { delay: 0, items: [msg('srv-1', 'GUI TU A', 1)] };
await item('Người bán A').click();
await page.waitForTimeout(1200);
const bubbles = await page.locator('.chat-message', { hasText: 'GUI TU A' }).count();
check('7. A -> B -> A while sending shows the message once', bubbles === 1, { bubbles, pane: await pane() });

await browser.close();
let failed = 0;
for (const r of results) { if (!r.pass) failed++; console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '\n      ' + JSON.stringify(r.detail)}`); }
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
