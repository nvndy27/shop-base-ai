import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '../../frontend/node_modules/@supabase/supabase-js/dist/index.mjs';
import { createAuthService } from '../../frontend/src/auth/service.js';
import { deviceStorage } from '../../frontend/src/auth/storage.js';

// Actual installed SDK + isolated transport/storage, not a real Auth account.
const actor = {
  id: '10000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  created_at: '2026-10-01T00:00:00Z',
  email_confirmed_at: '2026-10-01T00:00:00Z',
  email: 'test@example.invalid',
  app_metadata: { provider: 'google' },
  user_metadata: {},
  identities: [],
};
function tokenResponse(label = 'first', expiry = 3600) {
  return {
    user: actor,
    access_token: `${label}-test-access-token`,
    refresh_token: `${label}-test-refresh-token`,
    token_type: 'bearer',
    expires_in: expiry,
    expires_at: Math.floor(Date.now() / 1000) + expiry,
  };
}
const clients = [];
let count = 0;
function setup() {
  const backing = new Map();
  const events = [];
  let currentActor = { ...actor };
  let pendingPhone = null;
  const fetcher = vi.fn(async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(init.body) : null;
    events.push({ path: url.pathname, grant: url.searchParams.get('grant_type'), body, headers: new Headers(init?.headers) });
    if (url.pathname.endsWith('/otp')) return Response.json({});
    if (url.pathname.endsWith('/verify')) {
      if (body.type === 'phone_change') {
        currentActor = { ...currentActor, phone: pendingPhone.replace(/^\+/, ''), phone_confirmed_at: '2026-10-02T00:00:00Z' };
      }
      return Response.json({ ...tokenResponse(), user: currentActor });
    }
    if (url.pathname.endsWith('/token')) return Response.json(tokenResponse(url.searchParams.get('grant_type') === 'refresh_token' ? 'renewed' : 'oauth'));
    if (url.pathname.endsWith('/user')) {
      if (init?.method === 'PUT') pendingPhone = body.phone;
      return Response.json(currentActor);
    }
    if (url.pathname.endsWith('/logout')) return new Response(null, { status: 204 });
    throw new Error('Unexpected test request');
  });
  const persistent = {
    getItem: key => backing.get(key) ?? null,
    setItem: (key, value) => backing.set(key, value),
    removeItem: key => backing.delete(key),
  };
  const storageKey = `test-auth-${++count}`;
  const makeClient = () => {
    // New tab/browser visit: only persistent device storage survives.
    const tab = new Map();
    const storage = deviceStorage(persistent, {
      getItem: key => tab.get(key) ?? null,
      setItem: (key, value) => tab.set(key, value),
      removeItem: key => tab.delete(key),
    }, storageKey);
    const client = createClient('https://example.supabase.co', 'sb_publishable_test', {
      global: { fetch: fetcher },
      auth: { flowType: 'pkce', storage, storageKey, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    });
    clients.push(client);
    return client;
  };
  const client = makeClient();
  return { client, makeClient, backing, storageKey, events, fetcher, service: createAuthService(client) };
}
afterEach(() => {
  for (const client of clients.splice(0)) client.auth.stopAutoRefresh();
});

describe('installed Supabase SDK session lifecycle', () => {
  it('logs in with a password grant and restores the persisted identity in a new client', async () => {
    const state = setup();
    const session = await state.service.loginWithPassword(' Test@Example.Invalid ', 'fixture-password');
    expect(session.user.id).toBe(actor.id);
    const request = state.events.find(event => event.grant === 'password');
    expect(request.body).toMatchObject({ email: actor.email, password: 'fixture-password' });
    expect(state.events.some(event => event.path.endsWith('/otp'))).toBe(false);
    const restored = await createAuthService(state.makeClient()).restore();
    expect(restored.user.id).toBe(actor.id);
    await state.service.logout();
    expect((await state.client.auth.getSession()).data.session).toBeNull();
  });
  it('leaves signup pending when the actual SDK receives an unconfirmed user without tokens', async () => {
    const state = setup();
    state.fetcher.mockImplementationOnce(async () => Response.json({ ...actor, email_confirmed_at: null }));
    const result = await state.service.signupWithPassword(actor.email, 'fixture-password', 'http://localhost:5175');
    expect(result).toEqual({ session: null, confirmationRequired: true });
    expect((await state.client.auth.getSession()).data.session).toBeNull();
    const [url, init] = state.fetcher.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe('/auth/v1/signup');
    expect(JSON.parse(init.body)).toMatchObject({ email: actor.email, password: 'fixture-password' });
  });
  it('persists signup only when Auth actually issues tokens in a dev project without email confirmation', async () => {
    const state = setup();
    state.fetcher.mockImplementationOnce(async () => Response.json(tokenResponse('signup')));
    const result = await state.service.signupWithPassword(actor.email, 'fixture-password', 'http://localhost:5175');
    expect(result.confirmationRequired).toBe(false);
    expect(result.session.access_token).toBe('signup-test-access-token');
    expect((await createAuthService(state.makeClient()).restore()).user.id).toBe(actor.id);
  });
  it('login sends create_user false to Auth and leaves the visitor unauthenticated until verification', async () => {
    const state = setup();
    await state.service.sendEmailOtp('test@example.invalid', 'login');
    await state.service.sendOtp('0900000000', 'login');
    expect(state.events.filter(event => event.path.endsWith('/otp')).map(event => event.body.create_user)).toEqual([false, false]);
    expect((await state.client.auth.getSession()).data.session).toBeNull();
  });
  it('creates an email OTP session only after verification', async () => {
    const state = setup();
    await state.service.sendEmailOtp(' TEST@example.invalid ');
    expect((await state.client.auth.getSession()).data.session).toBeNull();
    const session = await state.service.verifyEmailOtp('test@example.invalid', '12345678');
    expect(session.user.email).toBe(actor.email);
    expect(state.events.find(event => event.path.endsWith('/verify')).body)
      .toMatchObject({ email: 'test@example.invalid', token: '12345678', type: 'email' });
  });
  it('sends an email PKCE challenge and an explicit frontend callback', async () => {
    const state = setup();
    await state.service.sendEmailOtp('test@example.invalid', 'signup', 'http://localhost:5175');
    const delivery = state.events.find(event => event.path.endsWith('/otp'));
    expect(delivery.body.code_challenge_method).toBe('s256');
    expect(delivery.body.code_challenge).toBeTruthy();
    expect(state.backing.get(`${state.storageKey}-code-verifier`)).toBeTruthy();
    const requestUrl = new URL(String(state.fetcher.mock.calls.find(([input]) => new URL(String(input)).pathname.endsWith('/otp'))[0]));
    expect(requestUrl.searchParams.get('redirect_to')).toBe('http://localhost:5175/auth/callback');
    expect((await state.client.auth.getSession()).data.session).toBeNull();
  });
  it('persists a legacy confirmation session only after Auth validation and restores after reload', async () => {
    const state = setup();
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: actor.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.${Buffer.from('test-signature').toString('base64url')}`;
    await expect(state.service.acceptEmailLink(token, 'test-refresh')).resolves.toMatchObject({ user: { id: actor.id } });
    expect(state.events[0].path.endsWith('/user')).toBe(true);
    expect(state.backing.get(state.storageKey)).toBeTruthy();
    await expect(createAuthService(state.makeClient()).restore()).resolves.toMatchObject({ user: { id: actor.id } });
  });
  it('adds a verified phone without creating or switching the email account', async () => {
    const state = setup();
    await state.service.verifyEmailOtp('test@example.invalid', '12345678');
    const change = await state.service.beginPhoneChange('0900000000', actor.id);
    const session = await state.service.verifyPhoneChange(change.phone, '123456', change.actorId);
    expect(session.user).toMatchObject({ id: actor.id, email: actor.email, phone: '84900000000' });
    expect(state.events.filter(event => event.path.endsWith('/otp'))).toHaveLength(0);
    expect(state.events.find(event => event.path.endsWith('/user') && event.body?.phone).body)
      .toMatchObject({ phone: '+84900000000' });
    expect(state.events.find(event => event.path.endsWith('/verify') && event.body.type === 'phone_change').body)
      .toMatchObject({ phone: '+84900000000', type: 'phone_change' });
  });
  it('verifies SMS through the SDK and restores only after Auth.getUser verification', async () => {
    const state = setup();
    await state.service.sendOtp('0900000000');
    const session = await state.service.verifyOtp('0900000000', '123456');
    expect(session.user.id).toBe(actor.id);
    expect(state.events.find(event => event.path.endsWith('/verify')).body)
      .toMatchObject({ phone: '+84900000000', token: '123456', type: 'sms' });
    // Simulate returning with a fresh tab and the same persistent device storage.
    const reloaded = createAuthService(state.makeClient());
    await expect(reloaded.restore()).resolves.toMatchObject({ user: { id: actor.id } });
    expect(state.events.some(event => event.path.endsWith('/user'))).toBe(true);
  });
  it('performs PKCE challenge, verifier exchange and does not infer success from a URL', async () => {
    const state = setup();
    const result = await state.client.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: 'http://localhost:5175/auth/callback', skipBrowserRedirect: true },
    });
    const oauth = new URL(result.data.url);
    expect(oauth.searchParams.get('code_challenge_method')).toBe('s256');
    expect(oauth.searchParams.get('code_challenge')).toBeTruthy();
    expect(oauth.searchParams.get('redirect_to')).toBe('http://localhost:5175/auth/callback');
    expect((await state.client.auth.getSession()).data.session).toBeNull();
    const session = await state.service.exchangeCode('one-time-test-code');
    expect(session.access_token).toBe('oauth-test-access-token');
    const exchange = state.events.find(event => event.grant === 'pkce');
    expect(exchange.body.auth_code).toBe('one-time-test-code');
    expect(exchange.body.code_verifier).toBeTruthy();
  });
  it('refreshes expired sessions using the refresh token and exposes the new bearer', async () => {
    const state = setup();
    await state.service.verifyOtp('0900000000', '123456');
    const stored = JSON.parse(state.backing.get(state.storageKey));
    stored.expires_at = Math.floor(Date.now() / 1000) - 10;
    state.backing.set(state.storageKey, JSON.stringify(stored));
    const session = await state.service.restore();
    expect(session.access_token).toBe('renewed-test-access-token');
    const refresh = state.events.find(event => event.grant === 'refresh_token');
    expect(refresh.body.refresh_token).toBe('first-test-refresh-token');
  });
  it('removes the stored session only after successful real SDK signOut', async () => {
    const state = setup();
    await state.service.verifyOtp('0900000000', '123456');
    await state.service.logout('global');
    expect((await state.client.auth.getSession()).data.session).toBeNull();
    expect(state.backing.has(state.storageKey)).toBe(false);
    await expect(createAuthService(state.makeClient()).restore()).resolves.toBeNull();
    expect(state.events.find(event => event.path.endsWith('/logout')).headers.get('authorization'))
      .toBe('Bearer first-test-access-token');
  });
  it('recovers a still-valid verified session when a repeated OTP verification is rate limited', async () => {
    const state = setup();
    await state.service.verifyOtp('0900000000', '123456');
    const transport = state.fetcher.getMockImplementation();
    state.fetcher.mockImplementation(async (input, options) => {
      if (new URL(String(input)).pathname.endsWith('/verify')) {
        return Response.json({ code: 'over_request_rate_limit', msg: 'limited' }, {
          status: 429, headers: { 'x-supabase-api-version': '2024-01-01' },
        });
      }
      return transport(input, options);
    });
    await expect(state.service.verifyOtp('0900000000', '123456')).rejects.toMatchObject({ status: 429 });
    await expect(state.service.restore()).resolves.toMatchObject({ user: { id: actor.id } });
    expect(state.events.some(event => event.path.endsWith('/user'))).toBe(true);
  });
  it('does not fabricate an authenticated user when the SDK receives invalid OTP', async () => {
    const state = setup();
    state.fetcher.mockImplementation(async () => Response.json({ code: 'otp_expired', msg: 'expired' }, {
      status: 403, headers: { 'x-supabase-api-version': '2024-01-01' },
    }));
    await expect(state.service.verifyOtp('0900000000', '123456')).rejects.toThrow('hết hạn');
    expect((await state.client.auth.getSession()).data.session).toBeNull();
  });
});
