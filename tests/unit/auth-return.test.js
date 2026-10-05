import { describe, expect, it } from 'vitest';
import { hasAuthReturn, parseAuthReturn } from '../../frontend/src/auth/return.js';

describe('email confirmation return routing', () => {
  it('recognizes email returns on the homepage without hijacking normal shop anchors', () => {
    expect(hasAuthReturn('?code=test-code', '')).toBe(true);
    expect(hasAuthReturn('', '#access_token=test&refresh_token=test')).toBe(true);
    expect(hasAuthReturn('', '#error=access_denied')).toBe(true);
    expect(hasAuthReturn('?category=electronics', '#shop')).toBe(false);
  });
  it('parses a single PKCE code or legacy email token pair', () => {
    expect(parseAuthReturn('?code=test-code', '')).toEqual({ kind: 'pkce', code: 'test-code' });
    expect(parseAuthReturn('', '#access_token=test-access&refresh_token=test-refresh&token_type=bearer&type=signup'))
      .toEqual({ kind: 'email-link', accessToken: 'test-access', refreshToken: 'test-refresh' });
  });
  it.each([
    ['?access_token=test&refresh_token=test', ''],
    ['?code=one&code=two', ''],
    ['?code=one', '#access_token=test'],
    ['', '#access_token=test&token_type=bearer&type=signup'],
    ['', '#access_token=test&refresh_token=test&token_type=bearer&type=recovery'],
    ['', '#access_token=test&refresh_token=test&token_type=other&type=signup'],
    ['', '#error=access_denied&error_description=private-data'],
    ['', ''],
  ])('rejects malformed, ambiguous or unrelated credential returns without exposing data', (search, hash) => {
    expect(() => parseAuthReturn(search, hash)).toThrow('Liên kết xác nhận');
    try { parseAuthReturn(search, hash); } catch (error) { expect(error.message).not.toContain('private-data'); }
  });
});
