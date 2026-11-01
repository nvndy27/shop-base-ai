# Nghiệm thu chat trên Supabase dev riêng

## Trạng thái

Đã chuẩn bị runner dùng Auth và PostgREST thật, **chưa chạy cloud** vì chưa có cấu hình dev. Lượt tiếp theo đã mở dashboard bằng trình duyệt tích hợp IDE Orca nhưng chưa có phiên đăng nhập; Chrome của chủ dự án cần bật remote debugging để dùng phiên sẵn có. Không áp dụng migration hoặc tạo fixture trên project production `rbhqkpjvbnuhhfhwrhdo`. Realtime chỉ bắt đầu sau khi chat văn bản đạt nghiệm thu.

## Thiết lập database

Tạo project Supabase dev trống, miễn phí nếu tài khoản còn quota. Nếu cần đăng nhập/xác minh email, chủ dự án thực hiện trực tiếp; không gửi mật khẩu, OTP hoặc secret trong chat. Không đổi cấu hình production để né quota.

Áp dụng từng migration một lần, theo thứ tự tên trong `supabase/migrations/`:

1. `202610010001_identity_and_shops.sql`
2. `202610020001_academic_catalog_import.sql`
3. `202610030001_catalog_read_api.sql`
4. `202610030002_priced_catalog.sql`
5. `202610030003_marketplace_cod.sql`
6. `202610030004_product_image_storage.sql`
7. `202610050001_chat.sql`

Không chạy `supabase/tests/bootstrap.sql` trên Supabase. Không replay migration trên DB đã có schema. Trước khi dùng CLI push cần đối chiếu lịch sử migration với hiện trạng; không tự repair history trên production. Phục hồi an toàn: nếu dev mới bị lỗi, dừng tại migration lỗi, kiểm tra transaction và sửa bằng migration bổ sung; không xóa migration đã áp dụng hoặc reset project có dữ liệu cần giữ.

Trước khi áp dụng, kiểm tra project ref và inventory chỉ đọc trong SQL Editor:

```sql
select to_regclass('supabase_migrations.schema_migrations') as migration_history;
select nspname from pg_namespace
where nspname in ('private', 'catalog_import', 'commerce', 'chat');
```

Nếu bảng history tồn tại, đọc `select version, name from supabase_migrations.schema_migrations order by version;` và đối chiếu với các file trên. Schema tồn tại mà thiếu history không có nghĩa là migration chưa chạy. Dừng để kiểm tra từng object trước khi áp dụng, không replay hoặc tự repair. Migration catalog import 002 không có `BEGIN/COMMIT` trong file; thực thi trong transaction khi công cụ áp dụng không tự bao transaction.

Sau khi áp dụng đủ chuỗi, chạy `supabase/tests/verify_m1_deployment.sql` rồi `supabase/tests/verify_chat_deployment.sql` trên **dev đã xác nhận**. Hai verifier không tạo user/fixture hoặc sửa grants; kiểm RLS, cột riêng, RPC/predicate grants, unique retry và từ chối anon/subjectless. Kết quả không thay thế nghiệm thu A/B bằng JWT thật hoặc lịch sử migration.

Chuỗi 7 migration được kiểm trên database PGlite trống bằng `tests/integration/migration-chain.test.ts`, thuộc `pnpm check`. Storage/Auth ở test là emulation được khai báo riêng; không phải bằng chứng migration đã áp dụng Supabase cloud. Test cũng cố tình cấp quyền đọc `sender_id` và tắt RLS trong database test để xác nhận verifier phát hiện cả hai sai lệch.

## Chạy kiểm tra quyền bằng JWT thật

Copy `.env.chat-dev.example` thành `.env.chat-dev.local` (gitignore đã bỏ qua), cấu hình URL, publishable key và **legacy service_role JWT** riêng của project dev. Không dùng secret key mới dạng `sb_secret_*` thay JWT trong runner này. Đặt `CHAT_DEV_ALLOW_FIXTURES` bằng đúng project ref để xác nhận cho phép tạo dữ liệu thử.

URL project lấy tại hộp Connect; key tại Settings → API Keys, legacy key tại tab legacy nếu còn được bật. Service-role chỉ nằm trong file riêng của runner, không thêm vào frontend. Tham khảo [API keys chính thức](https://supabase.com/docs/guides/getting-started/api-keys).

```bash
node --env-file=.env.chat-dev.local scripts/verify-chat-dev.mjs
```

Runner tạo 5 user Auth và 2 shop mới theo UUID mỗi lượt; admin xác nhận email fixture `example.test`, không gửi email/SMS. Mật khẩu ngẫu nhiên chỉ ở bộ nhớ. Kiểm tra nghiệp vụ dùng access token do Auth thật cấp, **không** dùng service-role để giả buyer/seller. Service-role chỉ thiết lập fixture, thu hồi/khôi phục nhân viên và đóng/mở shop của chính lượt thử.

Các ca: anonymous deny, mở hội thoại idempotent, gửi/retry một hàng, không lộ sender/buyer ID, buyer B/seller B không truy cập A, read cursor, nhân viên bị thu hồi với JWT còn hạn, shop đóng giữ lịch sử nhưng chặn gửi. HTTP lỗi/timeout làm exit code khác 0; không log token, email, mật khẩu hoặc body tin nhắn. Fixture giữ lại, ID in cuối lượt để điều tra; không tự xóa dữ liệu. Chạy lại tạo fixture mới, không đụng shop người dùng đã có.

## Các cổng tiếp theo

1. Runner cloud đạt chưa chứng minh BFF/UI. `apps/web/.env.local`: đặt `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` về dev; giữ `APP_ORIGIN` đúng Origin frontend (mặc định `http://localhost:5175`). `frontend/.env.local`: đặt `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` về cùng dev, **không** đặt service-role. Khởi động lại hai server sau đổi env. Đăng nhập hai tài khoản dev được xác minh qua luồng thực tế; kiểm tra hiển thị lịch sử, unread và gửi qua `/api/v1/chat/*`. Fixture của runner không thay thế nghiệm thu Google/phone login.
2. Kiểm thử đổi hội thoại khi mạng chậm bằng `tests/e2e/chat-race.mjs` (fixture khai báo, **không** phải tích hợp Supabase thật). Đặt `CHAT_E2E_PROJECT_REF` bằng project ref frontend đang dùng để session fixture khớp storage key; không sửa code hoặc dùng JWT thật trong harness mock.
3. Chỉ sau nghiệm thu mới lưu checkpoint Git và triển khai private realtime. Test bắt buộc: channel lạ bị từ chối, client không giả broadcast, nhân viên đã thu hồi không nhận nội dung mới dù JWT còn hạn. Sau đó mới đến attachment/report/block.
