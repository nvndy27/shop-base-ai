import { describe, expect, it } from 'vitest';
import { accountDestination, saveSignupIntent } from '../../frontend/src/auth/onboarding.js';

describe('signup onboarding preference', () => {
  it('routes seller signup to the shop section but never passes a role or resource identifier', () => {
    const backing = new Map();
    const storage = { getItem: key => backing.get(key), setItem: (key, value) => backing.set(key, value) };
    saveSignupIntent('signup', 'seller', storage);
    expect(accountDestination(storage)).toBe('/profile#shop');
    expect([...backing.values()]).toEqual(['seller']);
    saveSignupIntent('login', 'seller', storage);
    expect(accountDestination(storage)).toBe('/profile');
    saveSignupIntent('signup', 'buyer', storage);
    expect(accountDestination(storage)).toBe('/profile');
  });
  it('rejects arbitrary destinations and still works when optional storage is blocked', () => {
    expect(accountDestination({ getItem: () => 'https://untrusted.invalid' })).toBe('/profile');
    const blocked = { getItem: () => { throw new Error('Blocked'); }, setItem: () => { throw new Error('Blocked'); } };
    expect(() => saveSignupIntent('signup', 'seller', blocked)).not.toThrow();
    expect(accountDestination(blocked)).toBe('/profile');
  });
});
