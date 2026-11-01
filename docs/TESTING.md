> Phạm vi cập nhật 29/10/2026: [REQUIREMENTS](REQUIREMENTS.md) là chuẩn nghiệm thu hiện hành; [ROADMAP](ROADMAP.md) quy định mốc C0–C6. Tài liệu bên dưới mô tả thiết kế/mã marketplace trước khi đổi phạm vi, chưa phải đặc tả triển khai module nội bộ. Caption AI ngoài phạm vi. Các bảo vệ dữ liệu, quyền và bí mật hiện có vẫn phải giữ; cập nhật chi tiết phần liên quan trong từng mốc.

# Kiểm thử và nghiệm thu

Đã có test cho lát cắt backend M1; kết quả/môi trường/giới hạn ở `BACKEND_VERIFICATION.md`. Catalog nguồn có checks tại CATALOG_API; marketplace/COD có 141 test chung đạt và kiểm decoder/worker/seed tại COURSE_COMMERCE. E2E cloud, race PostgreSQL nhiều connection và các ca chat/payment/caption dưới đây vẫn là yêu cầu nghiệm thu, chưa phải test đã pass.

## Nguyên tắc

Test ưu tiên bất biến, quyền và side effect. UI screenshot không chứng minh database an toàn. RLS chạy với anon, buyer A/B, seller A/B, staff bị thu hồi, moderator/finance; không dùng service-role cho mọi test rồi kết luận user policy đúng.

| Nhóm | Ca bắt buộc | Kết quả |
|---|---|---|
| Auth | Google và phone OTP, token sai/hết hạn, ban khi JWT còn hạn | Không đăng nhập giả, hành động bị từ chối đúng |
| Identity | Liên kết/đổi số không xác minh, role qua metadata | Không chiếm/gộp account hoặc nâng quyền |
| RLS | SELECT/INSERT/UPDATE/DELETE bảng riêng, RPC/storage/view | Chỉ chủ thể được phép; grant trực tiếp cũng không bypass |
| Shop | Seller A đổi shop_id/owner/status, đọc đơn B | Từ chối, không side effect |
| Search | Dấu/không dấu, typo, filter/sort, draft/suspended stale | Kết quả công khai đúng; không PII |
| Indexer | Event cũ sau mới, retry, delete, full reindex | Không phục hồi sản phẩm bị ẩn, không mất update |
| Checkout | Sửa giá/phí/voucher/quantity, quote cũ | Server tính lại; PRICE_CHANGED/validation |
| Concurrency | Hai user mua SKU còn 1 đồng thời | Tối đa một reservation thành công, không stock âm |
| Idempotency | Retry order cùng key; cùng key khác body | Một order, khác body conflict |
| Payments | Chữ ký sai, amount sai, duplicate, out-of-order/late | Không paid giả, không thu/giao/refund trùng |
| Refund | Hai request cạnh tranh, partial vượt paid | Tổng refund <= paid, ledger nhất quán |
| Kho | Release/cancel/shipped worker chạy lại | Reserved/on_hand biến đổi đúng một lần |
| Chat | Đổi conversation ID, giả sender, channel lạ, staff revoked | Không đọc/gửi/sự kiện mới trái quyền |
| Attachment | Link asset shop khác, signed URL expired, private access | Từ chối, bucket không public |
| XSS/upload | Script/HTML/SVG, MIME giả, file/pixel quá lớn | Không script execute, quarantine/reject |
| Caption | Timeout, output malformed, injection, owner khác, job cũ | Fail rõ ràng; không publish; draft mới không bị ghi đè |
| Abuse | OTP/chat/search/caption vượt quota | 429/limit, side effect và chi phí bị giới hạn |
| Privacy | Logs/index/export/deletion | Không PII/secret rò; xóa/retain theo policy |

## E2E MVP

Buyer login → search → chọn variant → giỏ hai shop → quote → đặt COD/sandbox → xem đơn. Seller A thấy chỉ đơn A, xác nhận theo transition. Buyer chat A; buyer B không truy cập được. Seller tạo draft từ ảnh, caption thất bại vẫn soạn tay, thành công phải duyệt; admin duyệt rồi sản phẩm mới public.

Payment test dùng sandbox và fixture chữ ký hợp lệ theo provider; mock không đủ để đánh dấu tích hợp provider hoàn thành. Model test gồm adapter fake cho lỗi và một smoke test API thật nếu đã cấu hình; fake không chứng minh model chất lượng.

## UI và vận hành

Keyboard, focus/modal, contrast, screen-reader smoke, zoom 200%, viewport 360/768/1280, loading/empty/error, retry không mất input. Đo tải với dataset và concurrency ghi rõ; không gọi chỉ tiêu performance đạt khi chạy vài request thủ công.

Rebuild Elastic/swap alias, worker crash và retry, webhook inbox restart, restore DB/bucket, rotation secret, staging deployment và rollback migration forward-fix. Không chạy test phá hủy trên production.

## Báo cáo kiểm tra

Chat cloud có runner JWT thật và quy trình dev riêng tại [CHAT_DEV_ACCEPTANCE](CHAT_DEV_ACCEPTANCE.md). Runner chưa chạy khi thiếu cấu hình; test guard cục bộ không chứng minh cloud đã đạt.

Mỗi milestone ghi: lệnh/test thực chạy, môi trường, số pass/fail, blocker, rủi ro còn lại. CHECKED khác IMPLEMENTED; hoàn thành feature chỉ khi tiêu chí đạt hoặc chủ dự án chấp nhận giới hạn cụ thể. Test dự kiến chưa có không được báo pass.


## Kết quả sales C0/C1 — 29/10/2026

Test khai báo fixture sales riêng ở `tests/integration/sales.test.ts`, PGlite 0.5.8 với bootstrap Auth/roles mô phỏng, không phải Supabase thật. Không sử dụng test marketplace làm bằng chứng sales.

| Ca | Bằng chứng hiện có | Còn thiếu |
|---|---|---|
| KT01 | SKU trim/uppercase, trùng, giữ mã chính nó và inactive không tái sử dụng | Auth/PostgREST thật |
| KT02 | mã sai/độ dài; UNIQUE bốn nhóm; hai Promise tạo cùng code/SKU/phone chỉ một row | PostgreSQL nhiều connection đồng thời chưa chạy |
| KT03 | chuẩn +84, trùng hai dạng, cập nhật giữ phone thành công | Supabase thật |
| KT04 | chữ/số thiếu/quốc gia sai bị từ chối | Supabase thật |
| KT05 | NFC/khoảng trắng, tên rỗng, email sai/null và giữ local part | Supabase thật |
| KT06 | giá âm/lẻ/vượt trần/chuỗi bị chặn trước numeric coercion; không có row BAD; quantity schema chặn 0/-1/1.5 | lưu đơn và rollback nhiều dòng thuộc C3–C4 chưa kiểm |
| KT21 nền | category đang được product tham chiếu không xóa được; kho chưa tham chiếu xóa được | FK khách/sản phẩm/kho → đơn, inventory/ledger và xóa nháp chờ C2–C4 |
| KT22 nền | ngừng trạng thái và chặn gán category inactive | xác nhận đơn inactive; kho có tồn/đơn và thao tác kho chờ C2–C4 |

Allow/deny SQL: manager CRUD; sales/warehouse đọc; nhóm ghi ngoài quyền bị chặn qua RPC; direct DML không được cấp; staff inactive không đọc qua RLS/RPC; anon không EXECUTE. HTTP kiểm bốn nhóm danh sách/phân trang, validation, 401 và 503. Không chứng minh toàn bộ JWT/Auth cloud bằng dependency injection. Bảng staff không có API tự cấp quyền.

Hai Promise PGlite là mức đồng thời phía caller=2 nhưng DB một connection xử lý tuần tự, không phải bằng chứng khóa/UNIQUE giữa nhiều connection PostgreSQL. Docker socket trả permission denied cả khi thử ngoài sandbox; không có psql/initdb trong PATH. Chưa apply migration vào Supabase/local container; cần môi trường dev PostgreSQL được truy cập để nghiệm thu còn lại. Không reset database hoặc dùng production thay thế.

Lệnh: `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build`. Bằng chứng kết quả cuối được ghi trong DECISIONS D040. Migration-chain test áp dụng migration mới vào DB nhúng trống cùng chuỗi cũ. KT07–KT28 ngoài phần nêu trên chưa nghiệm thu; không đánh dấu C1 hoàn thành cho tới khi đủ bằng chứng bắt buộc.

Bổ sung: manager CRUD/detail/pagination/active/delete cho từng nhóm; sales có thể ghi customers; anon deny mọi operation của bốn nhóm; direct INSERT/UPDATE/DELETE và tự cấp staff bị từ chối. Test sales cuối gồm 8 ca; 154 unit, backend build và typecheck đạt.

Kết quả chạy cuối: `pnpm typecheck` đạt; `pnpm test` 154/154 đạt; `pnpm test:integration` 84/84 đạt (11 file, 8 ca sales); `pnpm build` đạt. `git diff --check` đạt; SHA-256 nguồn requirements giữ đúng baseline. Không phát hiện secret trong phần mã mới khi rà diff; các thay đổi có sẵn không bị ghi đè.
