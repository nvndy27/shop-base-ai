export function chatDevConfig(env) {
  const required = ['CHAT_DEV_PROJECT_REF', 'CHAT_DEV_SUPABASE_URL', 'CHAT_DEV_PUBLISHABLE_KEY', 'CHAT_DEV_SERVICE_ROLE_KEY'];
  if (required.some((name) => !env[name])) throw new Error('Thiếu cấu hình CHAT_DEV_*; xem docs/CHAT_DEV_ACCEPTANCE.md.');
  const ref = env.CHAT_DEV_PROJECT_REF;
  const url = new URL(env.CHAT_DEV_SUPABASE_URL);
  const local = ref === 'shop-base-ai-local' && url.protocol === 'http:'
    && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '54321';
  const cloud = /^[a-z]{20}$/.test(ref) && ref !== 'rbhqkpjvbnuhhfhwrhdo'
    && url.protocol === 'https:' && url.hostname === `${ref}.supabase.co` && !url.port;
  if ((!local && !cloud)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || env.CHAT_DEV_ALLOW_FIXTURES !== ref) {
    throw new Error('Chỉ chạy trên Supabase dev riêng hoặc local port 54321, xác nhận bằng CHAT_DEV_ALLOW_FIXTURES=<project-ref>.');
  }
  return { url: url.origin, key: env.CHAT_DEV_PUBLISHABLE_KEY, serviceKey: env.CHAT_DEV_SERVICE_ROLE_KEY };
}
