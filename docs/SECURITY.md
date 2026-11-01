> Phạm vi cập nhật 29/10/2026: [REQUIREMENTS](REQUIREMENTS.md) là chuẩn nghiệm thu hiện hành; [ROADMAP](ROADMAP.md) quy định mốc C0–C6. Tài liệu bên dưới mô tả thiết kế/mã marketplace trước khi đổi phạm vi, chưa phải đặc tả triển khai module nội bộ. Caption AI ngoài phạm vi. Các bảo vệ dữ liệu, quyền và bí mật hiện có vẫn phải giữ; cập nhật chi tiết phần liên quan trong từng mốc.

# Rà soát bảo mật ở mức thiết kế

Trạng thái: threat model và yêu cầu kiểm soát. Đã có code backend M1, kiểm thử quyền SQL/API cục bộ và verifier schema/grants/anon/subjectless deny trên Supabase thật sau khi áp dụng migration được xác nhận. Chưa kiểm A/B qua Auth/PostgREST thật hoặc audit độc lập/vận hành, không kết luận toàn hệ thống an toàn. Severity dưới đây là mức ưu tiên của rủi ro giả định. Các chỉ dẫn Markdown không phải cơ chế cưỡng chế; phải triển khai kiểm soát ở server, DB và CI. Phạm vi bằng chứng đã có: `BACKEND_VERIFICATION.md`.

## Tài sản và ranh giới

Tài sản: danh tính/phiên, địa chỉ và SĐT, chat/ảnh riêng, catalog/shop, đơn/kho, payment/refund/settlement, secret, dữ liệu mô hình. Ranh giới: browser–backend; backend–DB; shop A–B; realtime channel; webhook từ provider; worker–Elastic/AI. Kẻ tấn công có thể là khách, user, seller hợp lệ hoặc client bị chiếm; không tin input vì đã login.

## Ma trận rủi ro

| Rủi ro | Ưu tiên | Kiểm soát và bằng chứng cần có |
|---|---|---|
| Đổi ID đọc/sửa đơn, shop, chat của người khác | Critical | Resource authz + RLS; test A/B cho mỗi verb và nested resource |
| Client sửa giá/giảm giá/payment status | Critical | Server quote/tổng và state machine; sửa body không làm đổi tổng |
| Webhook giả/trùng/sai thứ tự | Critical | Signature đúng provider, inbox unique, amount/ref validation, reconciliation |
| Lộ service-role/Elastic/payment key | Critical | Server-only import/env, secret scan, rotate khi lộ, key scope |
| Tự cấp role/đổi owner qua payload hoặc metadata | Critical | Column allowlist/grants, quyền từ bảng server; test mass assignment |
| Bán vượt tồn kho, hoàn tiền/chi trả hai lần | High | Transaction, lock/conditional update, unique/idempotency, test race |
| Đọc channel chat không tham gia hoặc phiên cũ sau thu hồi | High | Private channel policy, session revoke handling, test kết nối đang mở |
| XSS trong chat/caption/mô tả | High | Text render hoặc sanitizer allowlist, CSP, không raw HTML |
| Upload giả ảnh, file độc, EXIF GPS | High | Signature/decoder, size/pixel limit, re-encode, strip EXIF, quarantine/scan |
| SSRF qua URL ảnh/webhook/model | High | Asset ID/server URL allowlist, không fetch arbitrary URL, chặn private ranges |
| OTP flooding/SMS pumping/bruteforce | High | Rate limit đa chiều, cooldown, CAPTCHA risk-based, quota/ngân sách |
| SIM swap/tái cấp số chiếm account | High | Recovery xác minh bổ sung, TOTP cho admin/seller nhạy cảm, re-auth đổi identity |
| CSRF/session hijack/open redirect | High | CSRF protection, secure cookies, validated redirects, token validation/revocation |
| Lộ PII trong log/index/backup | High | Data minimization, redaction, private access, retention và restore policy |
| Caption bịa công dụng hoặc prompt injection | Medium/High | Model không quyền tool, human approval, schema/output check, cảnh báo |
| Tìm kiếm/AI/chat DoS | High | Query/payload limit, timeout, queue/quota, per user/shop/IP budget |
| Admin đọc chat vô hạn/insider abuse | High | Case-scoped support, reason/audit, least privilege, MFA |
| Dependency/supply-chain compromise | High | Lockfile, scan, dependency review; không chạy script tải tùy ý |

## Giao dịch

- Browser không được ghi payment/refund/inventory reserved trực tiếp. Order creation nhiều shop là transaction; điều kiện một shop thất bại phải rollback hoặc yêu cầu checkout lại rõ ràng.
- Tách order, payment_attempt, refund và payout. Một order có nhiều attempt nhưng không thu trùng; payment retry query trạng thái attempt trước tạo mới.
- Webhook return URL không là bằng chứng thanh toán. Paid xác nhận server/provider; event amount/currency phải khớp order. Chữ ký đúng không thay kiểm reference/số tiền.
- Refund partial và nhiều lần tính phần còn lại trong transaction, khóa payment ledger; quyền maker/checker cho khoản nhạy cảm trước production.
- Không dựa vào trạng thái delivered do seller tự khai để chi trả thật. Quy trình tranh chấp, hold và đối soát phải chốt trước settlement.
- Lưu audit actor/reason/reference cho thay đổi tiền. Không lưu PAN/CVV hay dữ liệu thẻ; dùng checkout provider.

## Tin nhắn và dữ liệu riêng

Membership do backend cấp; user không tự thêm mình vào conversation bằng API/SQL. Shop staff access giới hạn role và được thu hồi. Sender từ phiên, attachment phải của đúng conversation/owner. Kiểm membership mỗi write/read; broadcast sau persist, không nhận client broadcast giả làm tin hệ thống.

TLS và kiểm soát lưu trữ không tương đương end-to-end encryption. MVP không tuyên bố E2EE: backend có thể xử lý tin để hỗ trợ báo cáo có audit. Muốn E2EE phải thiết kế key management/multi-device/recovery và giới hạn kiểm duyệt riêng, không thêm bằng một nhãn UI.

Signed URL private hết hạn ngắn; người đã tải có thể giữ bản sao, không hứa thu hồi được file đã tải. Push/email không chứa toàn bộ chat/địa chỉ; preview nhạy cảm theo preference. Không index chat bằng Elasticsearch công khai. Access hỗ trợ theo case, không default quyền admin xem mọi tin.

## Tài khoản và phiên

Frontend Auth đã nối SDK: PKCE, fixed callback, auto-refresh và local/global logout. Theo yêu cầu nhớ đăng nhập của chủ dự án (D016), thay sessionStorage bằng localStorage SDK-managed; không copy token sang store khác hoặc tuyên bố HttpOnly. Storage vẫn JS-readable/XSS-sensitive; không coi dữ liệu lưu ở browser là danh tính được xác minh, restore kiểm Auth.getUser và API kiểm bearer/RLS. Chỉ allowlist URL/publishable key được đưa vào bundle, chặn service-role/secret; dev proxy bảo vệ Origin và không thay authz/RLS. Provider/callback cloud và A/B JWT thật chưa nghiệm thu; xem AUTH_INTEGRATION. Không xem screenshot hoặc SDK transport fixture là bằng chứng production an toàn.

Google chỉ xin scope tối thiểu để login, không quyền đọc Gmail. OTP chống enumeration, giới hạn thử và gửi lại; không lưu/ghi log OTP. Liên kết identity và đổi phone phải chứng minh kiểm soát, không merge theo dữ liệu profile. Re-auth/MFA khi đổi tiền nhận, cấp quyền, hoàn tiền. Backend kiểm active user/shop ở hành động nhạy cảm vì JWT stateless có thể chưa hết hạn sau ban.

Chính sách cookie/token phải được chọn thực tế theo SDK; không tuyên bố HttpOnly nếu JS đọc cookie. CSP giảm XSS; CORS origin allowlist, không wildcard credential. Không đưa bearer token vào URL hay signed link dài hạn. Logout/thu hồi refresh token và access ngắn hạn kết hợp kiểm status server.

## Upload và AI

Content-Type do client cung cấp không đáng tin. Allow JPEG/PNG/WebP ban đầu; SVG/HTML không cho trong chat/catalog. Decode/re-encode, chặn decompression bomb, limit pixel, strip metadata, scan và random object key. Không dùng filename làm path. Asset private chưa xử lý không dùng thumbnail công khai.

Caption input/ảnh/OCR không là instruction có quyền. Service AI không được đọc secret, gọi tool hoặc tự publish. Quota/rate limit cả submit và retry; output giới hạn chiều dài, plain text/allowlist. Không gửi dữ liệu user/chat sang provider model. Giữ provenance model/version và accept của seller.

## Trước production

Điều kiện: tests critical pass, không secret ở bundle, role/RLS/grant reviewed, provider sandbox webhook verified, backup restore thử thành công, telemetry redacted, incident procedure/rotation, cost alerts, privacy/retention và quy trình khiếu nại được chốt. Các nghĩa vụ pháp lý của sàn, dữ liệu cá nhân, hóa đơn và thanh toán tại thị trường vận hành cần người có chuyên môn xác minh theo quy định lúc triển khai; bộ này không đưa kết luận pháp lý cụ thể.
