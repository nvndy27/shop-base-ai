import { AuthUiError } from './service';

export function hasAuthReturn(search, hash) {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  return ['code', 'error', 'error_code', 'access_token', 'refresh_token'].some(key => query.has(key) || fragment.has(key));
}

export function parseAuthReturn(search, hash) {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const invalid = () => { throw new AuthUiError('Liên kết xác nhận không hợp lệ hoặc đã hết hạn. Hãy mở Đăng nhập để yêu cầu liên kết mới.'); };
  if (search.length + hash.length > 24000 || query.has('error') || query.has('error_code') || fragment.has('error') || fragment.has('error_code')) invalid();
  if (query.has('access_token') || query.has('refresh_token')) invalid();
  if (query.has('code')) {
    const code = query.get('code');
    if (query.getAll('code').length !== 1 || !code || code.length > 4096 || hash) invalid();
    return { kind: 'pkce', code };
  }
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  if (!accessToken || !refreshToken || accessToken.length > 16384 || refreshToken.length > 4096 ||
      fragment.getAll('access_token').length !== 1 || fragment.getAll('refresh_token').length !== 1 ||
      fragment.get('token_type') !== 'bearer' || !['signup', 'magiclink'].includes(fragment.get('type'))) invalid();
  return { kind: 'email-link', accessToken, refreshToken };
}
