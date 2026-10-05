# Dữ liệu demo thương mại điện tử

Đã chuẩn bị snapshot cục bộ: 32 sản phẩm, 14 danh mục, 3 shop giả lập, 3 giỏ và 3 đơn minh họa. Dùng chung ở Home/ProductDetail và `/demo/cart`, `/demo/orders`. Cart/orders của tài khoản thật không nhận fixture này.

## Nguồn và điều chỉnh

- Sản phẩm và dòng giỏ: [DummyJSON products](https://dummyjson.com/docs/products), [DummyJSON carts](https://dummyjson.com/docs/carts). Chọn ba sản phẩm ở tám nhóm chính rồi bổ sung sản phẩm được ba giỏ đầu tham chiếu.
- [Mã nguồn DummyJSON](https://github.com/Ovi/DummyJSON) có [MIT license](https://github.com/Ovi/DummyJSON/blob/master/LICENSE), ghi nhận DummyJSON — Muhammad Ovi (Owais). Ảnh/nhãn hiệu dùng làm minh họa từ CDN nguồn, không coi license mã nguồn là xác nhận quyền mọi ảnh/nhãn hiệu cho vận hành thương mại. Trước catalog thật, người bán phải cung cấp ảnh và quyền sử dụng phù hợp.
- Giữ tên, ảnh, SKU, rating và stock nguồn. Không tạo màu/size giả: mỗi sản phẩm có một SKU gốc. Mô tả tiếng Việt chỉ xác nhận nhóm sản phẩm, không tự thêm vật liệu/chứng nhận/công dụng.
- Giá VND = làm tròn giá nguồn × 25.000, chỉ là quy mô giá demo cố định, không phải tỷ giá hiện hành hoặc giá bán thật. Không nhập discount/shipping/payment của nguồn.
- Shop, ngày và trạng thái đơn, chia đơn theo shop là fixture tổng hợp trong dự án, **không phải đơn hàng thật tải từ mạng**. Tiền đơn bằng tổng unit price VND × quantity, phí giao demo bằng 0. Một đơn có nhiều shop để chuẩn bị test M3.
- Không nhập users, reviewer emails, tên khách, số điện thoại, địa chỉ, thanh toán hoặc phiên Auth. Không tạo người dùng Auth hoặc ghi Supabase/Elasticsearch thật.

## Tệp và tái tạo

- `frontend/src/data/commerce-demo.json`: snapshot + nguồn, thời điểm, SHA-256 và các điều chỉnh.
- `scripts/demo-commerce.mjs`: normalize/validate dữ liệu không đáng tin; chỉ chấp nhận ảnh HTTPS trên CDN nguồn, số tiền/stock hợp lệ và tham chiếu sản phẩm tồn tại.
- `scripts/import-demo-commerce.mjs`: đọc JSON đã tải và ghi snapshot cục bộ; không kết nối database.

```bash
curl --fail --silent --show-error 'https://dummyjson.com/products?limit=0&select=id,title,description,category,price,rating,stock,sku,brand,thumbnail,images' --output /tmp/products-source.json
curl --fail --silent --show-error 'https://dummyjson.com/carts?limit=3' --output /tmp/carts-source.json
node scripts/import-demo-commerce.mjs /tmp/products-source.json /tmp/carts-source.json
pnpm test
```

Tìm kiếm trên trang chủ hiện là lọc snapshot trong browser, có dấu/không dấu và danh mục; không tuyên bố Elasticsearch đã tích hợp. Dataset đã lưu tại repo nhưng ảnh vẫn cần kết nối CDN.

## Lát cắt backend tiếp theo

1. M2 catalog: migration bổ sung categories/products/SKU/inventory/images, RLS và quyền shop; draft/pending/published, endpoint public và seller/admin, kiểm chứng chéo shop. Fixture này chỉ seed database dev riêng bằng quy trình được phê duyệt, không import vào main Production.
2. Search: transactional outbox, worker và Elasticsearch index công khai; search đối chiếu visibility trong PostgreSQL, fallback khi Elastic chưa cấu hình.
3. M3: giỏ persistent theo actor, quote tiền tại server, order/suborder/COD và giữ kho nguyên tử; test SKU cuối, idempotency và hủy/release.

Chưa có migration/API catalog/cart/order mới trong lát cắt dữ liệu demo này; chưa hoàn thành M2/M3. Kết nối Auth/email/SMS và môi trường dev riêng vẫn cần nghiệm thu.

## Giao diện xem trước như bản chính thức

Theo yêu cầu chủ dự án, bỏ banner/nhãn demo ở catalog, ảnh và các trang xem trước; tên shop hiển thị không có hậu tố Demo. Thanh danh mục dùng chung mép với tìm kiếm và lưới sản phẩm. Nguồn và tính chất fixture vẫn giữ trong snapshot/tài liệu; các thao tác chưa tích hợp vẫn không tạo giao dịch thật.
