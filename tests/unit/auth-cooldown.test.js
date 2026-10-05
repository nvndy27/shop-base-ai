import { describe, expect, it } from 'vitest';
import { createAuthCooldown } from '../../frontend/src/auth/cooldown.js';

describe('auth cooldown persistence', () => {
  it('survives reload and coordinates tabs without storing contact details or OTP', () => {
    let time = 100000;
    const values = new Map();
    const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const first = createAuthCooldown(storage, () => time);
    const second = createAuthCooldown(storage, () => time);
    expect(first.start(60)).toBe(60);
    time += 15000;
    expect(createAuthCooldown(storage, () => time).remaining()).toBe(45);
    expect(second.remaining()).toBe(45);
    second.start(60);
    expect(first.remaining()).toBe(60);
    expect([...values.values()]).toEqual(['175000']);
    time += 60000;
    expect(first.remaining()).toBe(0);
  });
  it('keeps working with unavailable storage and ignores malformed stored times', () => {
    let time = 100000;
    const cooldown = createAuthCooldown({ getItem() { throw new Error(); }, setItem() { throw new Error(); } }, () => time);
    expect(cooldown.start(60)).toBe(60);
    time += 60001;
    expect(cooldown.remaining()).toBe(0);
    for (const value of ['NaN', 'Infinity', '-10', '99999999999999']) {
      expect(createAuthCooldown({ getItem: () => value }, () => time).remaining()).toBe(0);
    }
  });
});
