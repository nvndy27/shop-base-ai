> Phạm vi cập nhật 29/10/2026: [REQUIREMENTS](REQUIREMENTS.md) là chuẩn nghiệm thu hiện hành; [ROADMAP](ROADMAP.md) quy định mốc C0–C6. Tài liệu bên dưới mô tả thiết kế/mã marketplace trước khi đổi phạm vi, chưa phải đặc tả triển khai module nội bộ. Caption AI ngoài phạm vi. Các bảo vệ dữ liệu, quyền và bí mật hiện có vẫn phải giữ; cập nhật chi tiết phần liên quan trong từng mốc.

# Mô hình dữ liệu và quyền

Đây là thiết kế schema, không phải SQL có thể áp dụng ngay. Migration phải kèm constraint, policy, grant và test tương ứng; không suy ra an toàn từ tên bảng.

Schema M1 ở `supabase/migrations/202610010001_identity_and_shops.sql` đã áp dụng cloud. Profiles/user_roles/addresses/shops/shop_members có RLS; audit ở private schema. Bằng chứng M1 và phần Supabase thật chưa kiểm chứng: `BACKEND_VERIFICATION.md`. Catalog nguồn và marketplace được bổ sung theo trạng thái bên dưới; bảng chat/payment/caption vẫn chưa triển khai.

Cập nhật D032: migration `202610030003_marketplace_cod.sql` bổ sung schema commerce không expose trực tiếp qua PostgREST, gồm sản phẩm/variants/inventory/movements/assets/cart/quotes/orders/shop_orders/items/reservations/events/outbox. Có RLS, grants và transaction RPC; đã kiểm cục bộ, chưa apply cloud. Storage ở migration 004. Xem [COURSE_COMMERCE](COURSE_COMMERCE.md); không replay schema M1 đã áp dụng.

Schema M1 đã áp dụng lên Supabase dự án được chỉ định sau xác nhận riêng; verifier SQL roles thực pass. Không chạy lại migration hoặc chỉnh file đã áp dụng. A/B qua Auth/PostgREST thật và race nhiều connection chưa kiểm chứng.

## Nhóm bảng

| Bảng | Cột/chức năng chính |
|---|---|
| profiles | user_id FK auth.users, display_name, avatar_asset_id, status; không chứa role tự sửa |
| user_roles | user_id, role/permission, granted_by; backend/quản trị cấp |
| addresses | id, user_id, thông tin người nhận và địa chỉ, default |
| shops | id, owner_user_id, slug unique, name, status, moderation_reason |
| shop_members | shop_id, user_id, role, active; unique cặp |
| categories | id, parent_id, slug, name, active; chống chu kỳ |
| products | id, shop_id, category_id, title, description, status, version, published_at |
| product_variants | id, product_id, sku, attributes, price_vnd, active; unique product+sku |
| inventory | variant_id, on_hand, reserved, version; available = on_hand - reserved |
| inventory_movements | variant_id, delta, reason, reference, actor, thời điểm; ledger audit |
| assets | id, shop/owner, bucket/key, purpose, mime, size, moderation_status |
| product_images | product_id, asset_id, position; asset phải thuộc shop |
| carts / cart_items | user_id, variant_id, quantity; unique cart+variant; không chốt giá |
| orders | id, buyer_id, currency, totals, address_snapshot, idempotency_key |
| shop_orders | id, order_id, shop_id, status, totals, shipping_snapshot |
| order_items | shop_order_id, variant_id, quantity, title/SKU/price snapshot, subtotal |
| stock_reservations | order_id, variant_id, quantity, expires_at, status |
| order_events | suborder, from/to state, actor, reason, timestamp |
| payment_attempts | order_id, provider, provider_ref unique, amount, status, request_key |
| webhook_events | provider, event_id unique theo provider, digest, processing_status |
| refunds | payment_id, shop_order/item scope, amount, status, provider_ref, idempotency_key |
| reviews | order_item_id unique, buyer_id, rating 1–5, text, moderation_status |
| conversations | id, buyer_id, shop_id, optional product/order scope |
| conversation_members | conversation_id, user_id, active, last_read_message_id |
| messages | id, conversation_id, sender_id, body/kind, client_message_id, created_at |
| message_attachments | message_id, asset_id; asset private, đã scan |
| user_blocks / reports | chủ thể chặn, target; báo cáo có case scope |
| caption_jobs | shop/product/asset, requested_by, state, model_version, output, accepted_at |
| outbox_events | entity_id/version/type, payload tối thiểu, available_at, attempts, lease |
| audit_logs | actor, action, resource, before/after đã lọc, case_id, request_id |

Giai đoạn sau mới thêm vouchers/redemptions, shipments, disputes, settlements/payouts theo hợp đồng đã chốt. Không tạo wallet balance như nguồn tiền thật.

## Ràng buộc bắt buộc

- Giá/amount không âm; quantity > 0 và có giới hạn; currency MVP chỉ VND. on_hand >= 0, reserved >= 0, reserved <= on_hand.
- Inventory FK variant, product FK shop. Khi tạo order item phải xác nhận variant thuộc đúng shop của suborder; constraint ghép hoặc transaction kiểm tra không đủ chỉ kiểm ở client.
- Shop membership không cho client tự sửa role. Product owner không đổi shop_id bằng update.
- Snapshot đơn giữ nguyên giá/thuộc tính lúc đặt; không cập nhật theo product hiện tại.
- Một default address/user qua partial unique index. Một review/order item; một tin theo conversation+sender+client_message_id chống retry trùng.
- Payment/refund reference và idempotency dùng unique constraint, không chỉ check rồi insert gây race.
- Không cascade xóa user/product làm mất order_items, payments, audit. Soft delete/ẩn PII theo retention; snapshot cá nhân cũng phải nằm trong quy trình xóa hoặc giữ có lý do.
- Index phục vụ buyer orders, shop orders theo trạng thái/time, messages theo conversation+created_at+id, membership, outbox pending và variant search.

## Chính sách RLS/GRANT

| Tài nguyên | Đọc | Ghi |
|---|---|---|
| Profiles private/addresses/cart | Chính chủ đang active | Chính chủ, allowlist cột |
| Public shop/product projection | Chỉ active/published | Không public write |
| Shop data | Thành viên active có permission | Backend kiểm permission + trạng thái |
| Orders | Buyer parent; shop member chỉ suborder của shop | Qua backend transaction |
| Payment/refund/webhook/outbox | Buyer DTO tối thiểu; finance đúng quyền | Backend/worker riêng |
| Chat | Thành viên được cấp scope | Gửi qua backend, sender từ phiên |
| Caption | Shop permission phù hợp | Backend/worker, owner asset bắt buộc |
| Audit | Quyền auditor/case phù hợp | Insert từ backend, không sửa bởi client |

Ưu tiên private schema cho bảng nghiệp vụ nội bộ; public view/DTO chỉ expose field cần thiết. View phải kiểm tra cơ chế invoker/RLS thực tế; không vô tình chạy với quyền owner bypass policy. RLS không phân quyền cột: dùng column grants, view hoặc API cho role/status/balance.

Service-role/secret có thể bypass RLS: không coi RLS bảo vệ query đặc quyền. Tách đường query gắn JWT user cho dữ liệu người dùng và đường đặc quyền cho job; đường đặc quyền luôn kiểm quyền ở service, query scope rõ ràng. Function SECURITY DEFINER chỉ khi cần, đặt search_path an toàn, revoke EXECUTE không cần thiết, kiểm `auth.uid()`/actor; không tạo RPC cho mọi user sửa tồn hay payment.

## Checkout và giữ kho

Một transaction SQL/RPC server-authorized: kiểm user/shop/SKU → lấy giá và phí hiện hành → giữ kho bằng row lock hoặc conditional update → tạo order/suborders/items snapshots → reservations/outbox → commit. Nhiều HTTP request Supabase liên tiếp không tương đương transaction.

Khóa SKU theo thứ tự ổn định để giảm deadlock. Timeout thanh toán thì worker release reservation nguyên tử và idempotent. Khi shipped, giảm on_hand và reserved một lần; cancel thì release reserved một lần. Webhook paid đến sau expiry phải kiểm lại kho, đưa vào xử lý exception/hoàn tiền nếu không thực hiện được; không tự xác nhận đơn thiếu hàng.

Retain lịch sử đơn/thanh toán theo policy sẽ chốt; export/xóa dữ liệu có audit. Backup và thử restore là điều kiện vận hành, không chỉ bật tùy chọn backup.


## Sales C0/C1 — 29/10/2026

Thiết kế hiện hành tám bảng, đầy đủ PK/FK/constraint/index/vòng đời và kế hoạch C2–C4 tại [SALES_DESIGN](SALES_DESIGN.md). Migration bổ sung `202610290001_sales_foundation.sql` triển khai đúng bốn bảng nền và bảng kỹ thuật staff. Không đổi commerce, không migrate dữ liệu marketplace. Customers độc lập Auth. C1 mới có FK products → categories; tham chiếu tồn/đơn/lịch sử chưa tồn tại nên chưa kiểm KT21/22 phần đó. Giá được kiểm kiểu số/nguyên/range trong RPC trước NUMERIC(14,0), tránh làm tròn. Direct DML bị thu hồi. Migration chưa apply Supabase; rollback vận hành bằng tắt sales và forward-fix, không drop dữ liệu. Không áp dụng bootstrap test lên môi trường thật.
