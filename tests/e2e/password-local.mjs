// Real browser + real Supabase local. No mocked Auth/API or credentials on disk.
// PLAYWRIGHT_MODULE_PATH follows the existing chat-race harness convention.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { chatDevConfig } from '../../scripts/chat-dev-config.mjs';

const config = chatDevConfig(process.env);
assert.equal(config.url, 'http://127.0.0.1:54321', 'This signup E2E runs on local only');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_PATH ?? import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', () => errors.push('Unexpected browser runtime error'));

class PasswordPage {
  constructor(page) { this.page = page; }
  async open() {
    await this.page.goto('http://localhost:5175/auth');
    await this.page.getByRole('heading', { name: 'Chào mừng trở lại' }).waitFor();
  }
  async signup(email, password, confirmation = password) {
    await this.page.getByRole('button', { name: 'Đăng ký Tự tạo tài khoản' }).click();
    await this.page.getByLabel('Email (tài khoản)').fill(email);
    await this.page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await this.page.getByLabel('Nhập lại mật khẩu').fill(confirmation);
    await this.page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  }
  async login(email, password) {
    await this.page.getByRole('button', { name: 'Đăng nhập Đã có tài khoản' }).click();
    await this.page.getByLabel('Email (tài khoản)').fill(email);
    await this.page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await this.page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  }
  async logout() {
    await this.page.goto('http://localhost:5175/settings');
    await this.page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await this.page.waitForURL('**/auth');
    await this.page.getByRole('heading', { name: 'Chào mừng trở lại' }).waitFor();
  }
}

let stage = 'initial login';
try {
  const auth = new PasswordPage(page);
  const email = `browser-${randomUUID()}@example.test`, password = randomUUID();
  await auth.open();
  assert.equal(await page.getByRole('button', { name: /Google|Gửi mã/ }).count(), 0);
  stage = 'password mismatch';
  await auth.signup(email, password, 'mismatched-password');
  await page.getByRole('alert').filter({ hasText: 'Mật khẩu nhập lại chưa khớp.' }).waitFor();
  stage = 'real signup';
  await page.getByLabel('Nhập lại mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await page.waitForURL('**/profile', { timeout: 20000 });
  await page.getByText(email, { exact: true }).waitFor();
  stage = 'persistent session';
  await page.reload();
  await page.getByText(email, { exact: true }).waitFor();
  stage = 'logout/denial';
  await auth.logout();
  await page.goto('http://localhost:5175/profile');
  await page.waitForURL('**/auth');
  stage = 'invalid credentials';
  await auth.login(email, 'wrong-password');
  await page.getByRole('alert').filter({ hasText: 'Email hoặc mật khẩu không đúng.' }).waitFor();
  stage = 'real password login';
  await auth.login(email, password);
  await page.waitForURL('**/profile', { timeout: 20000 });
  await page.getByText(email, { exact: true }).waitFor();
  stage = 'service failure';
  await auth.logout();
  // Explicit fault injection into a real signup-free login flow; not a fake success.
  await page.route('**/auth/v1/token?**', route => route.abort('failed'));
  await auth.login(email, password);
  await page.getByRole('alert').waitFor({ timeout: 20000 });
  assert.ok(page.url().endsWith('/auth'));
  assert.deepEqual(errors, []);
  console.log('PASS browser password: default login, mismatch, real signup, reload, logout, protected route, wrong password, real login, service failure.');
} catch {
  console.error(`FAIL browser password at ${stage}; no credential or page payload logged.`);
  process.exitCode = 1;
} finally { await browser.close(); }
