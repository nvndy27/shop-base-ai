# Roadmap quản lý bán hàng theo requirements CSDL

Cập nhật 29/10/2026 theo yêu cầu chủ dự án. Chuẩn nghiệm thu: [REQUIREMENTS](REQUIREMENTS.md), gồm tám bảng nghiệp vụ và KT01–KT28. Caption AI được loại khỏi phạm vi hiện tại. Chat, marketplace nhiều shop, thanh toán online, voucher, vận chuyển và payout không thuộc kế hoạch nghiệm thu này; giữ mã đã có, không phát triển tiếp nếu chưa được giao.

Roadmap sàn cũ và bằng chứng lịch sử được giữ tại [bản lưu](reference/ROADMAP-marketplace-20261012.md). Không quy đổi trạng thái M0–M7 thành hoàn thành các mốc mới.

## Trạng thái xuất phát

- Giữ pnpm, Next.js BFF, Vite/React, TypeScript/Zod, Supabase PostgreSQL/Auth và Elasticsearch; không đổi stack, lockfile hoặc tái tạo ứng dụng.
- Tái sử dụng cách validate, RPC transaction, khóa hàng, idempotency, outbox/retry và các component form/danh sách. Nghiệp vụ cũ chỉ tái sử dụng sau khi kiểm chứng khớp requirements.
- Chưa có customers độc lập tài khoản, warehouses hay inventory theo kho–sản phẩm. Danh mục marketplace là nhóm cố định; SKU unique theo product, chưa toàn công ty.
- Quote/giỏ không phải đơn DRAFT. Luồng cũ giữ kho khi đặt và giảm on_hand khi shipped, khác yêu cầu trừ tồn khi CONFIRMED. Không gắn nhãn lại trạng thái cũ để coi là đạt.
- Đã kiểm tra trong lượt rà soát 29/10: typecheck, 154 unit, 76 integration, backend build và frontend build đạt; frontend có cảnh báo bundle >500 KB. Đây là kiểm tra mã sàn hiện có, không phải kết quả KT01–KT28. Chưa chạy nghiệm thu dịch vụ thật trong lượt lập roadmap.
- Các mốc C1–C6 bên dưới đều chưa hoàn thành. C0 chỉ hoàn thành phần baseline tài liệu; thiết kế triển khai còn chờ lát cắt tiếp theo.

## Phương án triển khai đề xuất

Bổ sung module bán hàng nội bộ trong cùng repository, đề xuất schema `sales`, API `/api/v1/sales/*` và giao diện `/internal/*`; tên chính thức được chốt ở C0 sau khi rà mã. Tách bảng và luồng nội bộ khỏi `commerce` để không đổi nghĩa đơn, tồn và dữ liệu marketplace đang có. Không nhân bản Auth hoặc tạo app mới. Không tự chuyển dữ liệu cũ hay gán sản phẩm nguồn thành hàng có tồn.

Tám bảng nghiệp vụ trong module mới: categories, products, customers, warehouses, inventory, orders, order_items, stock_movements. Bảng kỹ thuật outbox/quyền nếu cần không thay thế tám bảng này và phải giải thích riêng. Thiết kế và migration bổ sung; không sửa migration đã áp dụng, không reset dữ liệu. Khi cần rollback, tắt điểm vào module mới và forward-fix; không xóa lịch sử đơn hoặc kho.

## Các mốc và điều kiện nghiệm thu

| Mốc | Kết quả cần bàn giao | Điều kiện hoàn thành | Ca nghiệm thu |
|---|---|---|---|
| C0 — Chốt baseline và thiết kế | Requirements nguồn, bản đồ gap, ERD/DDL đề xuất, API và ma trận quyền tối thiểu | Chốt đường dẫn/module, kiểu tiền/giới hạn tổng, cách so reason khi retry, kế hoạch migration và chính sách index nội bộ; không còn xung đột chưa được ghi nhận | Danh sách đủ KT01–KT28 |
| C1 — Dữ liệu nền | Migration và API danh mục, sản phẩm, khách, kho; chuẩn hóa dùng chung; dữ liệu mẫu có khai báo | SKU/mã/phone UNIQUE ở DB; CRUD và ngừng/xóa đúng tham chiếu; khách không cần Auth; RLS/grants và allow/deny đạt | KT01–KT06, phần dữ liệu nền KT21–KT22 |
| C2 — Tồn theo kho và lịch sử | Phân bổ tồn 0, nhập/xuất/điều chỉnh, tra cứu biến động | Khóa cặp kho–sản phẩm; tồn và ledger cùng transaction; request_key chống lặp/xung đột; lịch sử không sửa/xóa; kho ngừng bị chặn | KT20, KT27; phần kho KT21–KT22, chuẩn bị KT28 |
| C3 — Đơn nháp và snapshot | CRUD đơn DRAFT và dòng, chọn khách/kho, sửa người nhận, chủ động lấy giá mới | Ít nhất một dòng, không trùng sản phẩm; nháp không giữ/trừ kho; snapshot không tự đổi theo dữ liệu nguồn; tổng tính từ dòng, không lưu cột tổng | KT07–KT08, KT16–KT17, KT26; xóa nháp KT21 |
| C4 — Xác nhận, hoàn tất và hủy | State machine và transaction trừ/hoàn tồn, SALE/CANCEL | CONFIRMED trừ đúng kho một lần; COMPLETED không trừ thêm; hủy xác nhận hoàn một lần; khóa nội dung sau xác nhận; rollback toàn bộ và cạnh tranh đúng trên PostgreSQL thật | KT09–KT15, KT18–KT19, KT28; hoàn tất KT16, KT21–KT22 |
| C5 — Elasticsearch nội bộ | Ba index sản phẩm/khách/đơn, query, outbox/retry, lệnh nạp và nạp lại | Ưu tiên mã chính xác, phone chuẩn hóa, phân trang, detail đọc DB; ES lỗi không hủy nghiệp vụ; reindex hai lần không trùng/stale; kiểm quyền ở backend | KT23–KT25 |
| C6 — Giao diện và nghiệm thu tổng | Màn nội bộ đầy đủ, E2E và hướng dẫn khởi tạo/demo/khôi phục index | Chạy độc lập đủ 28 ca và lưu actual/expected; UI có loading/error/empty; không lộ PII/secret; không dùng mock thành công để nghiệm thu | KT01–KT28 đầy đủ |

C1 → C2 → C3 → C4 → C5 → C6 là thứ tự ưu tiên. Mỗi C1–C5 bổ sung giao diện tối thiểu cho phần vừa làm để kiểm tra sớm; C6 nối luồng và hoàn thiện, không dồn toàn bộ UI đến cuối. Không cần hoàn thành chat, AI, thanh toán hoặc onboarding shop trước C1.

## Những quy tắc phải giữ khi triển khai

- Giá VND nguyên, không âm, đúng NUMERIC(14,0); không tiếp tục giới hạn giá marketplace 1.000–100.000.000 như yêu cầu mới. Số lượng nguyên, kiểm giới hạn và tràn tổng ở server.
- Khóa chính ghép của inventory là warehouse_id + product_id; order_items là order_id + product_id. FK lịch sử RESTRICT/NO ACTION; không cascade xóa lịch sử.
- Đơn DRAFT chưa giữ kho. Xác nhận kiểm lại khách, kho, sản phẩm và danh mục active; thiếu một dòng rollback cả đơn. Sau xác nhận khóa khách/người nhận/kho/dòng/giá.
- SALE/CANCEL liên kết đúng kho, sản phẩm, lượng của đơn; unique có điều kiện theo order/product/type, request_key riêng mỗi biến động. Hủy nháp không tạo CANCEL.
- Mọi thao tác kho dùng cùng chiến lược khóa, thứ tự khóa ổn định; retry không tạo side effect mới. Thử lỗi giữa các bước để chứng minh rollback, không chỉ kiểm kết quả thành công.
- Tổng đơn và tên sản phẩm index lấy từ chi tiết snapshot, không lấy dữ liệu sản phẩm hiện tại. Elasticsearch không quyết định giá, tồn hoặc trạng thái đơn.
- Khách hàng nghiệp vụ không cần tài khoản. Giữ bảo vệ server/RLS cho dữ liệu riêng hiện có; yêu cầu không bắt buộc login không có nghĩa mở API nội bộ hoặc tắt RLS.

## Điểm cần giải quyết trước phần phụ thuộc

1. **Index riêng tư:** requirements yêu cầu tìm khách/đơn nội bộ, còn AGENTS hiện giới hạn ES ở dữ liệu công khai. Đề xuất index và credentials riêng, chỉ BFF được truy cập, không chứa chat/token. Trước C5 cần chủ dự án cho phép và cập nhật quy tắc nguồn tương ứng; tài liệu này chưa sửa AGENTS và chưa cho phép đưa PII vào ES. C1–C4 vẫn tiến hành được.
2. **Giới hạn số và retry:** đề xuất số lượng theo INTEGER với trần nghiệp vụ rõ ràng, tổng tính chính xác và chặn vượt ngưỡng đã chốt. Đề xuất reason là một phần nội dung so sánh idempotency sau chuẩn hóa; đây là lựa chọn triển khai cần ghi quyết định ở C0, không sửa nghĩa requirements nguồn.
3. **Môi trường:** dùng Supabase local/dev riêng. Rà trạng thái và history trước apply; thiếu Docker/credential thì làm schema/contracts/test độc lập, ghi rõ phần tích hợp chưa kiểm chứng. Không chạy runner cũ tạo đơn marketplace để chứng minh luồng sales đã đạt.

## Lát cắt nên thực hiện ngay

**C0 kỹ thuật + C1 backend:** rà hướng dẫn apps/web, thiết kế tám bảng và quyền, chốt hợp đồng chuẩn hóa; thêm migration bổ sung cho bốn bảng danh mục/sản phẩm/khách/kho và API CRUD, kèm kiểm UNIQUE đồng thời, validation và allow/deny. Kết thúc bằng bằng chứng KT01–KT06 và phần nền của KT21–KT22. Chưa triển khai toàn bộ roadmap trong cùng một nhiệm vụ.

## Điều kiện hoàn thành

Mỗi mốc ghi rõ mã đã có, test đã chạy và môi trường kiểm tra. Tests PGlite không thay test nhiều connection PostgreSQL; build không thay test quyền. Mốc chỉ hoàn thành khi đạt điều kiện trong bảng; ca chưa chạy phải ghi chưa kiểm chứng. Nghiệm thu đồ án khác điều kiện production: deploy, thao tác dữ liệu thật và thu tiền vẫn cần ủy quyền riêng.


## Tiến độ lát cắt 29/10/2026 — C0 kỹ thuật + C1 backend

- C0 **hoàn thành một phần**: đã đối chiếu requirements, chốt module/schema/API, thiết kế tám bảng/quan hệ, quyền, limits và retry; xem [SALES_DESIGN](SALES_DESIGN.md). Còn chờ quyết định index riêng tư xung đột AGENTS trước C5.
- C1 **đã triển khai, chưa hoàn thành nghiệm thu**: migration bổ sung bốn bảng nền, contracts/RPC/API CRUD/pagination/active/delete và test cục bộ. KT01–KT06 phần nền và KT21–KT22 phần category/active có bằng chứng PGlite/HTTP; concurrency PostgreSQL nhiều connection và Supabase thật chưa kiểm do Docker socket không truy cập được. Không gộp phần số lượng đơn/lịch sử chưa tồn tại vào kết quả đạt.
- Bước tiếp theo: chạy migration trên dev PostgreSQL/Supabase được phép sau rà history, kiểm allow/deny qua Auth/PostgREST và race hai connection cho code/SKU/phone; hoàn tất C1 trước khi mở C2. Không tự triển khai C2–C6 trong lượt này. Chi tiết kết quả [TESTING](TESTING.md), quyết định D040.
