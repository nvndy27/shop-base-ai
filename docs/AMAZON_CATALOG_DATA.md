# Catalog Amazon cho dự án môn học

Đã tải mẫu **20.000 metadata sản phẩm** từ Amazon Reviews 2023 / McAuley Lab. Đây là một phần của bộ nguồn, không phải toàn bộ Amazon Reviews 2023, không phải mẫu ngẫu nhiên.

## Tệp trên máy

- `data/amazon-2023/products.jsonl`: mỗi dòng là một sản phẩm; 29.404.719 bytes (khoảng 29,4 MB).
- `data/amazon-2023/manifest.json`: URL nguồn theo nhóm, thời gian, số bản ghi đã đọc, số sản phẩm thiếu giá và SHA-256 của file đầu ra.
- `scripts/download-amazon-catalog.py`: tải gzip theo luồng và dừng khi đủ 4.000 sản phẩm hợp lệ/nhóm; không cần cài dependency hoặc chạy loading script của dataset.

Thư mục dữ liệu lớn được bỏ qua trong `.gitignore`; không đưa vào bundle frontend.

| Nhóm nguồn | Nhãn tiếng Việt | Sản phẩm | Có giá USD |
|---|---|---:|---:|
| All_Beauty | Mỹ phẩm | 4.000 | 743 |
| Electronics | Điện tử | 4.000 | 1.717 |
| Cell_Phones_and_Accessories | Điện thoại và phụ kiện | 4.000 | 1.485 |
| Home_and_Kitchen | Nhà cửa và đồ bếp | 4.000 | 2.056 |
| Grocery_and_Gourmet_Food | Thực phẩm và đồ uống | 4.000 | 1.802 |

## Nội dung và giới hạn

Nguồn chính thức: https://amazon-reviews-2023.github.io/ và https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023. Tải liên kết `meta`, không tải `review`. Ghi nhận McAuley Lab; bài giới thiệu: Hou et al. (2024), *Bridging Language and Items for Retrieval and Recommendation*. Không suy ra quyền khai thác thương mại ảnh/nhãn hiệu từ việc dataset được công bố.

- Giữ mã `parent_asin` làm `id`, tên gốc, mô tả/features được giới hạn độ dài, nhóm nguồn, phân cấp danh mục nguồn, store, điểm đánh giá tổng hợp và tối đa 12 URL ảnh HTTPS thuộc `m.media-amazon.com`.
- Việt hóa năm nhãn nhóm lớn, chưa dịch tên/mô tả từng sản phẩm hoặc thêm từ khóa tiếng Việt chi tiết.
- Giá là USD lịch sử tại thời điểm thu thập, **không phải giá hiện hành hoặc VND**. 12.197 bản ghi thiếu/không có giá hợp lệ giữ `price: null`; không tự bịa giá. 7.803 bản ghi có giá dùng được cho bài thử bộ lọc.
- Loại bản ghi thiếu tên/mã/ảnh hợp lệ; loại trùng theo mã xuyên nhóm. Không nhập user/review/contact/details nguyên khối.
- Chỉ tải metadata và lưu URL ảnh; không tải file ảnh. Ảnh có thể bị thay đổi/hỏng link và cần fallback khi nối giao diện.
- Không có tồn kho, biến thể, shop membership hoặc đơn hàng được xác minh. Không suy ra những dữ liệu này từ catalog.
- Chưa ghi PostgreSQL/Supabase/Elasticsearch, chưa thay catalog DummyJSON trên giao diện. Cần API phân trang trước khi dùng dữ liệu lớn trong app.

## Tái tạo và kiểm tra

```bash
python3 -B tests/data/test_amazon_catalog.py
python3 scripts/download-amazon-catalog.py --per-category 4000 --output data/amazon-2023-new
```

Downloader từ chối ghi đè bộ đã hoàn thành. Khi tải bị ngắt, `products.partial.jsonl` chưa phải bộ hoàn chỉnh. Chỉ dùng `products.jsonl` với manifest/hash đã kiểm chứng. Kiểm tra mạng cần quyền truy cập ngoài sandbox khi chạy qua agent.

Đã kiểm toàn bộ 20.000 dòng: JSON hợp lệ, ID duy nhất, đủ 4.000/nhóm, trường dữ liệu allowlist, giá hợp lệ hoặc null, dung lượng và SHA-256 khớp manifest. Ba kiểm thử parser đạt.

Bước tiếp theo thuộc M2: thiết kế catalog PostgreSQL và index Elasticsearch; import vào môi trường phát triển riêng, đo dung lượng database sau index. Kích thước JSONL không tương đương dung lượng PostgreSQL hoặc Elasticsearch.
