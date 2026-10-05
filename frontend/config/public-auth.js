// Only these two values may cross the server/browser boundary.
export function publicAuthConfig(env) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!url && !key) return { url: '', key: '' };
  let validUrl = false;
  try {
    const parsed = new URL(url);
    validUrl = !parsed.username && !parsed.password && !parsed.search && !parsed.hash &&
      parsed.pathname === '/' && (parsed.protocol === 'https:' ||
        (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)));
  } catch { /* Invalid public configuration must fail closed. */ }
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  try {
    if (key.split('.').length === 3) {
      publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon';
    }
  } catch { publicKey = false; }
  if (!validUrl || !publicKey) {
    throw new Error('Supabase requires a valid URL and publishable/anon key. Secret keys are forbidden.');
  }
  return { url, key };
}

export function proxyOrigin(value) {
  try {
    const parsed = new URL(value);
    if (parsed.origin === value && (parsed.protocol === 'https:' ||
      (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)))) {
      return value;
    }
  } catch { /* Return a fixed local default, never an arbitrary header. */ }
  return 'http://localhost:3000';
}
