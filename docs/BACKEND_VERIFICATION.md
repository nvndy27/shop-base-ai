# Bàn giao backend M0/M1 — 01/10/2026

**Cập nhật Auth frontend cùng ngày:** mã Google/OTP/callback/refresh/logout đã nối trên frontend Vite có sẵn; profile/địa chỉ dùng bearer API thật. URL env đã sửa sau approval và Auth settings HTTP 200; callback `http://localhost:5175/auth/callback` đã lưu sau xác nhận riêng và dashboard hiển thị Total URLs: 1; Google/Phone còn disabled. Kiểm tra hiện tại: typecheck, 57 unit + 34 integration, frontend/backend build pass; local API/proxy 401 và Origin deny 403 pass. Các bảng kiểm tra 24+29 bên dưới là bằng chứng lần backend bàn giao trước đó, không phải số tổng hiện tại. Chưa có E2E real sessions; xem `AUTH_INTEGRATION.md`.

## Phạm vi và thay đổi

- Repository ban đầu chỉ có Markdown; đã bootstrap modular Next.js BFF **API-only**, TypeScript strict, pnpm lockfile. Không thay đổi giao diện.
- `packages/contracts`: schema strict và DTO cho M1; `packages/domain`: lỗi ứng dụng và permission theo membership.
- `apps/web/src/server`: env validation, bearer/Auth getUser adapter, user-scoped Supabase repository, identity service, HTTP validation/error envelope.
- Migration `202610010001_identity_and_shops.sql`: profiles/user_roles/addresses/shops/shop_members và audit private; constraints/index, RLS, column grants, RPC transaction, actor từ auth.uid.
- `supabase/tests/bootstrap.sql` chỉ tạo Auth/roles giả trong test. Migration thật vẫn được chạy nguyên văn bằng engine PostgreSQL nhúng; test không dùng service-role để kết luận quyền người dùng.

## Kiểm tra đã chạy

Môi trường cục bộ: Node 22.22.1, pnpm 12.8.1, Vitest 5.0.3; database PostgreSQL nhúng PGlite 0.5.8. Kiểm tra Supabase thật riêng được ghi bên dưới, không đánh đồng với transport mock.

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | Pass TypeScript strict |
| `pnpm test` | 24/24 unit pass |
| `pnpm test:integration` | 29/29 SQL + HTTP + deployment verifier regression pass |
| `pnpm build` | Pass Next.js production build API-only |
| `pnpm check` | Pass toàn bộ chuỗi typecheck → unit → integration → build |

pnpm tạm cài trong `/tmp` vì máy ban đầu không có pnpm và Corepack cũ chưa nhận entrypoint mới; scripts thực tế trong package.json đã được gọi, không dùng lệnh kiểm tra giả.

Đã rà lại pattern JWT/service-secret/AWS key/private key trong 38 file source/docs: không có hit; không có file UI `.tsx`. Checksum source migration đã áp dụng không đổi. Đây là scan nhẹ trong phạm vi phiên, không thay full secret/dependency audit. Không đọc `.env` thật.

### Bằng chứng quyền

- Anon không đọc bảng riêng hoặc gọi mutation RPC/helper.
- Buyer A được đọc/sửa hồ sơ A; B không đọc/sửa A; INSERT/DELETE hồ sơ và UPDATE cột role/status/user_id bị chặn.
- Address own CRUD qua RPC; B không đọc/update/delete A; ID không tồn tại và ID ngoài owner có cùng hành vi.
- Test tạm grant DML trong database test để xác minh **RLS tự nó** cho own INSERT/UPDATE/DELETE và chặn đổi user_id/ghi tài nguyên người khác; cuối test revoke lại. Đây không phải grant trong migration.
- JSON mass assignment owner/user_id/status/role bị chặn ở contract; address RPC cũng reject keys/types lạ nếu gọi SQL trực tiếp.
- Owner shop A không thấy shop B; permission shop kiểm trạng thái và active membership; catalog staff không có quyền đơn; staff revoked mất scope ngay. Suspension chặn catalog/kho nhưng giữ scope đơn hiện hữu.
- Shop application kiểm confirmation timestamp từ Auth, không metadata; tạo pending + owner membership trong một transaction.
- Moderator thiếu MFA, seller, finance đều không duyệt shop. Moderator AAL2 + permission từ DB mới được duyệt; không tự duyệt; audit và trạng thái commit cùng nhau. Audit permission tách moderation.
- Ban profile chặn request/RPC sau đó với cùng JWT subject, không chờ JWT hết hạn.
- Default address chỉ có một; lỗi validation rollback việc bỏ default cũ.
- RLS bật trên toàn bộ sáu bảng; nội bộ không được EXECUTE mutation helper; mọi SECURITY DEFINER có search_path cố định.
- SDK adapter tests xác minh Auth endpoint, bearer/user-scoped header và filter theo actor; invalid token không tạo session, metadata không cấp verification/role.
- HTTP test body cap, JSON/content-type, Origin, cookie không được nhận làm phiên, lỗi provider không rò stack/token/PII.

## Chưa xác minh / blocker

- Migration đã áp dụng và verifier SQL role thật pass trên Supabase được chỉ định. Cấu hình backend URL/publishable key và Auth/PostgREST bằng real sessions chưa xác minh. PGlite dựng Auth schema/JWT claims trong fixture; SDK adapter test dùng transport giả, không chứng minh login provider hoạt động.
- Google OAuth callback/PKCE, phone SMS provider/rate limit/CAPTCHA/quota, refresh/logout/revocation và frontend session lifecycle chưa tích hợp. Không gửi SMS/email thật.
- Chưa có asset pipeline/avatar, quản lý membership API hoặc user-ban admin endpoint. Ban/revoke được test qua thao tác quản trị DB tin cậy, không phải endpoint chưa tồn tại.
- PostgreSQL nhúng serialize connection; không coi test default-address là chứng minh race đa connection. Checkout/kho/idempotency/order/chat/payment chưa triển khai và chưa kiểm thử.
- Chưa có monitoring, production quotas, backup/restore, full dependency/secret audit, CI/deploy; không production-ready.
- `.git` chưa là repository hợp lệ nên không có git diff/commit. Không init/push/merge.

## Handoff và bước tiếp

1. Frontend review schema M1/DTO ở API.md và contracts, phối hợp bearer SDK login. Nếu chọn session cookie, đề xuất contract/CSRF trước khi đổi.
2. Cấu hình Supabase dev riêng bằng environment, không gửi secret qua chat. Schema dự án được chỉ định đã có M1, không replay migration; đồng bộ CLI history trước khi dùng CLI. `private` không được exposed trong PostgREST.
3. Provision moderator permission có audit qua quy trình quản trị tin cậy, enroll MFA. Không cấp role bằng metadata hoặc public client SQL.
4. Chạy allow/deny bằng token Auth thật trên Supabase dev, kiểm Auth trigger/grants/RPC/gateway AAL2 và concurrency nhiều connection; hoàn tất M1 trước backend M2.
5. Không tự triển khai production, thanh toán, model hoặc các milestone tiếp theo.

## Kiểm kê Supabase được người dùng chỉ định — 01/10/2026

- Đã truy cập dashboard dự án `rbhqkpjvbnuhhfhwrhdo` (`shopbase`) và chạy SELECT chỉ đọc qua SQL Editor.
- Kết quả tại thời điểm kiểm tra: không có bảng ứng dụng ở public/private; auth.users có 0 bản ghi; private schema chưa tồn tại.
- Dashboard hiển thị nhánh `main` với nhãn `Production`. Tại thời điểm preflight chưa áp dụng migration, chưa sửa quyền cloud, chưa tạo user hoặc dữ liệu thử.
- Đã chạy lại `pnpm test:integration`: 28/28 pass cục bộ. Migration dự kiến áp dụng là `202610010001_identity_and_shops.sql`; SHA-256 `82b9ab01bd4468b2852f27a39310a02903921a5d39f0dec6182b70ed05a4546f`.
- Sau preflight đã yêu cầu xác nhận ngay trước khi áp dụng vì migration tạo bảng, RLS/GRANT/REVOKE, RPC và trigger trên dự án cloud. Người dùng đã xác nhận; kết quả áp dụng bên dưới.

## Áp dụng và kiểm tra Supabase thật — 01/10/2026

- Đúng dự án `rbhqkpjvbnuhhfhwrhdo`, nhánh main, sau xác nhận riêng của người dùng. Recheck: không bảng ứng dụng, 0 user Auth, không RPC/trigger collision; Supabase CLI migration ledger chưa tồn tại.
- Editor SQL checksum trùng source migration nêu trên. Run transaction nguyên văn; dashboard trả **Success. No rows returned**.
- Tạo 5 bảng public (profiles, user_roles, addresses, shops, shop_members) và private.audit_logs. Cả 6 bật RLS; policies lần lượt 2/1/4/1/1/1, tổng 10.
- Verifier `supabase/tests/verify_m1_deployment.sql` đã chạy trên Supabase và trả 6 dòng PASS. Kiểm cấu trúc, unique partial index default address, Auth trigger, fixed search_path, column/helper/RPC grants.
- Probe bằng role anon: không đọc profiles hoặc gọi create_address. Role authenticated không JWT subject: không đọc profiles/addresses/shops; create_address bị chặn; không EXECUTE helper mutation private. Không dùng service-role thay bằng chứng user policy.
- Probes trong transaction rollback; không tạo fixture, user giả, thay đổi dữ liệu ứng dụng hoặc cấp permission quản trị.
- SQL snippets đã lưu riêng (ID ở D011). Bằng chứng UI tại `/tmp/shop-base-ai-supabase-m1-verified.png`; không có credential/PII trong ảnh.
- Chưa ghi Supabase CLI migration history; khi dùng CLI cần reconcile/repair theo hiện trạng trước, không replay CREATE TABLE hoặc chỉnh migration đã áp dụng.
- **Giới hạn:** role SQL không tương đương phiên Auth ký thật. Chưa A/B allow-deny qua gateway, đăng ký/login thật, AAL2 token/provider, cache/schema exposure PostgREST hoặc concurrency nhiều connection. M1 vẫn chưa nghiệm thu toàn bộ; M2–M7 không triển khai trong phiên này.
