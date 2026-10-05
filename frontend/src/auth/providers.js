import { AuthUiError } from './service';

// Public, read-only Auth settings. Never cache provider secrets or return the raw payload.
export function providerGuard(url, key, fetcher = fetch) {
  return async provider => {
    if (!['google', 'phone', 'email'].includes(provider)) throw new AuthUiError('Provider không được hỗ trợ.');
    if (!url || !key) throw new AuthUiError('Supabase chưa được cấu hình.');
    let enabled = false;
    try {
      const response = await fetcher(new URL('/auth/v1/settings', url).href, {
        headers: { apikey: key },
        credentials: 'omit',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Settings unavailable');
      const data = await response.json();
      enabled = data.external?.[provider] === true;
    } catch {
      throw new AuthUiError('Không kiểm tra được cấu hình đăng nhập. Vui lòng thử lại sau.');
    }
    if (!enabled) throw new AuthUiError(
      provider === 'google'
        ? 'Google chưa được bật trên Supabase. Quản trị viên cần cấu hình Google Client ID/Secret và callback.'
        : provider === 'email'
        ? 'Email chưa được bật trên Supabase. Quản trị viên cần cấu hình gửi mã email.'
        : 'Đăng nhập SĐT chưa được bật trên Supabase. Quản trị viên cần cấu hình SMS provider.',
    );
  };
}
