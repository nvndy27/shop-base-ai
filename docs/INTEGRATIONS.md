# Tích hợp dịch vụ

Trạng thái ngày 01/10/2026: đã có backend Supabase adapter M1 tại `apps/web/src/server/adapters/supabase.ts`, xác minh bearer bằng `getUser` và query/RPC theo JWT người dùng. Schema M1 đã áp dụng lên Supabase được chỉ định; SQL roles/grants/deny checks thật đã kiểm tra. Google/phone flow, JWT/PostgREST của ứng dụng và frontend session lifecycle chưa nghiệm thu. Không có adapter Elastic/caption/payment chạy thật ở lát cắt này. Xem `BACKEND_VERIFICATION.md`; không coi transport giả trong unit test là tích hợp provider hoàn thành.

## Supabase

Frontend hiện có đã nối Google PKCE/callback, phone OTP, SDK sessionStorage/refresh/logout và bearer relative API (dev proxy). Callback `http://localhost:5175/auth/callback` đã lưu vào allowlist sau xác nhận riêng ngày 01/10/2026 và xác minh trên dashboard; provider Google/Phone vẫn disabled. Không giả lập thành công hoặc dùng secret browser. Cấu hình/chạy/kiểm chứng và phần chưa nghiệm thu: `AUTH_INTEGRATION.md`; quyết định storage JS-readable, không HttpOnly: D012.

Auth Google OAuth với redirect allowlist chính xác, PKCE theo SDK; không open redirect từ query string. Phone OTP cấu hình SMS provider, chuẩn E.164, cooldown/rate limit theo IP và định danh, CAPTCHA khi nguy cơ abuse. Kiểm tra token ở server bằng cơ chế được SDK hỗ trợ; không chỉ decode JWT hoặc tin user_id gửi lên.

Khi dùng cookie: cấu hình Secure/SameSite phù hợp, chống CSRF cho mutation. Không giả định mọi cookie SDK đều HttpOnly; nếu cần HttpOnly hoàn toàn thì chọn session qua BFF và kiểm tra tương thích refresh/realtime. Không copy token sang localStorage vì tiện. Đổi số/quyền và khóa user cần kiểm trạng thái DB ở endpoint nhạy cảm vì JWT đã phát có thể còn hiệu lực.

Storage tách public-product-images đã xử lý và private-chat/private-shop-documents. Upload vào quarantine/private trước, kiểm quyền và xử lý ảnh, rồi mới publish. Signed URL thời gian ngắn; file riêng không đưa vào public bucket.

Chat persistent table `messages` có policy riêng. Broadcast/Presence dùng private channel và RLS trên `realtime.messages`; bảng realtime này không thay nơi lưu lịch sử. Tắt public channel cho dữ liệu riêng, nhận sự kiện từ server sau khi insert đã xác minh. Kiểm và ngắt/rejoin khi membership bị thu hồi, token hết hạn; không giả định policy join tự thu hồi mọi kết nối cũ ngay.

## Elasticsearch

Cập nhật 03/10/2026: adapter local đã chạy thật với API key chỉ đọc, CA/TLS và truy vấn giới hạn; API search/suggestions hydrate metadata từ Supabase trước khi trả. Home/chi tiết đã nối API. Hướng dẫn và kiểm chứng tại [CATALOG_API](CATALOG_API.md). Các yêu cầu outbox/visibility bên dưới vẫn là phần cần triển khai cho catalog bán hàng của người bán.

Browser → API search → Elasticsearch bằng read key scope đúng index. Indexer dùng write key riêng; TLS, không expose cluster/admin API. Không nhận raw query DSL từ client. Schema filter allowlist, page size và thời gian query giới hạn; dùng cursor/search_after khi cần sâu, không mở wildcard/regex nặng tùy ý.

Document chỉ gồm product_id/shop_id/category, title/description công khai, tag, giá min/max tham khảo, rating đã tính, thumbnail đã duyệt, status/version. Không index email, phone, địa chỉ, chat, order, payment hoặc shop document riêng.

Tiếng Việt: field giữ dấu và field folded, multi-field keyword cho sort/filter, boost title hơn description, synonym đã duyệt và giới hạn fuzzy. Không mặc định plugin phân tích tiếng Việt có sẵn; nếu cần phải chốt hỗ trợ hosting/version. Kiểm bằng tập query có dấu/không dấu, lỗi gõ, tên thương hiệu và từ nhiều âm tiết.

DB transaction tạo outbox. Worker claim bằng lease, upsert theo entity version, retry exponential backoff có jitter và giới hạn, dead-letter sau ngưỡng. At-least-once delivery, indexer idempotent; event cũ không ghi đè phiên bản mới. Tombstone/xóa khi archive hoặc shop suspended; shop change phải phát lại sản phẩm liên quan. Full rebuild vào index mới, kiểm tra rồi swap alias; không xóa index đang live trước.

Search API đối chiếu tập ID kết quả với trạng thái public trong DB trước trả; refill/pagination phải tính việc loại ID stale. Price/stock checkout luôn lấy DB. Elastic down: fallback search PostgreSQL đơn giản với cùng visibility, trả metadata cho frontend nếu cần; không giả là relevance giống Elastic.

## Mô hình caption từ ảnh

Không thay mô hình người dùng bằng provider khác khi chưa yêu cầu. Thiếu API/weights thì định nghĩa adapter và contract, giữ tính năng chưa cấu hình. Nếu có weights nội bộ, chạy inference tách web; không tự huấn luyện lại.

Luồng: người bán upload ảnh → validate/sanitize → xác nhận asset thuộc shop → job queued → worker gửi ảnh/metadata tối thiểu → validate output → bản nháp → seller sửa/chấp nhận → lưu phiên bản → gửi kiểm duyệt sản phẩm.

Contract nội bộ đề xuất (adapter chuyển đổi sang API thật):

```json
{
  "job_id": "uuid",
  "asset_ids": ["uuid"],
  "language": "vi",
  "verified_attributes": {"category": "...", "material": "..."},
  "style": "concise"
}
```

Response: job_id, model_version, title_suggestion, caption, suggested_tags, warnings; field tùy chọn rõ ràng. Không invent confidence nếu model không cung cấp/không hiệu chuẩn. Caption gợi ý “màu/be” từ ảnh có thể không chính xác, thuộc tính kỹ thuật phải seller xác nhận.

Chỉ backend tạo signed URL tới asset được phép hoặc gửi bytes; không cho model/backend fetch URL tùy ý do client đưa để tránh SSRF. Model không có quyền gọi tool, sửa đơn hoặc publish. Chữ trong ảnh/OCR là dữ liệu, không là instruction. Giới hạn output, lọc HTML/link, kiểm nội dung cấm và không bịa thương hiệu/chứng nhận/công dụng.

Đề xuất ban đầu: tối đa 5 ảnh/job, 10 MB/ảnh và giới hạn pixel, timeout inference 60s có thể điều chỉnh; quota shop/user theo ngân sách. Idempotency/hash input tránh tốn inference khi retry. Job cancelled/asset thay đổi không overwrite draft mới. Model lỗi: seller vẫn soạn tay; không cản đăng sản phẩm thủ công.

Không gửi ảnh chat hoặc PII vào model. Chốt quyền lưu ảnh, retention và có dùng dữ liệu train không; mặc định không dùng để train. Ghi model version và người chấp nhận để truy vết, không log bytes/signed URL.

## Thanh toán và giao vận

MVP COD + sandbox. Nhà cung cấp online chưa chọn; adapter cần createPayment/queryPayment/verifyWebhook/refund. Chọn theo hỗ trợ thị trường, hợp đồng và khả năng marketplace settlement; không coi Stripe là lựa chọn đã chốt. Hợp đồng webhook theo provider thực, không copy thuật toán chữ ký giữa các provider.

Webhook xác minh chữ ký trên raw body, timestamp/replay theo provider; kiểm order/reference/amount/currency, dedupe event, lưu inbox bền vững trước ACK. Callback/return URL chỉ hiển thị trạng thái; không đánh dấu paid từ client. Reconciliation định kỳ xử lý webhook lỡ/trễ hoặc sai thứ tự. Refund/chi trả có idempotency riêng, trạng thái rõ ràng và audit.

Không giữ dữ liệu thẻ; dùng hosted checkout/tokenization của provider. Không tự giữ tiền người bán bằng ví nội bộ; production settlement/payout chỉ triển khai sau khi hợp đồng, đối soát, khiếu nại và quyền finance được chốt. MVP shipping fee theo cấu hình có nhãn; tracking thủ công không giả là API hãng vận chuyển.

## Nhóm biến môi trường dự kiến

Public: SUPABASE_URL/publishable key theo framework. Server: Supabase secret nếu thực sự cần, ELASTIC_URL/SEARCH_API_KEY/INDEX_API_KEY, CAPTION_API_URL/TOKEN, PAYMENT_PROVIDER/SECRET/WEBHOOK_SECRET, trusted APP_ORIGIN. Worker có thông tin kết nối riêng. Tên cuối cùng được chốt khi bootstrap; `.env.example` chỉ chứa placeholder, không secret. Thêm feature flag DEMO_MODE và PAYMENT_MODE khi triển khai; production không bật demo.
