// Real development services only; isolated fixtures, passwords/tokens kept in memory.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '../frontend/node_modules/@supabase/supabase-js/dist/index.mjs';
import { chatDevConfig } from './chat-dev-config.mjs';

export function totp(secret, now = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.replace(/=+$/, '').toUpperCase()].map(character => {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid TOTP secret');
    return index.toString(2).padStart(5, '0');
  }).join('');
  const key = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

export function devHarness() {
  const config = chatDevConfig(process.env);
  const runId = randomUUID();
  const created = { users: [], shops: [], products: [], orders: [] };
  const clients = [];
  const admin = createClient(config.url, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const base = process.env.DEV_BFF_URL || 'http://127.0.0.1:3000';
  if (!['http://127.0.0.1:3000', 'http://localhost:3000'].includes(base)) throw new Error('BFF nghiệm thu chỉ chạy loopback port 3000.');
  function checked(result, operation) {
    if (result.error) throw new Error(`${operation} thất bại (${result.error.code || result.error.status || 'unknown'}).`);
    return result.data;
  }
  function newClient() {
    const client = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
    clients.push(client);
    return client;
  }
  async function actor(name) {
    const email = `acceptance-${runId}-${name}@example.test`;
    const password = `${randomUUID()}-${randomUUID()}`;
    const client = newClient();
    const data = checked(await client.auth.signUp({ email, password }), 'Password signup');
    assert.ok(data.session, 'Dev phải cấp phiên signup, không yêu cầu gửi email');
    created.users.push(data.user.id);
    const user = checked(await client.auth.getUser(), 'Auth getUser').user;
    assert.equal(user.id, data.user.id);
    assert.ok(user.email_confirmed_at);
    assert.equal(Boolean(user.phone_confirmed_at), false, 'Không tự xác minh SĐT');
    return { id: user.id, email, password, client };
  }
  async function token(actor) {
    const session = checked(await actor.client.auth.getSession(), 'Auth getSession').session;
    assert.ok(session?.access_token);
    return session.access_token;
  }
  async function api(actor, path, { method = 'GET', body, bytes, contentType } = {}) {
    const response = await fetch(base + '/api/v1' + path, {
      method, headers: {
        ...(actor ? { Authorization: `Bearer ${await token(actor)}` } : {}),
        ...(body === undefined && !bytes ? {} : { 'Content-Type': contentType || 'application/json' }),
      },
      ...(bytes ? { body: bytes } : body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    return { status: response.status, data: response.status === 204 ? null : await response.json(), headers: response.headers };
  }
  async function allowed(actor, path, options) {
    const result = await api(actor, path, options);
    assert.ok(result.status >= 200 && result.status < 300, `${path}: HTTP ${result.status}, code ${result.data?.error?.code || 'unknown'}`);
    return result.data;
  }
  async function moderator(actor) {
    checked(await admin.from('user_roles').insert({ user_id: actor.id, permission: 'shops:moderate' }), 'Fixture moderator');
    const enrolled = checked(await actor.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `dev-${runId}` }), 'MFA enroll');
    checked(await actor.client.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code: totp(enrolled.totp.secret) }), 'MFA verify');
    const level = checked(await actor.client.auth.mfa.getAuthenticatorAssuranceLevel(), 'MFA level');
    assert.equal(level.currentLevel, 'aal2');
  }
  return { config, runId, created, admin, clients, actor, token, api, allowed, checked, moderator, newClient };
}
