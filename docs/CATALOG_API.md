# Catalog và Elasticsearch — tích hợp ngày 03/10/2026

Frontend Vite gọi API Next.js trên máy qua proxy `/api`. Trang chủ và chi tiết dùng 20.000 metadata Amazon đã nhập vào Supabase. Dataset DummyJSON vẫn còn cho giỏ/đơn cũ, nhưng không dùng cho catalog/search nữa.

Cập nhật D028: catalog công khai chỉ hiển thị **7.803 sản phẩm có giá > 0**. RPC danh sách/chi tiết/count và Elastic search/suggestions/sort cùng lọc giá; 12.197 bản ghi thiếu giá vẫn giữ trong nguồn. Migration bổ sung `202610030002_priced_catalog.sql` đã áp dụng cloud; không chỉnh migration cũ. Tên thẻ 16px desktop/14px mobile, tối đa hai dòng; tên chi tiết 20–26px.

## Luồng dữ liệu

- Danh mục, danh sách và chi tiết: Browser → `/api/v1/catalog/categories`, `/products`, `/products/:ASIN` → RPC Supabase → projection giới hạn của dataset `amazon-2023-0dac845f97a1`.
- Tìm kiếm/sắp xếp: Browser → `/api/v1/search` → Elasticsearch trả ASIN và thứ tự relevance → API lấy lại các ASIN từ Supabase → Browser. Bản ghi không còn trong DB bị bỏ khỏi kết quả.
- Gợi ý khi gõ: đợi 250 ms, gọi `/search/suggestions`; `search_as_you_type` tìm tối đa sáu sản phẩm, API xác nhận ASIN với DB trước khi trả. Hủy request cũ khi query/category đổi.
- PostgreSQL lưu dữ liệu chính. Elasticsearch là chỉ mục tăng tốc tìm kiếm. Metadata được validate bằng Zod ở server; client không gửi DSL Elasticsearch.

## API đã triển khai

| GET path | Tham số / kết quả |
|---|---|
| `/api/v1/catalog/categories` | `{items:[{id,name,products}]}` |
| `/api/v1/products` | `category`, `after` (ASIN cuối), `limit` 1–40; `{items,total,next_after,has_more,engine:"supabase"}` |
| `/api/v1/products/:ASIN` | Chi tiết từ DB; ASIN đúng 10 ký tự A–Z/0–9; 404 khi không có |
| `/api/v1/search` | `q` tối đa 120 ký tự, `category`, `sort` relevance/price_asc/price_desc/rating, `page` 1–80, `limit` 1–40 |
| `/api/v1/search/suggestions` | `q`, `category`; tối đa 6 `{id,label,kind}` |

Search có `engine:"elasticsearch"`, `total_source:"index"`: total lấy từ index, có thể lệch nếu index chưa đồng bộ DB; items luôn được đọc lại từ DB. Bản ghi stale bị loại có thể khiến trang ngắn. Phân trang sâu bị giới hạn ở 80 trang để chặn truy vấn quá nặng; chưa dùng search_after. Danh sách không query/sort dùng con trỏ ASIN để duyệt cả dataset.

DTO chỉ gồm id/title/category/category_name_vi/description/features/image_urls/price_usd/currency/store_name/average_rating. Tên và mô tả phần lớn bằng tiếng Anh; hỗ trợ có/không dấu hiện áp dụng tốt cho năm nhãn danh mục tiếng Việt. Chưa có dịch tên hoặc synonym `nước` → `water`.

## Quyền và cấu hình

Migration `202610030001_catalog_read_api.sql` đã áp dụng một lần trên cloud shopbase main. Hai RPC public chỉ đọc metadata công khai của một dataset cố định, không nhận tên bảng/schema/SQL. SECURITY DEFINER có search_path rỗng và object qualified; không grant SELECT bảng gốc cho anon/authenticated, không tắt RLS. Không dùng service-role key trong frontend/backend catalog. Không chạy lại migration đã áp dụng; đồng bộ history trước db push.

Backend Elasticsearch dùng API key riêng có quyền read trên alias/index catalog, không có quyền write/cluster admin. HTTPS xác minh CA, deadline HTTP 4 giây và query 2 giây. Không truyền key/password Elastic ra browser. Khi Elastic chưa cấu hình/lỗi, search trả 503 SEARCH_UNAVAILABLE; danh sách/chi tiết Supabase vẫn dùng được. Chưa có fallback relevance PostgreSQL.

Cấu hình `apps/web/.env.local` trên máy, không dán secret vào chat:

- SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, APP_ORIGIN như M1.
- ELASTIC_URL=https://localhost:9200
- ELASTIC_SEARCH_KEY_FILE: đường dẫn tuyệt đối đến file khóa chỉ đọc.
- ELASTIC_CA_FILE: đường dẫn tuyệt đối đến CA.

`scripts/configure-elasticsearch-search.py` đã tạo file key 0600 trong thư mục dataset bị gitignore, xác minh read=true/write=false và ghi đường dẫn vào env backend. Không đổi dependency/lockfile.

Chạy:

```bash
sudo docker compose -f compose.search.yml up -d --wait
pnpm dev
```

Terminal khác:

```bash
cd frontend
pnpm dev
```

Mở http://localhost:5175. Backend là http://localhost:3000. Không tự deploy Vercel; bản Vercel hiện chưa có tích hợp này. Khi deploy cần backend có thể truy cập một Elasticsearch HTTPS từ môi trường đó; localhost Docker trên laptop không truy cập được từ Vercel.

## Kiểm chứng

- Typecheck, backend build, frontend build đạt. 122 kiểm thử backend/unit/integration đạt.
- Sau khi bổ sung deadline HTTP và test báo lỗi khi Elastic ngừng hoạt động, typecheck và bốn test catalog chạy lại đạt; không dùng fixture làm kết quả thay thế.
- RPC PostgreSQL nhúng kiểm public metadata allow, source table read/delete deny, dataset khác không bị lộ, bounds/ASIN/category sai bị từ chối.
- `node scripts/verify-catalog-api.mjs` và `node scripts/verify-catalog-api.mjs http://localhost:5175` đã chạy với Supabase cloud + Elastic local: 20.000/5 nhóm, chi tiết thật, phân trang không trùng, kitchen 839, điện tử/dien tu cùng 4.000, sáu gợi ý, giá tăng đúng, validation/404 đúng.
- Browser đã thấy danh mục/catalog và gợi ý khi gõ; sản phẩm thật có gallery từ Supabase.

## Giới hạn nghiệp vụ

Giá giữ USD lịch sử hoặc NULL. Chưa có kho/SKU/shop đã duyệt/đơn thật; nút mua và giỏ trên sản phẩm nguồn bị vô hiệu hóa. Không suy ra giá bán VND, variant hay tồn kho từ metadata. Rating tổng hợp từ nguồn, không tạo bài review.

Index hiện là snapshot của cùng dataset đã nhập, chưa có outbox/indexer đồng bộ thay đổi PostgreSQL. Khi triển khai người bán sửa/publish sản phẩm phải thêm trạng thái visibility, outbox/version và retry/tombstone trước nghiệm thu M2. Không đánh dấu M2/M3 hoàn thành từ tích hợp catalog nguồn.

Nguồn: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [Elastic API key](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-security-grant-api-key).

## Ngôn ngữ và giá hiển thị (03/10/2026)

Cài đặt có Tiếng Việt/English, lưu `shopbase-language` trên trình duyệt và đồng bộ giữa các tab; mặc định tiếng Việt. Catalog list/detail/search/suggestions nhận `language=vi|en`, mặc định API vẫn `en` để giữ hợp đồng cũ. Các trường nguồn `title`, `price_usd`, `currency` luôn giữ nguyên. `display_title`, `display_price`, `display_currency` dành riêng cho hiển thị; không dùng làm giá thanh toán. Marketplace/đơn shop vẫn dùng giá VND do server quyết định.

Tiếng Việt dùng bản dịch tên được tạo trước trên CPU và đổi USD → VND, làm tròn đến đồng. Trang chi tiết giữ tên gốc để đối chiếu. English dùng tên/giá USD gốc. Nhãn Cài đặt, điều hướng, Home/search/detail có bản tiếng Anh; các màn nghiệp vụ tài khoản/shop/checkout còn tiếng Việt. Không dịch mô tả/features hoặc các bài review trong lát cắt này.

Nguồn tỷ giá: https://www.exchangerate-api.com/docs/free, endpoint USD cố định; cập nhật hằng ngày, refresh theo thời điểm cập nhật tiếp theo của provider và cache tối đa 24 giờ, gộp request đồng thời, timeout 5 giây. Validate USD/VND/timestamp; từ chối snapshot quá 48 giờ hoặc tương lai, lỗi giữ USD, retry sau 60 giây. `/catalog/presentation` cung cấp thông tin hiển thị/ngày nguồn; UI chỉ giữ liên kết nguồn ở chân trang, không hiển thị dòng tỷ giá/ngày cập nhật hoặc thông báo phụ. Không hardcode tỷ giá hoặc coi giá nguồn lịch sử là giá bán hiện hành.

Bản dịch nằm trong file server `CATALOG_TRANSLATIONS_FILE`, không sửa schema/cloud/index. Mỗi hàng `{id, original, vi}`; server chỉ dùng nếu `original` khớp tên hiện tại, bỏ file lỗi và giữ tiếng Anh. Gợi ý hiển thị tên dịch nhưng tìm bằng `query` gốc để tương thích index tiếng Anh hiện có. Tìm kiếm từ khóa tiếng Việt trong tên dịch chưa được index.

Môi trường dịch riêng trong `data/amazon-2023/translation-venv`, dependency tại `scripts/catalog-translation-requirements.txt`; không đổi stack/pnpm lockfile. Chạy `scripts/setup-catalog-translator.py` với Python môi trường đó để tải model data từ VietAI/envit5-translation trên Hugging Face (revision pin, chỉ model data, không remote code) và convert CTranslate2 int8. Sau đó chạy `scripts/translate-catalog-titles.py`; có `--limit` để kiểm mẫu, checkpoint nguyên tử từng batch, chạy lại tiếp tục những tên còn thiếu. File lớn/cache/model/venv đều trong dataset bị gitignore. Cài PyTorch bản CPU trong môi trường dịch trước (`uv pip install --python data/amazon-2023/translation-venv/bin/python torch==2.14.1+cpu --index https://download.pytorch.org/whl/cpu`), rồi cài `scripts/catalog-translation-requirements.txt`. Mô hình https://huggingface.co/VietAI/envit5-translation dùng giấy phép OpenRAIL; model source và hash lưu trong source.json. Bản dịch máy cần rà chất lượng, không bảo đảm đúng mọi thương hiệu/thuật ngữ. Chỉ bảo toàn chắc chắn thương hiệu đã có và khớp trong metadata, mã/thông số nhận diện được; tên nguồn khác vẫn cần đối chiếu ở chi tiết.

Kiểm API local: `node scripts/verify-catalog-localization.mjs` (mặc định cổng 3000; `CATALOG_VERIFY_ORIGIN` để chọn Vite proxy 5175). Kiểm cùng ASIN/thứ tự, USD nguồn không đổi, giá VND đúng tỷ giá, tên dịch thực và chi tiết. Không tạo tài khoản/đơn hoặc ghi cloud. Typecheck/unit/integration/build vẫn dùng scripts hiện có của dự án.

Nghiệm thu local của lát cắt: đã chuẩn bị 7.803 hàng tên hiển thị, 7.641 tên khác nguồn và 162 tên giữ nguyên; không xem đây là bản dịch đã biên tập. `python3 scripts/verify-catalog-titles.py` xác minh ASIN/tên nguồn, hash dataset không đổi, mã/thông số số và thương hiệu khớp như một tên riêng trong metadata. Kiểm API 24 sản phẩm và chi tiết đạt, tiếng Anh giữ USD và tiếng Việt quy đổi VND đúng; trình duyệt đã kiểm nhớ ngôn ngữ sau reload và chi tiết 390px. 96 unit + 52 integration đạt qua các lượt kiểm liên quan, typecheck và hai build đạt; lint không lỗi, còn cảnh báo effect/Date/unused có sẵn và bundle >500 KB. Chưa deploy Vercel hoặc dịch toàn bộ màn tài khoản/người bán/đơn hàng.
