# Thiết kế UI

Nguồn phong cách: [DESIGN-claude.md](reference/DESIGN-claude.md). Bản này chuyển phong cách editorial sang luồng mua hàng; không dùng hero marketing lớn che catalog, không đưa thuật ngữ Elasticsearch/Supabase vào giao diện khách hàng.

## Token được chọn

| Token | Giá trị | Công dụng |
|---|---|---|
| canvas | #faf9f5 | Nền chính |
| surface | #f5f0e8 | Nhóm nội dung |
| card | #efe9de | Khối nổi nhẹ |
| ink | #141413 | Tiêu đề, nội dung quan trọng |
| body | #3d3d3a | Nội dung |
| muted | #6c6a64 | Chú thích |
| border | #e6dfd8 | Viền và phân cách |
| primary | #cc785c | Điểm nhấn san hô |
| primary-action | #a9583e | CTA cần chữ trắng; kiểm tra tương phản |
| dark | #181715 | Footer hoặc vùng nhấn ngắn |
| error | #c64545 | Lỗi kèm chữ/icon |
| success | #257044 | Thông báo thành công có tương phản |

Không mặc định chữ trắng nhỏ trên #cc785c: phải kiểm tra WCAG AA; dùng màu primary-action hoặc chữ ink nếu phù hợp. Màu teal/green từ file gốc chỉ dùng trang trí khi chưa đạt tương phản. Không chỉ dựa vào màu để truyền trạng thái.

Font heading: Cormorant Garamond có glyph tiếng Việt, fallback Georgia/serif; body: Inter, system-ui. Chỉ dùng font có quyền sử dụng; tự host khi phù hợp. H1 desktop 40–48px, mobile 30–34px, heading nhỏ 24–28px; font serif weight 400–500. Body 16px, nhãn 14px, metadata 12–13px. Không áp h1 64px/spacing 96px của landing page vào mọi màn hình.

Spacing 4/8/12/16/24/32/48px. Container tối đa 1280px, gutter 24px desktop/16px mobile. Radius input/button 8px, card 12px, badge pill. Viền mảnh, shadow nhẹ cho dropdown/modal; không gradient đậm, không banner nhấp nháy. Ảnh sản phẩm là nội dung chính.

## Màn hình và bố cục

| Màn hình | Nội dung và hành động chính |
|---|---|
| Trang chủ/catalog | Header logo riêng, search lớn, tài khoản, giỏ; danh mục; grid 4 cột desktop/2 cột mobile; sản phẩm ngay trong viewport đầu |
| Kết quả tìm kiếm | Query, số kết quả, filter giá/danh mục/shop, sort; sidebar desktop, filter sheet mobile |
| Chi tiết sản phẩm | Ảnh 1:1, tên, shop, giá theo biến thể, lựa chọn biến thể, tồn khả dụng, thêm giỏ/mua, chat; mô tả và đánh giá |
| Shop công khai | Tên, tình trạng, catalog; không lộ email/số điện thoại tài khoản |
| Giỏ | Nhóm theo shop, chọn dòng, số lượng, trạng thái thay đổi giá/tồn, tổng và checkout |
| Checkout | Địa chỉ, phí từng shop, phương thức thanh toán, tổng chính thức; điều kiện và xác nhận |
| Đơn hàng | Tab trạng thái, đơn theo shop; chi tiết, lịch sử, hủy/đổi trả khi hợp lệ |
| Đăng nhập/đăng ký | Tiếp tục với Google, nhập SĐT, OTP, resend/cooldown, lỗi; không yêu cầu mật khẩu Gmail |
| Hồ sơ | Tên hiển thị, địa chỉ, danh tính đã xác minh, bảo mật/phiên, liên kết tài khoản |
| Chat | Danh sách hội thoại + luồng tin, card sản phẩm, ảnh, báo cáo/chặn; mobile chuyển màn hình |
| Người bán | Sidebar Tổng quan/Sản phẩm/Đơn/Tin nhắn/Thiết lập; số liệu có định nghĩa, bảng có filter |
| Form sản phẩm | Thông tin, danh mục, biến thể, ảnh, kho; nút tạo caption, bản nháp sửa/duyệt; lưu nháp/đăng duyệt |
| Quản trị | Shop chờ duyệt, sản phẩm/báo cáo, user trạng thái, audit; phân quyền thao tác riêng |

Card catalog: ảnh, tên tối đa 2 dòng, giá, shop, rating khi có thật; không invent badge “đã xác minh” hay lượt mua. Giá VND định dạng `vi-VN`, không làm tròn để sai tổng. Thông tin phí/discount ở checkout rõ ràng.

## Trạng thái bắt buộc

Mọi view dữ liệu có loading/skeleton, empty, lỗi + retry, thành công và chưa cấu hình khi là demo. Form giữ dữ liệu khi lỗi; lỗi tại field và summary có focus. Biến thể hết hàng disable kèm lý do. Caption: queued/processing/succeeded/failed/cancelled, có trạng thái đang chờ duyệt. Search không có kết quả gợi ý bỏ filter, không khẳng định AI tìm thấy đồ tương tự nếu chưa triển khai.

## Accessibility và responsive

- Tất cả control có label, focus visible, thao tác keyboard và thứ tự focus hợp lý; modal trap focus, Escape đóng và trả focus.
- Dùng HTML semantic và component accessible; touch target khoảng 44px; không text clipping khi zoom 200%.
- Alt ảnh mô tả ngắn; ảnh decorative alt rỗng. Live region cho lỗi/thành công, tránh đọc mọi sự kiện chat liên tục.
- Breakpoint tham chiếu 640/1024px; test 360, 768, 1280px. Không horizontal scroll toàn trang; bảng phức tạp được scroll trong vùng có nhãn.
- Tôn trọng reduced-motion; không spinner vô hạn khi job lỗi.

## Ranh giới thiết kế

Nội dung minh họa chỉ ở demo/fixture có nhãn. Không nhận diện “Claude” trong sản phẩm, không sao chép trang gốc, không lấy ảnh ngẫu nhiên chưa rõ quyền. Chưa có logo thì wordmark tên tạm trung tính; không tự tạo thương hiệu thành quyết định đã duyệt.
