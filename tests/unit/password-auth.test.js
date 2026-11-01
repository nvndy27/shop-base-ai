import { describe, expect, it, vi } from 'vitest';
import { authMessage, createAuthService } from '../../frontend/src/auth/service.js';

const session = { access_token: 'fixture-access-token', user: { id: 'buyer-a' } };
function setup() {
  const client = { auth: {
    signInWithPassword: vi.fn(async () => ({ data: { session }, error: null })),
    signUp: vi.fn(async () => ({ data: { session }, error: null })),
  } };
  return { client, service: createAuthService(client) };
}

describe('password auth', () => {
  it('normalizes the email while preserving the exact password', async () => {
    const { client, service } = setup();
    await expect(service.loginWithPassword(' Buyer@Example.com ', '  password  ')).resolves.toEqual(session);
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'buyer@example.com', password: '  password  ' });
  });
  it('does not manufacture a login session on invalid credentials or a missing token', async () => {
    const { client, service } = setup();
    client.auth.signInWithPassword.mockResolvedValueOnce({ error: { code: 'invalid_credentials', message: 'private password' } });
    await expect(service.loginWithPassword('buyer@example.com', 'wrong')).rejects.toThrow('Email hoặc mật khẩu không đúng');
    client.auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(service.loginWithPassword('buyer@example.com', 'wrong')).rejects.toThrow('Không nhận được phiên');
  });
  it('never submits invalid email, empty login password, or short signup password', async () => {
    const { client, service } = setup();
    await expect(service.loginWithPassword('invalid', 'password')).rejects.toThrow();
    await expect(service.loginWithPassword('buyer@example.com', '')).rejects.toThrow();
    await expect(service.signupWithPassword('buyer@example.com', 'short', 'http://localhost:5175')).rejects.toThrow('8');
    await expect(service.signupWithPassword('buyer@example.com', 'password', 'https://evil.test/?next=bad')).rejects.toThrow();
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });
  it('signs up without sending editable roles or owner data', async () => {
    const { client, service } = setup();
    await expect(service.signupWithPassword('buyer@example.com', 'password', 'http://localhost:5175'))
      .resolves.toEqual({ session, confirmationRequired: false });
    expect(client.auth.signUp).toHaveBeenCalledWith({ email: 'buyer@example.com', password: 'password',
      options: { emailRedirectTo: 'http://localhost:5175/auth/callback' } });
  });
  it('does not treat an unconfirmed or obfuscated signup user as an authenticated account', async () => {
    const { client, service } = setup();
    client.auth.signUp.mockResolvedValue({ data: { user: { id: 'unconfirmed-or-obfuscated' }, session: null }, error: null });
    await expect(service.signupWithPassword('buyer@example.com', 'password', 'http://localhost:5175'))
      .resolves.toEqual({ session: null, confirmationRequired: true });
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it('fails closed when configuration or registration is unavailable', async () => {
    await expect(createAuthService(null).loginWithPassword('buyer@example.com', 'password')).rejects.toThrow('chưa được cấu hình');
    const { client, service } = setup();
    client.auth.signUp.mockResolvedValue({ data: null, error: { code: 'weak_password', message: 'private' } });
    await expect(service.signupWithPassword('buyer@example.com', 'password', 'http://localhost:5175')).rejects.toThrow('Mật khẩu');
    expect(authMessage({ code: 'email_not_confirmed' })).toContain('chưa được xác nhận');
  });
});
