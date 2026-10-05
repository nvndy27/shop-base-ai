import { describe, expect, it, vi } from 'vitest';
import {
  authMessage, callbackUrl, createAuthService, normalizePhone, normalizeEmail, authRetryDelay,
} from '../../frontend/src/auth/service.js';
import { createApi } from '../../frontend/src/auth/api.js';
import { tabStorage, deviceStorage } from '../../frontend/src/auth/storage.js';
import { providerGuard } from '../../frontend/src/auth/providers.js';
import { proxyOrigin, publicAuthConfig } from '../../frontend/config/public-auth.js';

const session = { access_token: 'test-access-token', user: { id: 'user-a' } };
function sdk() {
  return { auth: {
    signInWithOtp: vi.fn(async () => ({ data: {}, error: null })),
    verifyOtp: vi.fn(async () => ({ data: { session }, error: null })),
    signInWithOAuth: vi.fn(async () => ({ data: { url: 'https://example.supabase.co/auth/v1/authorize' }, error: null })),
    exchangeCodeForSession: vi.fn(async () => ({ data: { session }, error: null })),
    setSession: vi.fn(async () => ({ data: { session }, error: null })),
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: session.user }, error: null })),
    updateUser: vi.fn(async () => ({ data: { user: session.user }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  } };
}

describe('frontend real auth service', () => {
  it('login never allows automatic account creation for email or phone', async () => {
    const client = sdk();
    const service = createAuthService(client);
    await service.sendEmailOtp('person@gmail.com', 'login');
    await service.sendOtp('0900000000', 'login');
    expect(client.auth.signInWithOtp.mock.calls).toEqual([
      [{ email: 'person@gmail.com', options: { shouldCreateUser: false } }],
      [{ phone: '+84900000000', options: { shouldCreateUser: false } }],
    ]);
    await expect(service.sendEmailOtp('person@gmail.com', 'unknown')).rejects.toThrow();
    expect(client.auth.signInWithOtp).toHaveBeenCalledTimes(2);
  });
  it('validates email before sending and never creates a session from delivery', async () => {
    const client = sdk();
    const service = createAuthService(client);
    expect(normalizeEmail(' Person@GMAIL.COM ')).toBe('person@gmail.com');
    await expect(service.sendEmailOtp('bad email')).rejects.toThrow('email hợp lệ');
    expect(client.auth.signInWithOtp).not.toHaveBeenCalled();
    await expect(service.sendEmailOtp(' Person@GMAIL.COM ')).resolves.toBe('person@gmail.com');
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({ email: 'person@gmail.com', options: { shouldCreateUser: true } });
    expect(client.auth.verifyOtp).not.toHaveBeenCalled();
    client.auth.signInWithOtp.mockResolvedValue({ error: { status: 503 } });
    await expect(service.sendEmailOtp('person@gmail.com')).rejects.toThrow();
  });
  it('fails closed for a disabled email provider', async () => {
    const client = sdk();
    const guard = providerGuard('https://example.supabase.co', 'public-test', async () => Response.json({ external: { email: false } }));
    await expect(createAuthService(client, guard).sendEmailOtp('person@gmail.com')).rejects.toThrow('Email chưa được bật');
    expect(client.auth.signInWithOtp).not.toHaveBeenCalled();
  });
  it('verifies email codes with email type and rejects missing sessions', async () => {
    const client = sdk();
    const service = createAuthService(client);
    await expect(service.verifyEmailOtp('person@gmail.com', 'abcdef')).rejects.toThrow();
    await expect(service.verifyEmailOtp('person@gmail.com', '12345678')).resolves.toEqual(session);
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({ email: 'person@gmail.com', token: '12345678', type: 'email' });
    client.auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
    await expect(service.verifyEmailOtp('person@gmail.com', '123456')).rejects.toThrow('Không nhận được phiên');
  });
  it('routes email confirmation links to the current frontend callback with PKCE enabled by the SDK', async () => {
    const client = sdk();
    await createAuthService(client).sendEmailOtp('person@gmail.com', 'login', 'http://localhost:5175');
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({ email: 'person@gmail.com', options: {
      shouldCreateUser: false, emailRedirectTo: 'http://localhost:5175/auth/callback',
    } });
    await expect(createAuthService(client).sendEmailOtp('person@gmail.com', 'login', 'javascript:bad')).rejects.toThrow();
    expect(client.auth.signInWithOtp).toHaveBeenCalledTimes(1);
  });
  it('validates legacy email-link identity before saving and deduplicates StrictMode completion', async () => {
    const client = sdk();
    client.auth.getUser.mockResolvedValue({ data: { user: { ...session.user, email_confirmed_at: '2026-10-03' } }, error: null });
    const service = createAuthService(client);
    const completed = await Promise.all([service.acceptEmailLink('test-access', 'test-refresh'), service.acceptEmailLink('test-access', 'test-refresh')]);
    expect(completed[0].user.id).toBe('user-a');
    expect(client.auth.getUser).toHaveBeenCalledWith('test-access');
    expect(client.auth.setSession).toHaveBeenCalledTimes(1);
    expect(client.auth.getUser.mock.invocationCallOrder[0]).toBeLessThan(client.auth.setSession.mock.invocationCallOrder[0]);
  });
  it('never persists a rejected or unconfirmed email-link identity', async () => {
    const client = sdk();
    const service = createAuthService(client);
    client.auth.getUser.mockResolvedValue({ data: null, error: { status: 401 } });
    await expect(service.acceptEmailLink('invalid', 'test-refresh')).rejects.toThrow();
    client.auth.getUser.mockResolvedValue({ data: { user: session.user }, error: null });
    await expect(service.acceptEmailLink('unconfirmed', 'test-refresh')).rejects.toThrow('chưa được xác nhận');
    expect(client.auth.setSession).not.toHaveBeenCalled();
  });
  it('rejects an identity switch during email-link completion', async () => {
    const client = sdk();
    client.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-b', email_confirmed_at: '2026-10-03' } }, error: null });
    await expect(createAuthService(client).acceptEmailLink('test-access', 'test-refresh')).rejects.toThrow('không hợp lệ');
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('links a phone to the signed-in account rather than signing into a different one', async () => {
    const client = sdk();
    const service = createAuthService(client);
    await expect(service.beginPhoneChange('0900000000', 'other-user')).rejects.toThrow('Phiên đăng nhập đã thay đổi');
    expect(client.auth.updateUser).not.toHaveBeenCalled();
    await expect(service.beginPhoneChange('0900000000', 'user-a')).resolves.toEqual({ phone: '+84900000000', actorId: 'user-a' });
    expect(client.auth.updateUser).toHaveBeenCalledWith({ phone: '+84900000000' });
    expect(client.auth.signInWithOtp).not.toHaveBeenCalled();
    await expect(service.verifyPhoneChange('0900000000', '123456', 'other-user')).rejects.toThrow('Phiên đăng nhập đã thay đổi');
    expect(client.auth.verifyOtp).not.toHaveBeenCalled();
    client.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-a', phone: '84900000000', phone_confirmed_at: '2026-10-02T00:00:00Z' } } });
    await expect(service.verifyPhoneChange('0900000000', '123456', 'user-a')).resolves.toMatchObject({ user: { id: 'user-a', phone: '84900000000' } });
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({ phone: '+84900000000', token: '123456', type: 'phone_change' });
  });
  it('does not claim verification from editable phone metadata', async () => {
    const client = sdk();
    client.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-a', user_metadata: { phone: '84900000000', phone_confirmed_at: 'today' } } } });
    await expect(createAuthService(client).verifyPhoneChange('0900000000', '123456', 'user-a')).rejects.toThrow('chưa được xác minh');
  });
  it('normalizes a Vietnamese mobile number to E.164', () => {
    expect(normalizePhone('090 000 0000')).toBe('+84900000000');
    expect(normalizePhone('+84 900 000 000')).toBe('+84900000000');
  });
  it.each(['123', '0000000000', 'abc', '+0123456789', '+84900<script>'])('rejects invalid phone %s', phone => {
    expect(() => normalizePhone(phone)).toThrow();
  });
  it('never claims OTP delivery without a successful provider response', async () => {
    const client = sdk();
    client.auth.signInWithOtp.mockResolvedValue({ data: null, error: { code: 'phone_provider_disabled' } });
    await expect(createAuthService(client).sendOtp('0900000000')).rejects.toThrow('chưa được cấu hình');
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      phone: '+84900000000', options: { shouldCreateUser: true },
    });
  });
  it('requires numeric OTP and passes phone/token/type to Supabase', async () => {
    const client = sdk();
    const service = createAuthService(client);
    await expect(service.verifyOtp('0900000000', 'abcdef')).rejects.toThrow('6 chữ số');
    expect(client.auth.verifyOtp).not.toHaveBeenCalled();
    await expect(service.verifyOtp('0900000000', '123456')).resolves.toEqual(session);
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({
      phone: '+84900000000', token: '123456', type: 'sms',
    });
  });
  it('rejects an expired OTP rather than manufacturing a session', async () => {
    const client = sdk();
    client.auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: { code: 'otp_expired' } });
    await expect(createAuthService(client).verifyOtp('0900000000', '123456')).rejects.toThrow('hết hạn');
  });
  it('rejects missing sessions even when a transport returns no error', async () => {
    const client = sdk();
    client.auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
    await expect(createAuthService(client).verifyOtp('0900000000', '123456')).rejects.toThrow('Không nhận được phiên');
  });
  it('uses a fixed callback and minimal Google scopes, not a returnTo parameter', async () => {
    const client = sdk();
    await createAuthService(client).google('http://localhost:5175');
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'http://localhost:5175/auth/callback', scopes: 'openid email profile' },
    });
    expect(() => callbackUrl('https://example.com/?next=https://evil.test')).toThrow();
    expect(() => callbackUrl('javascript:alert(1)')).toThrow();
    expect(() => callbackUrl('http://external.test')).toThrow();
  });
  it('deduplicates a one-time PKCE code across StrictMode effects', async () => {
    const client = sdk();
    const service = createAuthService(client);
    await Promise.all([service.exchangeCode('test-code'), service.exchangeCode('test-code')]);
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    await service.exchangeCode('another-code');
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledTimes(2);
  });
  it('verifies restored identity with Auth instead of trusting browser storage', async () => {
    const client = sdk();
    await expect(createAuthService(client).restore()).resolves.toEqual(session);
    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    client.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-b' } }, error: null });
    await expect(createAuthService(client).restore()).rejects.toThrow('không hợp lệ');
  });
  it('shares simultaneous restore requests but verifies again on a later restore', async () => {
    const client = sdk();
    const service = createAuthService(client);
    const sessions = await Promise.all([service.restore(), service.restore()]);
    expect(sessions).toEqual([session, session]);
    expect(client.auth.getSession).toHaveBeenCalledTimes(1);
    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    await service.restore();
    expect(client.auth.getUser).toHaveBeenCalledTimes(2);
  });
  it('retains safe rate-limit metadata without leaking provider payloads', async () => {
    const client = sdk();
    client.auth.verifyOtp.mockResolvedValue({ data: null, error: { status: 429, code: 'over_request_rate_limit', message: 'private-token' } });
    const service = createAuthService(client);
    const failure = await service.verifyEmailOtp('person@gmail.com', '123456').catch(error => error);
    expect(failure.status).toBe(429);
    expect(authRetryDelay(failure)).toBe(60);
    expect(failure.message).not.toContain('private-token');
    expect(authRetryDelay({ code: 'over_email_send_rate_limit' })).toBe(60);
    expect(authRetryDelay({ code: 'otp_expired' })).toBe(0);
  });
  it('never restores an unverified session after rate limiting and allows a later verified restore', async () => {
    const client = sdk();
    client.auth.getUser.mockResolvedValueOnce({ data: null, error: { status: 429 } });
    const service = createAuthService(client);
    await expect(service.restore()).rejects.toThrow('quá nhiều');
    await expect(service.restore()).resolves.toEqual(session);
    expect(client.auth.getUser).toHaveBeenCalledTimes(2);
  });
  it('restores no session when signed out', async () => {
    const client = sdk();
    client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(createAuthService(client).restore()).resolves.toBeNull();
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });
  it('calls real local/global signOut and propagates failures', async () => {
    const client = sdk();
    const service = createAuthService(client);
    await service.logout();
    await service.logout('global');
    expect(client.auth.signOut.mock.calls).toEqual([[{ scope: 'local' }], [{ scope: 'global' }]]);
    client.auth.signOut.mockResolvedValue({ error: { status: 503 } });
    await expect(service.logout()).rejects.toThrow();
  });
  it('does not expose provider errors containing PII, tokens, or raw payloads', () => {
    expect(authMessage({ message: 'token=secret phone=private', code: 'unknown' })).not.toContain('secret');
    expect(authMessage({ status: 429 })).toContain('quá nhiều');
  });
  it('fails closed when Supabase is not configured', async () => {
    await expect(createAuthService(null).sendOtp('0900000000')).rejects.toThrow('chưa được cấu hình');
  });
  it('does not send OTP or start OAuth when the project has providers disabled', async () => {
    const client = sdk();
    const fetcher = vi.fn(async () => Response.json({ external: { google: false, phone: false } }));
    const service = createAuthService(client, providerGuard('https://example.supabase.co', 'sb_publishable_test', fetcher));
    await expect(service.sendOtp('0900000000')).rejects.toThrow('SMS provider');
    await expect(service.google('http://localhost:5175')).rejects.toThrow('Google chưa được bật');
    expect(client.auth.signInWithOtp).not.toHaveBeenCalled();
    expect(client.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(fetcher.mock.calls[0][1].credentials).toBe('omit');
  });
  it('allows enabled providers and fails closed on unknown configuration or downtime', async () => {
    const client = sdk();
    const enabled = providerGuard('https://example.supabase.co', 'sb_publishable_test',
      async () => Response.json({ external: { google: true, phone: true } }));
    await createAuthService(client, enabled).sendOtp('0900000000');
    expect(client.auth.signInWithOtp).toHaveBeenCalledTimes(1);
    const unavailable = providerGuard('https://example.supabase.co', 'sb_publishable_test',
      async () => new Response('{}', { status: 503 }));
    await expect(unavailable('phone')).rejects.toThrow('Không kiểm tra được');
    const unknown = providerGuard('https://example.supabase.co', 'sb_publishable_test',
      async () => Response.json({}));
    await expect(unknown('phone')).rejects.toThrow('chưa được bật');
  });
});

describe('frontend bearer API contract', () => {
  it('uses the current refreshed SDK token, JSON ID body, no cookies or query tokens', async () => {
    const client = sdk();
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const request = createApi(client, fetcher);
    await request('/api/v1/me/addresses', { method: 'DELETE', body: { id: 'address-a' } });
    const [path, options] = fetcher.mock.calls[0];
    expect(path).toBe('/api/v1/me/addresses');
    expect(options.credentials).toBe('omit');
    expect(options.headers.Authorization).toBe('Bearer test-access-token');
    expect(JSON.parse(options.body)).toEqual({ id: 'address-a' });
    client.auth.getSession.mockResolvedValue({ data: { session: { ...session, access_token: 'refreshed-token' } }, error: null });
    await request('/api/v1/me');
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer refreshed-token');
  });
  it('never sends unauthenticated requests or bearer tokens to external URLs', async () => {
    const client = sdk();
    const fetcher = vi.fn();
    const request = createApi(client, fetcher);
    await expect(request('https://evil.test/api/v1/me')).rejects.toThrow();
    client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(request('/api/v1/me')).rejects.toThrow('đăng nhập lại');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('logs out on 401 without retrying the mutation', async () => {
    const client = sdk();
    const fetcher = vi.fn(async () => new Response('{}', { status: 401 }));
    await expect(createApi(client, fetcher)('/api/v1/me', { method: 'PATCH', body: { display_name: 'Test' } })).rejects.toThrow('hết hạn');
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not log out on resource denial or provider downtime', async () => {
    const client = sdk();
    for (const [status, code] of [[403, 'FORBIDDEN'], [503, 'SERVICE_UNAVAILABLE']]) {
      const fetcher = vi.fn(async () => Response.json({ error: { code, message: 'private-token' } }, { status }));
      await expect(createApi(client, fetcher)('/api/v1/me')).rejects.not.toThrow('private-token');
    }
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });
});

describe('browser configuration boundary', () => {
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
  it('exports only URL/public key, never service secrets or backend settings', () => {
    expect(publicAuthConfig({ ...env, SERVICE_ROLE_KEY: 'secret', APP_ORIGIN: 'private' }))
      .toEqual({ url: env.SUPABASE_URL, key: env.SUPABASE_PUBLISHABLE_KEY });
  });
  it('rejects secret keys and service_role JWTs', () => {
    const privilegedJwt = `test.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.test`;
    for (const key of ['sb_secret_never_expose', privilegedJwt]) {
      expect(() => publicAuthConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: key })).toThrow('Secret keys');
    }
  });
  it('supports anon JWT keys and validated frontend overrides', () => {
    const anon = `test.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.test`;
    expect(publicAuthConfig({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: anon }).key).toBe(anon);
    expect(() => publicAuthConfig({ ...env, VITE_SUPABASE_URL: 'https://user:pass@example.test' })).toThrow();
  });
  it('does not derive the proxy upstream Origin from arbitrary input', () => {
    expect(proxyOrigin('https://example.test')).toBe('https://example.test');
    expect(proxyOrigin('https://example.test/path')).toBe('http://localhost:3000');
    expect(proxyOrigin('javascript:alert(1)')).toBe('http://localhost:3000');
  });
  it('uses only the explicitly provided tab storage', () => {
    const backing = new Map();
    const storage = tabStorage({
      getItem: key => backing.get(key) ?? null,
      setItem: (key, value) => backing.set(key, value),
      removeItem: key => backing.delete(key),
    });
    storage.setItem('session', 'test');
    expect(storage.getItem('session')).toBe('test');
    storage.removeItem('session');
    expect(storage.getItem('session')).toBeNull();
  });
  it('moves the old session once and does not resurrect another old tab after logout', () => {
    const persistent = new Map();
    const previous = new Map([['sdk-session', 'previous-session'], ['sdk-session-code-verifier', 'verifier'], ['other', 'untouched']]);
    const staleTab = new Map(previous);
    const wrap = values => ({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) });
    const store = deviceStorage(wrap(persistent), wrap(previous), 'sdk-session');
    expect(store.getItem('sdk-session')).toBe('previous-session');
    expect(store.getItem('sdk-session-code-verifier')).toBe('verifier');
    expect(previous.get('sdk-session')).toBeUndefined();
    expect(previous.get('other')).toBe('untouched');
    store.removeItem('sdk-session');
    expect(deviceStorage(wrap(persistent), wrap(staleTab), 'sdk-session').getItem('sdk-session')).toBeNull();
  });
  it('does not replace a newer device session with old tab data', () => {
    const persistent = new Map([['sdk-session', 'new-session']]);
    const previous = new Map([['sdk-session', 'old-session']]);
    const wrap = values => ({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) });
    expect(deviceStorage(wrap(persistent), wrap(previous), 'sdk-session').getItem('sdk-session')).toBe('new-session');
    expect(previous.has('sdk-session')).toBe(false);
  });
});
