# Roadmap có giới hạn

M0/M1 đã triển khai **một phần backend**, kiểm thử cục bộ; schema M1 đã áp dụng và kiểm tra quyền SQL trên Supabase. M2 có catalog/search nguồn nối cloud/local; M2/M3 có thêm mã marketplace/COD và kiểm thử cục bộ, chưa áp dụng schema mới cloud hoặc nghiệm thu phiên thật. M4–M7 chưa triển khai; caption chờ sau luồng mua hàng theo yêu cầu chủ dự án.

| Milestone | Phạm vi | Điều kiện hoàn thành |
|---|---|---|
| M0 — nền dự án | Kiểm kê repo, chốt stack, scripts, env placeholders, tokens, layout responsive, fixture riêng | App chạy/build; docs phản ánh đúng stack; không secret hoặc chức năng giả thành công |
| M1 — danh tính và quyền | Google/phone auth adapters, profile/địa chỉ, shop application/membership, admin approval tối thiểu | Login cấu hình thật hoặc blocker rõ; RLS/grants và A/B allow-deny pass |
| M2 — catalog và search | Danh mục, SKU/ảnh/kho, seller form, kiểm duyệt, outbox/indexer, Elastic query | Search tiếng Việt; stale draft/suspended không public; event retry/version pass |
| M3 — giỏ và đơn | Giỏ nhiều shop, quote, transaction order/suborder, reservation/expiry, COD | Không giá từ client; race SKU cuối, idempotency/cancel/release pass |
| M4 — caption | Adapter mô hình người dùng, jobs/quota, draft edit/accept | Asset scope, timeout/schema/output/version test pass; không tự publish |
| M5 — chat | Persistent messages, private realtime, attachment/report/block | Membership/read/write/channel/revocation tests pass; không công khai bucket |
| M6 — payment sandbox | Provider đã chọn, webhook inbox/reconciliation/refund sandbox | Signature/ref/amount, duplicate/late/out-of-order/partial refund pass |
| M7 — hardening trước vận hành | Audit admin, monitoring, backup/restore, secret scan, load/UI tests, review privacy/ops | Bằng chứng đạt TESTING/SECURITY; có phê duyệt riêng trước production và thu tiền thật |

MVP chức năng gồm M0–M6, với tích hợp thật cần đủ cấu hình. M7 là điều kiện vận hành thật. Caption/chat có thể triển khai trước M3 nếu chủ dự án đổi ưu tiên, nhưng không bỏ kiểm quyền.

## Tiến độ backend ngày 01/10/2026

- **M0 một phần:** workspace pnpm, TypeScript strict, Next.js BFF API-only, contracts/domain, env placeholders, scripts và build. Không tạo layout/token/UI vì nằm ngoài nhiệm vụ.
- **M1 một phần:** Auth `getUser` adapter theo bearer JWT; profile/địa chỉ; application pending + owner membership nguyên tử; permission shop; duyệt shop với permission từ DB, AAL2/MFA và audit. Migration, RLS/column grants, API/DB allow-deny đã chạy cục bộ.
- **Schema M1 đã áp dụng:** dự án `rbhqkpjvbnuhhfhwrhdo`, nhánh main hiển thị Production, sau xác nhận riêng của người dùng. Sáu bảng RLS/10 policies, Auth trigger, unique index, column/RPC grants và deny checks anon/subjectless đã kiểm trực tiếp trên Supabase; không tạo user hay fixtures.
- **Chưa nghiệm thu M1:** Google/phone login và PKCE/refresh/logout thực; SMS/provider/quota; allow/deny A/B bằng JWT Auth thật qua PostgREST/API và concurrency nhiều connection. Chưa có API quản lý nhân viên; membership cấp/thu hồi qua đường quản trị DB tin cậy, không self-service.
- **Frontend Auth đã nối mã:** Vite frontend hiện có dùng Supabase SDK, Google PKCE/callback, SMS OTP, sessionStorage/refresh/logout, bearer API và profile/địa chỉ thật. URL env đã sửa; callback `http://localhost:5175/auth/callback` đã lưu và xác minh trên dashboard sau xác nhận riêng ngày 01/10/2026; Google/Phone trên Supabase còn disabled. 57 unit + 34 integration/SDK và hai build pass; chưa login/SMS/A/B thật. Không nâng trạng thái M1 thành hoàn tất; xem `AUTH_INTEGRATION.md`.
- **Tiếp theo:** cấu hình ứng dụng/Auth của môi trường phát triển riêng và xác minh bằng phiên thật; frontend xác nhận chi tiết DTO và cơ chế bearer. Sau đó mới mở backend M2 theo roadmap. Không chạy lại migration M1 trên dự án đã áp dụng.
- **Cập nhật 02/10:** theo yêu cầu chủ dự án, thêm email OTP và Cài đặt liên kết SĐT; điều kiện mua hàng kiểm ở server bằng Auth.getUser + profile active. Chưa tạo account thật hoặc kiểm SMTP/SMS; checkout vẫn chưa có API tạo đơn và không giả lập thành công. M1 chưa hoàn tất, M3 chưa triển khai; xem AUTH_INTEGRATION và D014.
- **Cập nhật tiếp 02/10:** tách Đăng ký/Đăng nhập và chuyển phiên SDK sang localStorage theo yêu cầu nhớ thiết bị (D016), thay cơ chế sessionStorage mô tả trong bàn giao 01/10. Khôi phục/refresh/logout kiểm bằng installed-SDK fixture; chưa nghiệm thu bằng tài khoản thật.
- **Shop trong Tài khoản (D018):** lựa chọn Người dùng/Người bán lúc đăng ký chỉ hướng onboarding; Profile có form shop pending qua RPC cũ và danh sách shop chính chủ qua GET `/me/shops`. Quyền vẫn do server/membership, M1 chưa hoàn tất và dashboard/catalog seller M2 chưa triển khai.
- **Ưu tiên mới 02/10:** chủ dự án chọn catalog/search/cart/order/seller, bắt đầu bằng dataset mạng cho demo. Snapshot DummyJSON và fixture đơn tổng hợp đã chuẩn bị; xem DEMO_COMMERCE_DATA. Chưa seed cloud hoặc triển khai API M2/M3, không đánh dấu hoàn thành từ demo UI.
- **Dataset lớn 02/10 (D024):** đã tải và kiểm chứng cục bộ 20.000 metadata Amazon / năm nhóm, khoảng 29,4 MB. Chưa import database/index hoặc nối frontend; xem AMAZON_CATALOG_DATA.
- **Nhập dataset 02/10 (D025):** Elasticsearch local Docker đã có 20.000 metadata, TLS/auth và search smoke checks. Supabase schema/import SQL đã kiểm cục bộ, chưa apply môi trường đích. Frontend chưa nối search API; M2 chưa hoàn thành. Xem CATALOG_IMPORT_SETUP.
- **Supabase cloud 03/10 (D026):** đã nhập đủ 20.000 metadata / năm nhóm vào catalog_import theo ủy quyền chủ dự án. Verification cloud count/quyền/RLS đạt; bảng kèm index 27 MB, toàn database 38 MB. Frontend/API search chưa nối bộ dữ liệu này; M2 chưa hoàn thành.
- **Catalog/search 03/10 (D027):** đã nối API Next.js + RPC Supabase chỉ đọc + Elasticsearch key chỉ đọc; Home/chi tiết dùng dữ liệu cloud, tìm kiếm/sắp xếp/gợi ý qua Elastic và hydrate từ DB. Kiểm qua backend 3000 và proxy 5175 đạt; 122 tests và hai build đạt. Chưa deploy Vercel, chưa có seller inventory/visibility/outbox; M2/M3 chưa hoàn thành. Xem CATALOG_API.
- **Lọc giá (D028):** API catalog và Elastic chỉ hiển thị 7.803 sản phẩm có giá; tên sản phẩm đã thu nhỏ. Giữ 20.000 bản ghi nguồn; chưa deploy bản mới lên Vercel.
- **Marketplace/COD (D032):** đã viết sản phẩm/SKU/kho, seller APIs, kiểm duyệt, Storage pipeline, giỏ tài khoản, quote/đơn nhiều shop/hủy/expiry và worker Elastic versioned; frontend nối API. Migration 003/004 chưa apply cloud; service file/account thật chưa cấu hình/kiểm. Setup và giới hạn tại COURSE_COMMERCE. M1/M2/M3 vẫn chưa nghiệm thu đầy đủ; không triển khai tiền thật/caption trong lát cắt này.
- **Ngôn ngữ/giá (D033):** thêm lựa chọn Việt/Anh cho catalog, bản dịch tên local và quy đổi giá hiển thị theo tỷ giá hằng ngày; giữ nguyên dữ liệu USD và giá đơn shop. Xem CATALOG_API; không nâng trạng thái M2/M3.
- Báo cáo kiểm tra cụ thể: `BACKEND_VERIFICATION.md`. Không coi build hoặc PostgreSQL nhúng là bằng chứng production-ready.

## Sau MVP, chỉ khi được giao

Voucher nhiều điều kiện, carrier integration, returns/disputes, settlement/payout, dashboard sâu. Chốt chính sách và hợp đồng trước tính năng tiền thật. Không đồng nhất dashboard doanh thu với hệ thống kế toán/escrow.

## Definition of done cho mỗi nhiệm vụ

Thay đổi trong phạm vi; có loading/error/empty thích hợp; server authz/input validation; migration + quyền khi đổi DB; tests bất biến bị tác động; typecheck/build/checks thực chạy; docs quyết định cập nhật; báo phần chưa xác minh. Chưa có credentials thì chỉ hoàn thành phần adapter/contract, không hoàn thành tích hợp thật.
