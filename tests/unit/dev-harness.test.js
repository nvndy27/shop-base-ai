import { expect, it } from 'vitest';
import { totp } from '../../scripts/dev-harness.mjs';

it('generates the six-digit TOTP from the RFC 6238 SHA1 test vector for real dev MFA', () => {
  expect(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000)).toBe('287082');
  expect(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1111111109000)).toBe('081804');
  expect(() => totp('not a valid secret')).toThrow('Invalid TOTP');
});
