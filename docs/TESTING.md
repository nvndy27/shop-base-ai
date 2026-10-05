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

Mỗi milestone ghi: lệnh/test thực chạy, môi trường, số pass/fail, blocker, rủi ro còn lại. CHECKED khác IMPLEMENTED; hoàn thành feature chỉ khi tiêu chí đạt hoặc chủ dự án chấp nhận giới hạn cụ thể. Test dự kiến chưa có không được báo pass.
