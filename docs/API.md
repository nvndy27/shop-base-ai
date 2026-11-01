> Phạm vi cập nhật 29/10/2026: [REQUIREMENTS](REQUIREMENTS.md) là chuẩn nghiệm thu hiện hành; [ROADMAP](ROADMAP.md) quy định mốc C0–C6. Tài liệu bên dưới mô tả thiết kế/mã marketplace trước khi đổi phạm vi, chưa phải đặc tả triển khai module nội bộ. Caption AI ngoài phạm vi. Các bảo vệ dữ liệu, quyền và bí mật hiện có vẫn phải giữ; cập nhật chi tiết phần liên quan trong từng mốc.

# Hợp đồng API

Prefix `/api/v1`; bảng dưới là contract chung. Chỉ lát cắt M1 ở cuối tài liệu đã có implementation cục bộ; các endpoint khác chưa chạy. Request JSON có schema allowlist, response DTO không trả entity DB nguyên vẹn. Các mutation lấy actor từ phiên; không tin buyer_id/sender_id/role trong body. UUID opaque không thay authz.

Cập nhật 03/10: `/products`, `/products/:ASIN`, `/catalog/categories`, `/search`, `/search/suggestions` đã triển khai cho catalog nguồn Amazon qua Supabase/Elastic. Đây là metadata nguồn, chưa phải hàng có SKU/kho được duyệt của marketplace. Tham số/DTO/giới hạn và kết quả thật tại [CATALOG_API](CATALOG_API.md).

Cập nhật D032: đã viết `/marketplace/products`, `/marketplace/search`, `/cart`, `/checkout/quote`, `/orders`, seller products/variants/inventory/orders/images và admin products cho luồng COD môn học. Đây là implementation cục bộ, migration mới **chưa apply cloud**, không đồng nhất với catalog ASIN cũ. Body/DTO, giới hạn, cấu hình và checks tại [COURSE_COMMERCE](COURSE_COMMERCE.md).

Cập nhật D036 (chat lát cắt 1): đường dẫn thật là `/chat/conversations` (khác `/conversations` trong bảng contract bên dưới). `GET /chat/conversations?limit=`, `POST /chat/conversations` (`shop_id`, tuỳ chọn `context_product_id`/`context_order_id`), `GET /chat/conversations/:id?before_seq=&limit=`, `POST /chat/conversations/:id/messages` (`body`, `client_message_id`), `POST /chat/conversations/:id/read` (`up_to_seq`). Mọi route cần bearer token; DTO không trả `buyer_id`/`sender_id`, chỉ `mine` và `counterpart_name`. Phân trang bằng `seq` tăng dần, không dùng created_at. `message_send` chỉ nhận `body` là string (object/array/số bị từ chối 422 tại BFF và 22023 tại RPC). Shop bị đóng hoặc tạm ngưng chỉ chặn gửi mới; cả hai phía vẫn đọc được lịch sử và luồng vẫn hiện trong danh sách. Chưa có attachment/report/block/realtime.

## Endpoint

| Method/path | Quyền và hành vi |
|---|---|
| GET /products, /products/:id | Public projection; published + shop active |
| GET /search?q=&category=&min=&max=&sort=&cursor= | Validate query, limit tối đa đề xuất 40, query server Elastic |
| GET/PATCH /me | Chính chủ; không sửa role/status/identity qua profile |
| GET /me/purchase-eligibility | Đã triển khai: bearer Auth hợp lệ, profile active, Auth xác nhận SĐT; 403 PHONE_REQUIRED nếu thiếu |
| GET/POST/PATCH/DELETE /me/addresses | Chính chủ, field allowlist |
| GET /cart; PUT /cart/items/:variantId; DELETE item | Chính chủ; quantity hợp lệ, giá chưa chốt |
| POST /checkout/quote | Định giá lại server, quote có expiry/version |
| POST /orders | Checkout có idempotency; body chứa SKU/quantity/address/payment method |
| GET /orders; GET /orders/:id | Buyer parent; không suy ra shop được xem cả parent |
| POST /orders/:id/cancel | Buyer đúng owner; rule theo từng suborder, không PATCH state tùy ý |
| POST /orders/:id/payment-attempts | Owner, amount lấy order; retry không tạo charge trùng |
| POST /payments/webhooks/:provider | Xác thực provider signature, không user session; inbox/dedupe |
| POST /shop-applications | Đã xác minh; không tự active shop |
| GET/POST/PATCH /seller/shops/:shopId/products | Membership/permission; shop scope bắt buộc |
| POST /seller/shops/:shopId/products/:id/submit | Kiểm sản phẩm đầy đủ và điều kiện duyệt |
| POST /seller/shops/:shopId/inventory-adjustments | Permission kho, movement audit, không sửa reserved trực tiếp |
| GET /seller/shops/:shopId/orders | Chỉ suborder shop |
| POST /seller/shops/:shopId/orders/:id/transitions | Transition allowlist + actor; optimistic version |
| POST /assets/upload-intents; POST /assets/:id/finalize | Owner/purpose; kiểm bytes sau upload trước dùng |
| POST /seller/shops/:shopId/caption-jobs | Owner assets, permission, quota, idempotency |
| GET /caption-jobs/:id; POST /caption-jobs/:id/accept | Shop scope; accept version hợp lệ, không publish |
| POST /conversations; GET /conversations/:id/messages | Backend tạo membership hợp lệ; cursor chat |
| POST /conversations/:id/messages | Sender session; membership/block/rate limit/attachment |
| POST /reports | Chủ thể đang đăng nhập, target hợp lệ, không lộ dữ liệu target |
| POST /admin/shops/:id/decision; /admin/products/:id/decision | Moderator permission + MFA nếu policy yêu cầu + lý do/audit |
| POST /admin/users/:id/status | Quyền quản lý user, chống tự nâng quyền/cấm khóa admin cuối |
| POST /finance/refunds | Scope finance, amount còn refundable, provider và idempotency |

Auth Google/phone dùng SDK Auth, không viết endpoint thu mật khẩu Google. Payout chưa thuộc MVP.

## Quote và idempotency

Quote server trả breakdown từng shop, items/version, subtotal/shipping/discount/total, expires_at; order creation revalidate giá/kho. Quote token là tham chiếu được ký/lưu server, không chấp nhận breakdown client như nguồn tiền. Giá đổi thì trả PRICE_CHANGED để người mua xem và xác nhận lại.

Header `Idempotency-Key` ở order/payment/refund/caption. Scope theo actor + operation, lưu request hash và result trong DB với unique constraint; cùng key/body trả lại result, khác body trả 409. Đồng thời/in-progress có response rõ, không chạy side effect lại. Retention idempotency chốt theo retry window provider, không chỉ cache RAM.

## Lỗi và phân trang

Envelope lỗi: `{ "error": { "code": "...", "message": "...", "request_id": "...", "fields": {} } }`. Không chứa stack/token/PII. 401 unauthenticated, 403 denied, 404 tài nguyên không tồn tại/không được tiết lộ, 409 conflict, 422 validation, 429 rate limit + retry-after, 503 provider unavailable.

Code trọng yếu: OUT_OF_STOCK, PRICE_CHANGED, INVALID_TRANSITION, SHOP_SUSPENDED, PAYMENT_PENDING, CAPTION_UNAVAILABLE, RATE_LIMITED. Cursor opaque bound query/sort; message pagination bằng created_at+id để ổn định. Không trả count/aggregation từ dữ liệu riêng cho người không có quyền.

## Chi tiết implementation M1 — frontend cần review đồng bộ

Giữ nguyên method/path trong bảng, không thay hợp đồng đã định nghĩa. Các field/response dưới đây bổ sung phần chi tiết chưa có ở baseline; nguồn schema thực là `packages/contracts/src/index.ts`. Chưa có endpoint auth tùy chỉnh. Backend M1 yêu cầu bearer access token Supabase; không nhận cookie.

| Endpoint | JSON request | Response thành công |
|---|---|---|
| GET /me | Không body | `{user_id, display_name, status:"active"}` |
| PATCH /me | `{display_name}` (trim, 1–100 ký tự) | Cùng DTO GET /me |
| GET /me/addresses | Không body | `{items: Address[]}`; chỉ chính chủ, order created_at/id |
| POST /me/addresses | AddressInput | 201, Address |
| PATCH /me/addresses | `{id, ...field địa chỉ muốn đổi}`; ít nhất một field | Address |
| DELETE /me/addresses | `{id}` | 204, body rỗng |
| GET /me/shops | Không nhận owner/role từ client; membership active của actor | `{items:[{id,name,slug,status}]}`, no-store |
| POST /shop-applications | `{name, slug}` | 201, `{id,name,slug,status:"pending"}` |
| POST /admin/shops/:id/decision | `{decision,reason}` | `{id,name,slug,status}` |

`AddressInput`: `recipient_name`, `phone` (E.164), `address_line`, `ward`, `district`, `province` và `is_default` (tùy chọn khi tạo, mặc định false). Address trả cùng field và `id`, không trả `user_id`. PATCH không tự thêm giá trị mặc định cho field bị bỏ qua. Chọn default mới bỏ default cũ cùng transaction; xóa default không tự chọn địa chỉ khác.

`decision`: active/rejected/suspended/closed. Reason 3–500 ký tự; JWT AAL2/MFA bắt buộc. Transition: pending→active/rejected; active→suspended/closed; suspended→active/closed. Không tự duyệt shop của moderator. Field owner/status/role/granted_by ngoài schema bị từ chối, không âm thầm bỏ qua.

Lỗi M1 bổ sung vào envelope chung: UNAUTHENTICATED (401), ACCOUNT_INACTIVE / IDENTITY_UNVERIFIED / FORBIDDEN (403), NOT_FOUND (404), CONFLICT / INVALID_TRANSITION (409), VALIDATION_ERROR (422), SERVICE_UNAVAILABLE (503). UUID địa chỉ người khác và UUID không tồn tại đều 404; list không tiết lộ số lượng dữ liệu của người khác.

Tối đa 16 KiB JSON mỗi mutation; nhận application/json, không raw entity hoặc query DSL. Response private có Cache-Control no-store và X-Request-Id trùng request_id lỗi. Chỉ Origin đúng APP_ORIGIN; bearer client không có Origin được phép. Không bật cross-origin credentials/preflight wildcard. Endpoint ngoài lát cắt M1 trả 404, không giả thành công.

**Chưa hỗ trợ M1:** avatar_asset_id (phụ thuộc pipeline asset), member administration, user status admin endpoint, pagination địa chỉ. Frontend callback/refresh/logout đã có mã SDK nhưng chưa E2E bằng provider/phiên thật; xem AUTH_INTEGRATION. `/auth/callback` là route frontend, không phải endpoint API mới. Giữ bearer/no-cookie và DTO/method/path M1. Mọi mở rộng cần schema/tests và thông báo frontend trước; không coi phần còn thiếu là thay đổi đã được duyệt.


## Sales C1 — hợp đồng hiện hành

Prefix `/api/v1/sales`, bốn resource `categories`, `products`, `customers`, `warehouses`.

| Method/path | Input | Output |
|---|---|---|
| GET /{resource} | page 1..100000 default 1; page_size 1..100 default 20 | `{items: Row[], page, page_size}`, thứ tự created_at,id ổn định |
| GET /{resource}/{uuid} | Không body/query | Row |
| POST /{resource} | Create DTO | Row, HTTP 201 |
| PUT /{resource}/{uuid} | DTO đầy đủ, thay thế trường nghiệp vụ | Row, HTTP 200 |
| PATCH /{resource}/{uuid}/active | `{is_active:boolean}` duy nhất | Row |
| DELETE /{resource}/{uuid} | Không body/query | `{id}`, HTTP 200; FK chặn xóa |

DTO create/update: categories `{code,name,description?}`; products `{sku,category_id,name,description?,unit,current_price}`; customers `{code,full_name,phone,email?,address}`; warehouses `{code,name,address}`. Customer code bất biến sau tạo. Description/email thiếu hoặc trống lưu NULL; trường khác bắt buộc. Không nhận role/owner/id/timestamp/is_active trong DTO thường. Chuẩn hóa mã/phone/email/NFC và giới hạn theo REQUIREMENTS §3.3/4, contract `server/sales/contracts.ts`. Row trả các trường bảng tương ứng cộng id/is_active/created_at/updated_at; current_price JSON number nằm dưới MAX_SAFE_INTEGER. Không có tổng đơn ở C1.

JSON body tối đa 16 KiB, Content-Type application/json. Query lặp hoặc trường lạ 422; UUID sai 422. Authorization Bearer Supabase bắt buộc; Origin nếu có phải khớp APP_ORIGIN. Kiểm role trong DB từ sales.staff. Error envelope `{error:{code,message,fields?,request_id}}`, no-store. 401 thiếu/sai phiên; 403 FORBIDDEN thiếu/quyền đã thu hồi; 404 NOT_FOUND ID/endpoint không có; 422 VALIDATION_ERROR trường sai (body có fields); 409 DUPLICATE mã/SKU/phone; 409 REFERENCE_CONFLICT FK; 409 CONFLICT category inactive hoặc sửa customer code. 503 SERVICE_UNAVAILABLE khi cấu hình/dịch vụ lỗi, không trả dữ liệu giả. Không echo lỗi SQL hoặc PII. Danh sách rỗng trả items=[]; chưa có tìm kiếm Elastic ở C1.

Ma trận quyền và hợp đồng C2–C4: [SALES_DESIGN](SALES_DESIGN.md). API dự kiến, chưa triển khai: inventory phân bổ/chi tiết/phân trang và POST movements nhận warehouse_id/product_id/type/delta/reason/request_key; orders CRUD nháp nhận customer_id/warehouse_id/recipient/lines(product_id,quantity), không nhận giá/tổng; POST refresh-prices, confirm, complete, cancel. Tất cả dùng transaction/row locks; 409 thiếu tồn, trạng thái sai, retry khác nội dung; snapshot và tổng do server tính. Không dùng API marketplace thay các endpoint này.
