# Thiết kế C0 và backend C1 — 29/10/2026

Trạng thái: C0 một phần (chờ quyết định index riêng tư); C1 có mã và bằng chứng cục bộ, chưa nghiệm thu PostgreSQL nhiều connection/Supabase. REQUIREMENTS là nguồn nghiệp vụ, không thay đổi. Những trần số và quyền dưới đây là lựa chọn triển khai.

## Đối chiếu và tái sử dụng

| Requirements | Mã cũ / khoảng cách | Quyết định và mốc |
|---|---|---|
| 1, 1.1–1.3: một công ty, nhân viên nội bộ | commerce theo shop; Auth Supabase có sẵn | Cùng repository, schema sales; bảng kỹ thuật staff do DBA cấp, không tự đăng ký quyền |
| 2.1: danh mục, SKU toàn công ty, giá nguyên | nhóm cố định; SKU commerce theo sản phẩm | Bảng mới categories/products C1; không chuyển catalog cũ |
| 2.2: khách không cần tài khoản | profiles gắn Auth không phù hợp | customers không FK auth.users, C1 |
| 2.3, 3.1–3.2: nháp, snapshot, xác nhận trừ tồn, hủy hoàn | quote/reservation và trạng thái marketplace khác nghĩa | orders/order_items mới C3–C4; không tái dùng state machine cũ |
| 2.4: nhiều kho, ledger, retry, transaction | commerce có mẫu khóa hàng/RPC nhưng không có cặp tồn theo kho | inventory/stock_movements C2; kiểm cạnh tranh cùng khóa C4 |
| 2.5, 6: tìm kiếm nội bộ | catalog ES công khai không phù hợp PII | C5 chờ xử lý xung đột AGENTS; không index khách/đơn ở C1 |
| 3.3: chuẩn hóa và không lưu phần lỗi | Zod, bounded JSON reader, AppError có sẵn | tái sử dụng parseBody/auth/userClient; hợp đồng sales riêng; DB trigger/constraints/RPC C1 |
| 4–5: tám bảng và quan hệ | bảng commerce có nghĩa khác | thiết kế dưới đây; chỉ bốn bảng nền được migrate |
| 7: dữ liệu mẫu/chạy/index | scripts cũ tạo dữ liệu marketplace | fixture test sales khai báo trong integration; chưa có seed vận hành/index, thuộc C5–C6 |
| 8: KT01–KT28 | test cũ không chứng minh sales | KT01–06/phần nền 21–22 C1; KT20/27 C2; KT07–08/16–17/26 C3; KT09–19/28 C4; KT23–25 C5; toàn bộ C6 |

## Thiết kế quan hệ, kiểu và vòng đời

Tên trường và độ dài giữ nguyên mục 4 REQUIREMENTS; bảng sau chốt thêm constraint/index/vòng đời. Mọi FK dưới đây NOT NULL trừ stock_movements.order_id. UUID tự sinh gen_random_uuid(); thời gian TIMESTAMPTZ do DB cấp. Mã chuẩn uppercase `[A-Z0-9][A-Z0-9_-]*`, tên/địa chỉ/đơn vị bắt buộc NFC và gộp khoảng trắng. Description/note trim giữ xuống dòng, trống thành NULL; email tùy chọn NULL, không UNIQUE. Tất cả mã/SKU và customers.phone UNIQUE cả khi inactive.

| Bảng | Cột và khóa | Constraint và index / xóa |
|---|---|---|
| categories | id UUID PK; code VARCHAR(20) UNIQUE; name VARCHAR(100); description TEXT NULL; is_active BOOLEAN default true | created_at/updated_at thêm cho phân trang/audit; RESTRICT khi còn products |
| products | id UUID PK; sku VARCHAR(40) UNIQUE; category_id UUID FK categories; name VARCHAR(200); description TEXT NULL; unit VARCHAR(30); current_price NUMERIC(14,0); is_active true; created_at/updated_at | price 0..99999999999999; index category_id; FK RESTRICT; không gán mới hoặc đổi sang category inactive; C2/C3 thêm FK chặn xóa khi có inventory/items |
| customers | id UUID PK; code VARCHAR(30) UNIQUE bất biến; full_name VARCHAR(150); phone VARCHAR(20) UNIQUE; email VARCHAR(254) NULL; address VARCHAR(300); is_active true; created_at/updated_at | phone canonical +84 và 9 số, số đầu khác 0; không quan hệ Auth; C3 FK orders RESTRICT |
| warehouses | id UUID PK; code VARCHAR(20) UNIQUE; name VARCHAR(100); address VARCHAR(300); is_active true; created_at/updated_at | C1 chưa có tồn/đơn nên cho ngừng/xóa; C2/C3 thêm FK RESTRICT và guard ngừng khi tồn khác 0 hoặc đơn DRAFT/CONFIRMED |
| inventory (C2) | PK (warehouse_id,product_id), cả hai UUID FK; quantity INTEGER default 0; updated_at | CHECK 0..2147483647; FK RESTRICT; index product_id; chỉ RPC ghi; xóa khi zero và không ledger |
| orders (C3–C4) | id UUID PK; code VARCHAR(30) UNIQUE; customer_id FK; warehouse_id FK; status VARCHAR(20) default DRAFT; placed_at/updated_at; confirmed_at/completed_at/cancelled_at NULL; recipient_name VARCHAR(150), recipient_phone VARCHAR(20), shipping_address VARCHAR(300); note VARCHAR(500) NULL | FK RESTRICT; index customer_id, warehouse_id/status, placed_at/id, status/placed_at. Không lưu tổng. Chỉ xóa DRAFT bằng RPC; xóa dòng trước trong transaction, không cascade lịch sử |
| order_items (C3) | PK (order_id,product_id), cả hai UUID FK RESTRICT; product_name_at_order VARCHAR(200); quantity INTEGER; unit_price NUMERIC(14,0) | quantity 1..1000000; price như products; index product_id. Deferred constraint trigger bảo đảm đơn có ít nhất 1 dòng và tổng hợp lệ; khóa nội dung ngay CONFIRMED |
| stock_movements (C2/C4) | id UUID PK; warehouse_id/product_id FK ghép inventory; order_id UUID NULL FK orders; movement_type VARCHAR(20); quantity_delta INTEGER; reason VARCHAR(300); request_key UUID UNIQUE; occurred_at | FK RESTRICT; delta khác 0; IN/CANCEL >0, OUT/SALE <0; ADJUSTMENT hai dấu. order_id chỉ bắt buộc cho SALE/CANCEL, loại khác NULL; partial UNIQUE(order_id,product_id,movement_type) WHERE type IN SALE/CANCEL. Index warehouse/product/occurred_at, order_id. Không UPDATE/DELETE; sửa bằng bút toán bù |

C1 bốn bảng đều có index (created_at,id), default is_active true và timestamps; không cho client ghi id/timestamp/status vào create/update. FK thực có ở C1 chỉ products.category_id. Không tuyên bố FK đơn/lịch sử đã kiểm khi chưa có bảng.

C2–C4 phải thêm guard ngừng kho trong cùng migration với bảng phụ thuộc. Các thao tác phân bổ, tạo nháp và chuyển trạng thái phải khóa kho trước; ngừng kho khóa cùng hàng rồi kiểm tồn/đơn. Các mutation cùng khóa hàng inventory theo thứ tự warehouse_id/product_id ổn định. Xác nhận khóa đơn, kiểm active khách/kho/sản phẩm/category, kiểm tất cả dòng; trừ tồn + SALE + trạng thái cùng transaction. Hủy từ DRAFT không ledger; CONFIRMED hoàn kho gốc + CANCEL một lần kể cả dữ liệu đã inactive; COMPLETED không hủy. CANCEL phải có SALE khớp kho/sản phẩm/lượng, kiểm trong RPC và deferred trigger, không chỉ FK đơn. Snapshot tên/giá/người nhận không theo cập nhật nguồn; đổi khách nháp lấy lại người nhận, lấy giá mới chỉ qua hành động rõ ràng.

CHECK trạng thái/thời điểm: DRAFT cả ba NULL; CONFIRMED chỉ confirmed_at; COMPLETED confirmed_at và completed_at; CANCELLED cancelled_at, confirmed_at tùy đã xác nhận, completed_at NULL. Mọi thời điểm >= placed_at; completed/cancelled >= confirmed nếu có. Không mở lại đơn. Trạng thái, thời điểm và snapshot do RPC quyết định.

Lựa chọn triển khai C0: lượng mua <=1.000.000/dòng; tồn <=2147483647; delta trong INTEGER khác 0 (không nhận -2147483648 để tránh abs overflow); tối đa 1.000 dòng/đơn. Tổng đơn <=99999999999999 VND, tính NUMERIC hoặc BigInt, không dùng cộng float; trả tổng dạng decimal string. KT06 phần lượng ở C1 mới kiểm schema, chưa kiểm lưu đơn. Retry thủ công so kho, sản phẩm, loại, delta và reason sau NFC, trim/gộp khoảng trắng, phân biệt hoa thường; khác reason cũng 409. Khóa SALE/CANCEL do server cấp riêng từng dòng. Request key UNIQUE toàn ledger; khóa đã dùng không tái tạo side effect. Chọn các giới hạn này để bảo đảm tính toán có kiểm soát, không phải nội dung bổ sung vào requirements nguồn.

## Quyền và triển khai

Supabase Auth xác minh token bằng getUser; JWT người dùng truyền đến public.sales_api. Bảng sales.staff là nguồn quyền do DBA quản trị ngoài API, FK auth.users RESTRICT, role manager/sales/warehouse và is_active. Không có staff ban đầu, không tự cấp quyền bằng metadata, không kế thừa chủ shop. Manager đọc/ghi cả bốn nhóm. Sales đọc cả bốn và ghi customers. Warehouse chỉ đọc bốn nhóm ở C1; thao tác tồn chờ C2. Đây là quyền tối thiểu cho lát cắt, chưa có endpoint quản trị staff.

RLS bật mọi bảng, staff không policy/grant người dùng; bảng nền SELECT có policy staff; không grant DML. RPC SECURITY DEFINER set search_path rỗng, allowlist bảng/cột/op và kiểm quyền trong DB trước SQL động, grant EXECUTE duy nhất authenticated. Trigger validate không grant EXECUTE. Anon không usage sales hoặc EXECUTE sales_api; authenticated không có staff/đã thu hồi không đọc dữ liệu. Các grants mặc định public được revoke rõ ràng. Server kiểm Auth, schema, Origin; DB kiểm quyền độc lập, không tin role/status từ body.

Migration 202610290001 bổ sung riêng, không sửa history cũ. Chỉ apply sau rà history trên môi trường dev được chọn; chưa áp dụng cloud/local Supabase ở lượt này. Khôi phục bằng tắt routing sales/thu hồi EXECUTE rồi forward-fix; không drop dữ liệu. Không chứa credential mới, không thay cấu hình production. Tắt điểm vào không thay quyền dữ liệu marketplace.

Chưa giải quyết quyền index PII: AGENTS chỉ cho dữ liệu công khai; REQUIREMENTS yêu cầu khách/đơn riêng tư. Chờ chủ dự án quyết định trước C5, C0 chỉ hoàn thành một phần. Không sửa AGENTS, không tạo index PII. Không có UI, payment, AI, chat hoặc triển khai C2–C6 trong lát cắt này.

## Vận hành dev và nghiệm thu còn lại

Không tự chạy migration trên DB marketplace đã có history chưa đồng bộ. Với dev riêng được phép, review/apply migration bổ sung bằng quy trình migration hiện có sau khi kiểm history. DBA cấp staff bằng SQL với UUID tài khoản dev đã xác minh: `INSERT INTO sales.staff(user_id,role) VALUES (<uuid-dev>, 'manager');` (thay placeholder bằng SQL parameter/literal UUID hợp lệ; không dùng metadata). Không cấp tài khoản production từ test. Cấu hình SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY/APP_ORIGIN tại môi trường backend theo README; không cần service-role key.

Để kết thúc C1 còn phải dùng hai connection PostgreSQL độc lập cùng gửi create code/SKU/phone đã chuẩn hóa (hai customer code khác nhau khi thử phone), đối chiếu count=1 và SQLSTATE 23505/HTTP409, thử sửa giữ giá trị chính nó; thử Auth/JWT hợp lệ, staff sai role/inactive/không staff/anon qua PostgREST. Chạy trên DB dev biệt lập, không reset hoặc sửa dữ liệu thật. Khi đủ bằng chứng mới cập nhật trạng thái C1; KT06 phần đơn và KT21–22 phần tồn/đơn tiếp tục theo C2–C4.
