# Nhập catalog đồ án vào Elasticsearch và Supabase

## Đã chạy trên máy

- `compose.search.yml`: Elasticsearch 9.5.4, single-node, persistent Docker volumes, giới hạn RAM 2 GB / JVM 512 MB. Cổng HTTPS chỉ bind `127.0.0.1:9200`; bật authentication, xác minh CA. Chứng chỉ nằm trong config directory để giữ entitlement checks của Elasticsearch.
- Password ngẫu nhiên tại `data/amazon-2023/.elasticsearch.password`, quyền file 0600; không in log, không đưa frontend/commit. Chứng chỉ CA công khai: `data/amazon-2023/elasticsearch-ca.crt`. Private keys nằm trong Docker certificate volume.
- Đã nhập 20.000 metadata vào index `shopbase-amazon-0dac845f97a1`; alias `shopbase-amazon-catalog`. Index khoảng 74.918.597 bytes lúc nhập; dung lượng thay đổi sau merge.
- Đã kiểm count, hash nguồn, search có/không dấu `điện tử` / `dien tu` và query tiếng Anh `kitchen`. Đây là smoke test có kết quả, chưa phải đánh giá chất lượng ranking/load test.
- Title giữ dấu + folded field; `suggest_text` dùng `search_as_you_type`. Danh mục tiếng Việt chỉ gồm năm nhãn nguồn; chưa dịch các tên sản phẩm. Giá USD lịch sử/null, không biến thành giá bán VND hoặc gán kho.

Khởi động lại và nhập lại:

```bash
sudo docker compose -f compose.search.yml up -d --wait --wait-timeout 300
sudo docker cp shopbase-search-elasticsearch-1:/usr/share/elasticsearch/config/certs/ca/ca.crt - | tar -xO > data/amazon-2023/elasticsearch-ca.crt
python3 -B scripts/import-amazon-elasticsearch.py
```

Importer chỉ kết nối HTTPS localhost với CA/mật khẩu đọc từ file riêng. Import theo lô 500, kiểm lỗi từng lô, ID ổn định chống trùng; index theo hash nguồn, chỉ chuyển alias sau khi đủ count. Không xóa index cũ hoặc sửa chỉ mục ngoài namespace đồ án. Không reset password file khi volume đã có dữ liệu; muốn rotate cần quy trình riêng.

## Supabase: đã nhập cloud (03/10/2026)

- Chủ dự án đã yêu cầu kiểm thử và nhập lên Supabase, sau đó yêu cầu tiếp tục. Đã áp dụng migration catalog một lần và nhập đủ 20.000 sản phẩm vào project `rbhqkpjvbnuhhfhwrhdo` (shopbase, main), dataset `amazon-2023-0dac845f97a1` qua SQL Editor quản trị.
- Mỗi danh mục có 4.000 sản phẩm; tổng 7.803 có giá USD lịch sử, 12.197 giá NULL. Giữ URL ảnh, không upload file ảnh vào Storage.
- Số đo trực tiếp trên cloud sau nhập: bảng products kèm index **27 MB**, toàn database **38 MB**. Số đo PGlite bên dưới thuộc môi trường khác.
- `scripts/verify-amazon-supabase.sql` đã chạy thành công trên cloud: count/price count đúng, cả hai bảng bật RLS; truy vấn bằng role anon/authenticated bị từ chối; service_role đọc được và không có INSERT/UPDATE/DELETE. Verification dùng transaction rollback, không ghi dữ liệu.
- Nhập theo lô 250 với upsert để tiếp tục an toàn sau ngắt kết nối. Dữ liệu JSON được mã hóa base64 trong SQL Editor rồi giải mã tại PostgreSQL để tránh bộ cảnh báo SQL nhầm nội dung sản phẩm thành câu lệnh.

- Migration mới: `supabase/migrations/202610020001_academic_catalog_import.sql` tạo schema `catalog_import` riêng, bảng dataset/products. Không thay bảng M1, không chạy lại migration M1, không tạo tài khoản/shop/kho/đơn.
- Hai bảng bật RLS; anon/authenticated không có schema/table grants. Service role chỉ được SELECT; nhập bằng kết nối quản trị đã được cho phép. Schema này không phải API catalog công khai và không phải sản phẩm đã duyệt để bán.
- `scripts/prepare-amazon-supabase.py` sinh `data/amazon-2023/import-supabase.sql`: transaction 20.000 sản phẩm, batch 250, string quoting an toàn, upsert theo dataset+ASIN, check count trước commit. Giá thiếu vẫn NULL.
- Đã chạy toàn bộ SQL hai lần trong PGlite PostgreSQL nhúng: 20.000 bản ghi, năm nhóm, không tăng count khi chạy lại. Bảng và index khoảng 54.968.320 bytes trong môi trường kiểm này; **không phải số đo trên Supabase cloud**.
- Test role thật trong harness: admin import/read được; anon/authenticated đọc/xóa bị từ chối; service_role đọc được, xóa bị từ chối; constraint giá âm/0/NaN bị từ chối.

Kiểm và chuẩn bị lại:

```bash
python3 -B scripts/prepare-amazon-supabase.py
node scripts/verify-amazon-sql.mjs
pnpm exec vitest run tests/integration/academic-catalog.test.ts
```

Sau khi chọn đúng môi trường Supabase và cấu hình kết nối PostgreSQL quản trị **trên máy**, dùng psql với cấu hình kết nối riêng (không dán secret vào chat/command history):

```bash
psql -X -v ON_ERROR_STOP=1 -f supabase/migrations/202610020001_academic_catalog_import.sql
psql -X -v ON_ERROR_STOP=1 -f data/amazon-2023/import-supabase.sql
```

Không chạy lệnh này trước khi kiểm môi trường đích. Migration catalog đã được áp dụng trên cloud, không chạy lại tại đó; SQL dữ liệu có thể chạy lại cho cùng dataset. Cloud đã áp dụng M1 và catalog qua SQL Editor; không tự chạy `db push` để tránh replay lịch sử chưa đồng bộ. Việc nhập vào main đã được chủ dự án ủy quyền trong phiên này.

Nguồn hướng dẫn: [Elastic Docker](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/install-elasticsearch-docker-basic), [Supabase local](https://supabase.com/docs/guides/local-development/cli/getting-started).

## Còn thiếu

Đã cấp key Elastic chỉ đọc và nối API/Home/chi tiết với dữ liệu nguồn Supabase; tìm kiếm/gợi ý hydrate ASIN từ DB. Hướng dẫn và kiểm thực tại CATALOG_API. Còn thiếu catalog bán hàng có visibility/shop/kho và outbox đồng bộ thay đổi PostgreSQL. Không đánh dấu M2 hoàn thành từ việc nhập fixture.
