import { AuthUiError } from './service';

const messages = {
  ACCOUNT_INACTIVE: 'Tài khoản đã bị khóa hoặc không hoạt động.',
  PHONE_REQUIRED: 'Vui lòng thêm và xác minh số điện thoại trong Cài đặt trước khi mua hàng.',
  NOT_FOUND: 'Không tìm thấy tài nguyên hoặc bạn không có quyền truy cập.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  VALIDATION_ERROR: 'Dữ liệu không hợp lệ.',
  CONFLICT: 'Dữ liệu đã tồn tại. Vui lòng kiểm tra và chọn thông tin khác.',
  IDENTITY_UNVERIFIED: 'Vui lòng xác minh email hoặc số điện thoại trước khi đăng ký shop.',
  SERVICE_UNAVAILABLE: 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.',
  OUT_OF_STOCK: 'Số lượng vượt tồn kho. Vui lòng cập nhật giỏ hàng.',
  PRICE_CHANGED: 'Giá hoặc giỏ hàng đã thay đổi. Vui lòng lấy báo giá mới.',
  QUOTE_EXPIRED: 'Báo giá đã hết hạn. Vui lòng cập nhật báo giá.',
  PRODUCT_UNAVAILABLE: 'Sản phẩm hiện không thể đặt mua.',
  IDEMPOTENCY_CONFLICT: 'Yêu cầu đã được dùng với nội dung khác. Vui lòng kiểm tra đơn hàng.',
  VERSION_CONFLICT: 'Dữ liệu đã thay đổi. Vui lòng tải lại.',
  INVALID_TRANSITION: 'Không thể chuyển sang trạng thái này.',
};

export function createApi(client, fetcher = fetch) {
  return async (path, { method = 'GET', body, signal } = {}) => {
    if (!/^\/api\/v1\/[A-Za-z0-9/_-]+$/.test(path)) throw new AuthUiError('Endpoint không hợp lệ.');
    if (!client) throw new AuthUiError('Supabase chưa được cấu hình.');
    const { data, error } = await client.auth.getSession();
    if (error || !data.session?.access_token) throw new AuthUiError('Vui lòng đăng nhập lại.');
    const response = await fetcher(path, {
      method,
      credentials: 'omit',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
    if (response.status === 401) {
      // No mutation retry: never duplicate a write while renewing a session.
      await client.auth.signOut({ scope: 'local' });
      throw new AuthUiError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    if (response.status === 204) return null;
    const result = await response.json();
    if (!response.ok) {
      throw new AuthUiError(messages[result.error?.code] || 'Thao tác thất bại. Vui lòng thử lại.');
    }
    return result;
  };
}
