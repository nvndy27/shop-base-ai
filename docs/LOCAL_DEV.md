# Phát triển và nghiệm thu phần 1–4 trên Supabase local

## Phạm vi

Theo yêu cầu 12/10/2026, dùng Supabase local để nghiệm thu tài khoản email/mật khẩu, marketplace/COD, Storage, Elastic và chat. Không thay project production hoặc dùng fake Auth trong các runner dưới đây. Các test PGlite/SDK fixture vẫn riêng, không thay bằng chứng dịch vụ thật.

Điều kiện COD mới (D038): account active, email hoặc phone được Auth xác nhận, địa chỉ chính chủ có SĐT giao hàng. Không bắt SMS và không ghi SĐT giao hàng thành identity đã xác minh. Supabase local tắt Confirm Email, nên email được **tự xác nhận cho dev**, không chứng minh quyền sở hữu hộp thư. Schema, giá, kho, quyền admin/MFA và RLS vẫn kiểm ở server.

## Khởi động

Yêu cầu Docker đang chạy và user hiện tại truy cập được socket, Node/pnpm theo README. `supabase/config.toml` dùng project local `shop-base-ai-local`; CLI pin 2.120.0 chạy bằng pnpm dlx, không thêm package hoặc đổi lockfile.

```bash
pnpm dev:setup
pnpm dev:local
```

Setup tạo Docker network chỉ bind loopback, khởi động Supabase và áp migration trên DB local mới. Không có lệnh link/push/reset database cloud. Lượt đầu phải tải các images và có thể kéo dài theo mạng. CLI output credential không in ra terminal; khi thất bại log ở `data/local-dev/setup-error.log`, file 0600 và gitignore — không chia sẻ toàn file.

Setup dùng `SUPABASE_USE_SLIM_IMAGES=true` trong môi trường tiến trình để tải image slim **chính thức của Supabase** trên GHCR; registry ECR mặc định đã báo rate limit khi chuẩn bị local. Không thay stack/phiên bản CLI. [Hợp đồng image slim của CLI](https://github.com/supabase/cli/pull/6383). Các lệnh CLI bổ sung cần cùng flag để không trộn family image.

Sau khi health đạt, script ghi URL/public key local cho BFF/Vite, service-role chỉ vào file server/runner riêng. Env đã có được lưu vào `*.before-local` một lần, 0600; không ghi đè bản sao cũ. Khởi động lại các server cũ để dùng cấu hình mới. Không chạy hai server trên cùng port.

- Frontend: http://localhost:5175
- BFF: http://localhost:3000
- Supabase API: http://127.0.0.1:54321
- Supabase Studio: http://127.0.0.1:54323
- Supervisor chạy worker outbox/expiry mỗi phút, không chồng batch. Ctrl+C dừng frontend/BFF/worker, giữ database và Docker services.

Nếu đổi cấu hình Auth local, chạy `node scripts/setup-local-dev.mjs --restart`: dừng/khởi động riêng stack này với backup mặc định, không dùng `--no-backup` hoặc reset. Khi có migration bổ sung sau lần khởi động đầu:

```bash
SUPABASE_USE_SLIM_IMAGES=true pnpm dlx supabase@2.120.0 migration up --local
```

## Nghiệm thu thật

Sau khi Supabase, Elastic và hai server sẵn sàng:

```bash
pnpm dev:verify
```

`verify-local-commerce.mjs` chạy signup/password/Auth getUser/refresh/logout, profile/địa chỉ A/B, ban với JWT còn hạn, metadata/role injection denial, shop application và duyệt bằng MFA TOTP thật, SKU/kho/kiểm duyệt, upload PNG qua BFF rồi đọc WebP từ Storage, direct/cross-shop upload denial, giỏ nhiều shop, total server, COD retry/hủy/hoàn kho, hai request mua SKU cuối đồng thời qua PostgreSQL thật, fulfillment và worker→Elastic→search. Không tự xóa fixture; ID được in để điều tra, mật khẩu/JWT/TOTP secret chỉ trong bộ nhớ.

`verify-chat-dev.mjs` dùng Auth/PostgREST thật: anonymous deny, mở hội thoại idempotent, retry một tin, buyer/seller A/B, unread/read cursor, thu hồi staff với JWT chưa hết hạn và shop đóng giữ lịch sử/chặn gửi. Runner chỉ chấp nhận project dev đã xác nhận hoặc loopback port 54321, từ chối project production đã biết.

Sau khi chat văn bản/JWT thật đạt:

```bash
pnpm dev:realtime
```

Lệnh kiểm bằng chứng text dev còn mới, chuyển SQL đang chuẩn bị từ `supabase/realtime/chat_realtime.sql` thành migration bổ sung `202610120002_chat_realtime.sql`, áp **local**, rồi chạy `verify-chat-realtime-dev.mjs` bằng JWT/WebSocket thật. Chỉ khi kênh lạ bị từ chối, broadcast giả bị chặn và staff đã thu hồi không nhận sự kiện/nội dung mới với cùng JWT đang kết nối mới ghi `CHAT_REALTIME_ENABLED=true` cho frontend. Thất bại giữ flag tắt; nếu migration đã áp dụng phải forward-fix, không xóa/replay.

Realtime chỉ publish bảng ba cột conversation/revision/time để yêu cầu tải lại. Không broadcast body/sender/buyer; mọi nội dung lấy lại qua API/RLS hiện hành. Quyền Broadcast riêng được cache khi join, nên không dùng nó làm kiểm quyền đọc nội dung sau thu hồi; quyền mỗi PostgreSQL change nằm ở RLS của bảng notification.

Kiểm trình duyệt dùng Playwright đã có theo convention `tests/e2e/chat-race.mjs`, không thêm dependency:

```bash
PLAYWRIGHT_MODULE_PATH=<node_modules có playwright>/package.json node --env-file=.env.chat-dev.local tests/e2e/password-local.mjs
```

Password E2E tạo user mới qua giao diện thật; kiểm mật khẩu không khớp, signup, reload/persist, logout, route bảo vệ, sai mật khẩu, login và lỗi network có chủ đích. Không intercept để giả thành công. Browser race fixture cũ là nhóm riêng, không dùng làm bằng chứng Auth hoặc chat realtime thật.

Sau khi bật realtime, chạy cùng `PLAYWRIGHT_MODULE_PATH` và env-file với `tests/e2e/chat-realtime-local.mjs` để kiểm hai browser login thật, hội thoại mới, gửi hai chiều không bấm tải lại và lịch sử sau reload.

## Trạng thái bằng chứng

Đã đạt kiểm tra cục bộ cho migration COD mới, server eligibility và các script/contract liên quan. Nghiệm thu dịch vụ thật còn chờ Supabase local khởi động thành công; không đánh dấu phần 1–4 hoặc M1/M2/M3/M5 hoàn tất khi chưa chạy và ghi lại kết quả. Chat realtime chỉ bật sau nghiệm thu text/JWT; attachment/report/block là phạm vi sau.

## Khôi phục cấu hình

Muốn trở lại env cũ, chủ động phục hồi từng `apps/web/.env.local.before-local`/`frontend/.env.local.before-local` nếu file tồn tại rồi restart server; không copy service-role vào frontend. Dừng Supabase bằng `pnpm dlx supabase@2.120.0 stop` để giữ backup local. Không xóa volume, migration hoặc fixture để che lỗi.
