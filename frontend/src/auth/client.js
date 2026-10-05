import { createClient } from '@supabase/supabase-js';
import { createAuthService } from './service';
import { deviceStorage } from './storage';
import { providerGuard } from './providers';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
let client = null;
let configurationError = null;
try {
  if (!url || !key) throw new Error('missing configuration');
  const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  const storage = deviceStorage(window.localStorage, window.sessionStorage, storageKey);
  // Fail clearly when storage is disabled: OAuth PKCE needs the verifier after redirect.
  storage.setItem('shop-auth-storage-check', '1');
  storage.removeItem('shop-auth-storage-check');
  client = createClient(url, key, {
    auth: {
      flowType: 'pkce',
      storage,
      storageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
} catch {
  configurationError = 'Supabase hoặc bộ nhớ phiên chưa được cấu hình. Không thể đăng nhập.';
}

export { client, configurationError };
export const authService = createAuthService(client, providerGuard(url, key));
