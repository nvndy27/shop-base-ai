# Luồng thương mại cho dự án môn học — 03/10/2026

## Phạm vi và trạng thái

Đã viết schema, RPC giao dịch, API và giao diện cho catalog có SKU/kho, người bán, giỏ theo tài khoản, báo giá, đơn COD nhiều shop, hủy/hoàn kho, địa chỉ, kiểm duyệt và upload ảnh. Caption, thanh toán online, SMS/email thật, giao vận và deploy không thuộc lát cắt này.

**Chưa áp dụng hai migration mới lên Supabase cloud.** Project đang dùng là shopbase/main, dashboard đánh dấu Production; cần ủy quyền riêng cho bước áp dụng và cấu hình secret server. Hiện `/marketplace` báo dịch vụ chưa khả dụng, không trả hàng/đơn giả. Catalog Amazon ở `/` tiếp tục dùng API cũ.

Migration cần review/apply theo thứ tự sau (không replay migration đã áp dụng):

1. `202610030003_marketplace_cod.sql`: schema commerce, bảng/RLS, RPC và worker.
2. `202610030004_product_image_storage.sql`: bucket `course-product-images` và restrictive policy ngăn browser upload trực tiếp.

Không thay owner/status/quyền của tài khoản hay shop hiện có. Không tự tạo Auth users hoặc đánh dấu SĐT đã xác minh. Shop bán hàng phải được duyệt theo M1; kiểm duyệt sản phẩm dùng permission hiện có `shops:moderate` + AAL2, cấm tự duyệt shop mình. Tài khoản vẫn cần SĐT Auth đã xác minh trước đặt hàng; không bỏ điều kiện này vì thiếu SMS provider.

## Dữ liệu và nghiệp vụ

- Catalog Amazon 20.000 metadata / 7.803 có giá giữ riêng, giá USD lịch sử. Không biến toàn bộ metadata thành hàng có kho hay quy đổi ngầm sang VND.
- Catalog shop: UUID, shop chính chủ, nháp → chờ duyệt → published/rejected; archived để ẩn. Sửa nội dung published đưa về nháp; thay giá/biến thể tăng version. Tối đa 30 biến thể/sản phẩm.
- Giá VND nguyên từ 1.000 đến 100 triệu; stock tối đa một triệu; quantity 1–99 và giỏ tối đa 40 SKU. Các con số là giới hạn cho course MVP, không quy định giá thực.
- Giỏ lưu PostgreSQL, không localStorage. Giỏ chứa SKU/số lượng; không nhận giá từ client. SKU hết hàng/ẩn vẫn có thể xóa khỏi giỏ.
- Quote từ server, tồn tại 10 phút. Phí giao hàng **0đ cho bài môn học**; chỉ COD. Tạo đơn kiểm lại cart snapshot/giá/version, shop/visibility và kho trong một transaction; giá thay đổi trả PRICE_CHANGED.
- Khóa theo thứ tự shop → product → variant → inventory. Parent order chia suborder theo shop. Snapshot giá/tên/SKU/địa chỉ giữ tại lúc đặt; seller chỉ nhận suborder của shop mình và địa chỉ giao hàng cần thiết, không nhận buyer_id/đơn shop khác.
- Request UUID chống tạo đơn/điều chỉnh kho trùng; cùng key/nội dung trả lại kết quả, khác nội dung conflict. Checkout giữ key trên UI khi retry, không tự retry mutation sau lỗi phiên.
- pending → confirmed → shipped → delivered; pending/confirmed có thể cancelled. shipped giảm on_hand và reserved đúng một lần; cancel trả reserved đúng một lần. Buyer không hủy cả parent khi bất kỳ shop đã shipped/delivered. Không thu tiền hoặc tự ghi trạng thái đã thanh toán.
- COD chưa xác nhận quá 7 ngày được worker hủy/hoàn kho. Đơn confirmed không hết hạn theo quy tắc này; cần seller xử lý.
- Các list riêng hiện giới hạn 24 đơn/40 sản phẩm gần nhất, chưa có phân trang sâu dashboard; public catalog 24/trang, tối đa 80 trang.

## API đã thêm

Prefix `/api/v1`; tất cả mutation JSON giới hạn 16 KiB, strict allowlist, actor từ bearer Auth.getUser. Route-derived IDs không được gửi lại/ghi đè trong body. RPC cũng kiểm quyền, trạng thái, key và constraint khi gọi trực tiếp.

| API | Body / hành vi |
|---|---|
| GET `/marketplace/products?category=&page=` | Public published + shop active, variants/kho có sẵn |
| GET `/marketplace/products/:UUID` | Chi tiết bán hàng; 404 khi ẩn |
| GET `/marketplace/search?q=&category=&sort=&page=` | Elastic riêng, hydrate lại PostgreSQL để loại stale/draft/suspended |
| GET `/cart` | Giỏ chính chủ |
| PUT/DELETE `/cart/items/:variantId` | PUT `{quantity}`; DELETE không body |
| POST `/checkout/quote` | `{}` → snapshot, tổng server, expiry |
| POST `/orders` | `{quote_id,address_id,request_key,payment_method:"cod"}` |
| GET `/orders`, `/orders/:id` | Buyer chính chủ |
| POST `/orders/:id/cancel` | `{reason}` |
| GET/POST `/seller/shops/:shopId/products` | List/create; create `{title,description,category,image_urls,sku,name,price_vnd,stock}` |
| PATCH `/seller/shops/:shopId/products/:id` | `{version,title,description,category,image_urls}` |
| POST `.../products/:id/submit`, `.../archive` | `{version}` |
| POST `.../products/:id/variants` | `{sku,name,price_vnd,active}`; sửa thêm `{id,version}` |
| POST `.../inventory-adjustments` | `{variant_id,delta,reason,request_key}`; không cho sửa reserved |
| GET `.../orders` | Chỉ đơn của shop có permission orders:read |
| POST `.../orders/:suborderId/transitions` | `{status,version,reason}`; permission orders:transition |
| GET `/admin/products/pending` | Queue moderator + AAL2 |
| POST `/admin/products/:id/decision` | `{version,decision:"published"|"rejected",reason}`, audit |
| POST `/seller/shops/:shopId/images` | Raw JPEG/PNG/WebP, ≤5 MB; trả `{id,url}` sau lưu thành công |

Quyền fulfillment không sửa catalog/kho; catalog không đọc đơn. Nhân sự revoked, tài khoản banned hoặc shop không active không được bán mới. Shop suspended vẫn xử lý đơn cũ theo permission M1.

## Ảnh

Ảnh từ catalog chỉ nhận URL HTTPS m.media-amazon.com theo đường dẫn được cho phép; không fetch URL tùy ý ở server. Upload kiểm format bằng Sharp được pin theo dependency Next đang có, ≤16 triệu pixels, một frame, re-encode WebP ≤2 MB, xoay đúng hướng và bỏ metadata. Không dùng filename người dùng.

Object key ngẫu nhiên theo shop/asset UUID. Bucket public chỉ chứa ảnh đã xử lý; browser bị restrictive policy chặn upload trực tiếp kể cả khi có policy khác quá rộng. Asset register theo shop/actor; chỉ worker/server đặc quyền đánh dấu ready, chỉ shop sở hữu được gắn URL vào sản phẩm. Upload lỗi không trả thành công; finalize lỗi xóa object bù trừ, asset pending không dùng được. Không có cơ chế xóa ảnh đang được đơn tham chiếu; cleanup orphan cần thêm trước vận hành.

Upload và worker cần **file secret server riêng**, không gửi secret vào chat, không đặt biến VITE_*. Server user requests khác vẫn dùng JWT/publishable key và RLS. Service key chỉ trong đường upload đã kiểm permission và worker tin cậy; không dùng nó cho mọi truy vấn user.

## Elasticsearch và worker

Index local `shopbase-marketplace-v1` độc lập Amazon. Mapping strict, folded analyzer hỗ trợ chữ có/không dấu; chưa thêm synonym/dịch tên tiếng Anh. Setup local đã chạy `python3 scripts/configure-marketplace-elasticsearch.py`; khóa search read-only và worker write-only trên đúng index, không cluster/delete-index. Các file key 0600 ở data bị gitignore, backend chỉ nhận đường dẫn.

Outbox upsert trong cùng transaction sửa product/variant/shop status, coalesce version mới nhất. Claim giới hạn 20, lease hai phút, retry backoff. Worker gửi external_gte version; doc ẩn là tombstone `visible:false`, không physical delete để sự kiện rất cũ không resurrect. Search luôn filter visibility, DB hydrate lọc lại trạng thái. Total từ index có thể lệch khi outbox chưa chạy; không hứa snapshot count đồng bộ.

Worker không tự chạy nền nếu chưa cấu hình. Cấu hình môi trường tiến trình worker (URL/key là của môi trường đã review):

```text
SUPABASE_URL
MARKETPLACE_SERVICE_KEY_FILE
ELASTIC_URL
ELASTIC_CA_FILE
ELASTIC_MARKETPLACE_WORKER_KEY_FILE
```

Chạy một batch: `node scripts/marketplace-worker.mjs`; rebuild enqueue: thêm `--reindex`. Sau khi cấu hình, lên lịch mỗi phút để drain outbox/expire reservation. Script không tự đọc toàn bộ .env hoặc ghi nội dung đơn/địa chỉ vào log; chỉ in số indexed/failed. Chưa chạy worker với Supabase thật vì chưa có migration/credential; chưa kiểm crash giữa Storage upload/finalize hoặc cron thật.

## Dữ liệu thử và nghiệm thu

`scripts/prepare-course-seed.py --shop-a <UUID> --shop-b <UUID>` sinh sáu sản phẩm từ metadata sẵn có, giá VND và stock 20 là fixture khai báo riêng. Chỉ tạo file JSON/SQL trong `data/amazon-2023`, không kết nối DB. SQL cần hai shop đã duyệt, không tạo users/cấp quyền, seed lại không reset held stock. Files hiện dùng IDs **fixture test**, không được chạy nguyên lên cloud.

`node scripts/verify-course-seed.mjs` kiểm seed/reseed trong PGlite riêng, không ghi cloud. Quy trình cloud tiếp theo: review hai migration → apply đúng lần → cấu hình private service file → xác minh tài khoản thật/shop đã duyệt → regenerate seed với IDs thật trong môi trường course được cho phép → review/apply seed → worker → buyer A/B, seller A/B E2E.

Kiểm đã chạy: typecheck, backend/frontend build; **141 tests / 16 files đạt**, SQL scope/RLS/giá/idempotency/snapshot/hoàn kho/expiry/Storage policy, decoder thật, worker version/tombstone. `verify-course-seed.mjs` đạt với seed/reseed sáu sản phẩm/variants, giữ nguyên stock đã reserve. `verify-marketplace-elasticsearch.mjs` đã kiểm Elastic thật local: version 2 bị từ chối sau tombstone version 3, doc vẫn ẩn. Giữ tombstone fixture ẩn trong index local. Lint file frontend thay đổi không có lỗi, còn cảnh báo set-state-in-effect; frontend bundle trên 500 KB. Browser đã thấy điểm vào marketplace và trạng thái chưa cấu hình đúng; chưa có E2E login→đơn thật trên cloud.

**Giới hạn:** PGlite kiểm được transaction và trường hợp hai quote mua SKU cuối lần lượt, không thay cho test hai connection PostgreSQL đồng thời. Còn cần test race thật, rate limit đa chiều, quota vận hành, load, Storage thật, account A/B qua JWT, cron, backup/restore và audit độc lập trước kết luận hoàn thiện/vận hành. Không đánh dấu toàn M1/M2/M3 hoàn thành.
