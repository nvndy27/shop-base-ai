# React + Vite

## Xem thử giao diện tài khoản (chỉ ở dev)

Mở `http://localhost:5175/demo/cart`, `/demo/orders` hoặc `/demo/profile`, hoặc vào **Cài đặt → Kiểm tra giao diện bằng dữ liệu mẫu**. Hồ sơ `Người dùng thử` và email `demo@shopbase.invalid` là dữ liệu mẫu, không phải tài khoản Supabase và không có mật khẩu/phiên đăng nhập. Không gọi API hồ sơ, gửi email/SMS hoặc tạo đơn hàng. Các thao tác thanh toán và quản lý tài khoản được tắt trong bản demo; số lượng/xóa sản phẩm chỉ thay đổi dữ liệu trong bộ nhớ.

Các route `/cart`, `/orders`, `/profile` vẫn yêu cầu phiên Auth thật; `/profile` vẫn đọc API thật. Route `/demo/*` chỉ được đăng ký khi `import.meta.env.DEV` là true và không được mở trong build production. Nếu cần tài khoản Auth thật, cấu hình môi trường Supabase dev riêng và dùng luồng đăng nhập hiện có.

## ShopBase — Auth thật

Đăng ký/đăng nhập email OTP (Gmail), Google/phone dùng Supabase SDK; `/profile` dùng API thật. `/settings` quản lý SĐT, liên kết bằng SMS xác minh trên cùng tài khoản. `/checkout` kiểm điều kiện SĐT ở server, chưa hỗ trợ đặt hàng thật. Cấu hình email template/SMTP và giới hạn: [AUTH_INTEGRATION](../docs/AUTH_INTEGRATION.md).

Chạy **hai terminal**, từ gốc dự án:

```bash
# Backend API, port 3000
npx --yes pnpm@12.8.1 dev
```

```bash
# Frontend riêng, port 5175 (strict, không tự nhảy port)
cd frontend
npx --yes pnpm@12.8.1 --ignore-workspace install --frozen-lockfile --ignore-scripts
npx --yes pnpm@12.8.1 --ignore-workspace dev
```

Vite đọc URL/publishable key từ `apps/web/.env.local` ở server và chỉ xuất cặp public vào bundle. Có thể override bằng `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` trong frontend env; không dùng secret/service-role. URL phải là endpoint gốc `https://<project-ref>.supabase.co`, **không** URL dashboard hoặc `/rest/v1`.

Mở `/auth`; email OTP cần mẫu email có `{{ .Token }}` (file `supabase/templates/email-otp.html`) và SMTP cho email ngoài team. Google cần provider/callback; thêm SĐT tại `/settings` cần SMS provider. Provider chưa bật sẽ báo lỗi, không đăng nhập giả. Không gửi credential hoặc OTP vào chat.

`npm run build` / `npm run lint` chỉ chạy scripts đã có, không phải `npm install`. Frontend giữ lockfile riêng. Preview/production cần reverse proxy `/api/v1` cùng origin; dev proxy chỉ tồn tại khi `vite dev` chạy. Test Auth/SDK chạy bằng `pnpm test` và `pnpm test:integration` từ gốc.

---

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
