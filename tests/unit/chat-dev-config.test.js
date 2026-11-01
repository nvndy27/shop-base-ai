import { describe, expect, it } from 'vitest';
import { chatDevConfig } from '../../scripts/chat-dev-config.mjs';

const ref = 'abcdefghijklmnopqrst';
const valid = {
  CHAT_DEV_PROJECT_REF: ref,
  CHAT_DEV_SUPABASE_URL: `https://${ref}.supabase.co`,
  CHAT_DEV_PUBLISHABLE_KEY: 'test-public-key',
  CHAT_DEV_SERVICE_ROLE_KEY: 'test-server-key',
  CHAT_DEV_ALLOW_FIXTURES: ref,
};

describe('chat cloud acceptance safety gate', () => {
  it('requires all configuration before any network or fixture creation', () => {
    for (const name of Object.keys(valid)) {
      expect(() => chatDevConfig({ ...valid, [name]: '' })).toThrow();
    }
  });
  it('accepts only the explicitly acknowledged dev project', () => {
    expect(chatDevConfig(valid).url).toBe(`https://${ref}.supabase.co`);
  });
  it('never permits the known production project', () => {
    const production = 'rbhqkpjvbnuhhfhwrhdo';
    expect(() => chatDevConfig({ ...valid, CHAT_DEV_PROJECT_REF: production,
      CHAT_DEV_ALLOW_FIXTURES: production, CHAT_DEV_SUPABASE_URL: `https://${production}.supabase.co` })).toThrow();
  });
  it('allows explicitly acknowledged loopback local Supabase only on its fixed API port', () => {
    const local = { ...valid, CHAT_DEV_PROJECT_REF: 'shop-base-ai-local', CHAT_DEV_ALLOW_FIXTURES: 'shop-base-ai-local' };
    expect(chatDevConfig({ ...local, CHAT_DEV_SUPABASE_URL: 'http://127.0.0.1:54321' }).url).toBe('http://127.0.0.1:54321');
    for (const url of ['http://127.0.0.1:3000', 'http://192.168.1.1:54321', 'http://localhost:54321.evil.test', 'https://other.supabase.co']) {
      expect(() => chatDevConfig({ ...local, CHAT_DEV_SUPABASE_URL: url })).toThrow();
    }
  });
  it('rejects redirected credentials, foreign hosts and URL ambiguity', () => {
    for (const url of ['http://' + ref + '.supabase.co', `https://${ref}.supabase.co.evil.test`,
      'https://other.supabase.co', `https://name:password@${ref}.supabase.co`,
      `https://${ref}.supabase.co/path`, `https://${ref}.supabase.co?key=secret`, `https://${ref}.supabase.co#fragment`]) {
      expect(() => chatDevConfig({ ...valid, CHAT_DEV_SUPABASE_URL: url })).toThrow();
    }
  });
});
