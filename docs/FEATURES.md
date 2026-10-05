# Chức năng và nghiệp vụ

## Quyền

| Chủ thể | Quyền | Giới hạn |
|---|---|---|
| Khách | Xem catalog và shop công khai, search | Không đọc hồ sơ, đơn hoặc chat |
| Người mua | Hồ sơ/địa chỉ/giỏ/đơn/chat/review của mình | Không sửa payment, giá, quyền |
| Người bán | Chức năng người mua + shop được cấp quyền | Chỉ đơn con và thông tin giao hàng cần thiết của shop |
| Nhân viên shop | Permission theo membership | Không tự cấp quyền, đổi chủ/chi trả |
| Moderator | Duyệt shop/catalog, xử lý báo cáo được phân công | Không mặc định xem mọi chat hay payout |
| Finance | Đối soát/hoàn tiền theo chính sách | Không cấp admin hay sửa catalog |
| Admin | Quản trị có audit và MFA | Không dùng UI để bypass kiểm tra |

MVP có thể chỉ tạo owner shop; schema vẫn dùng membership. Quyền quản trị phân tách theo permission, không một cờ admin làm mọi việc.

## Luồng tài khoản

Google OAuth hoặc SĐT chuẩn E.164 → xác minh → profile → mua hàng. “Gmail” mặc định là Đăng nhập với Google, không phải thu mật khẩu Gmail; tài khoản Google khác vẫn được phép nếu chủ dự án không giới hạn. Email OTP là lựa chọn sau, không tự thêm vào MVP.

Phone OTP cần SMS provider, chống spam và cơ chế recovery. Google và số điện thoại có thể thuộc cùng user sau khi người dùng xác minh trong phiên đã đăng nhập. Không tự gộp theo tên, avatar hay SĐT chưa xác minh. Đổi số/định danh và tài khoản nhận tiền yêu cầu xác thực lại. Không coi SMS là MFA mạnh cho chi trả vì nguy cơ SIM swap/tái cấp số.

## Người mua

1. Tìm theo tên/mô tả/danh mục, gợi ý từ khóa, lọc giá/shop, sort liên quan/giá/mới.
2. Xem biến thể, ảnh, giá và shop; chọn SKU trước thêm giỏ.
3. Giỏ nhiều shop, mỗi SKU một dòng có quantity; checkout toàn bộ hoặc dòng chọn.
4. Checkout tạo parent order và một suborder/shop. Server tính lại giá, phí, voucher, tồn kho và snapshot địa chỉ; báo thay đổi trước xác nhận.
5. COD ở MVP; online sandbox qua adapter. Trạng thái thanh toán độc lập trạng thái vận chuyển.
6. Xem lịch sử, hủy theo điều kiện; review chỉ khi order item đã hoàn thành, một review/item, không đánh giá mua chưa xác minh.
7. Chat shop từ sản phẩm hoặc đơn; báo cáo spam/lừa đảo và chặn. Chặn tin marketing không làm mất thông báo hệ thống/đơn hàng cần thiết.

## Người bán

Đăng ký shop → pending → admin duyệt → active. Nháp sản phẩm → chọn danh mục, ảnh và biến thể → tạo caption nếu muốn → chỉnh/duyệt → gửi kiểm duyệt → published. Shop suspended thì không bán mới, nhưng đơn đang thực hiện vẫn có quy trình xử lý; không tự xóa lịch sử.

Catalog có SKU, giá, tồn kho, ảnh, mô tả và status. Sửa thuộc tính quan trọng của sản phẩm đã duyệt chuyển lại kiểm duyệt; giữ phiên bản đã duyệt hoặc tạm ẩn theo policy chốt. Owner chỉ thao tác shop mình; chỉnh tồn kho qua điều chỉnh có lý do/audit, không sửa tùy ý stock đã reserved.

Đơn: xem suborder của shop; xác nhận, đóng gói, giao vận theo transition hợp lệ. Doanh thu hiển thị phân biệt tổng bán, tiền đã thanh toán, hoàn tiền và tiền có thể chi trả; MVP chưa tích hợp payout không hiển thị “rút tiền thành công”.

## Quản trị

Duyệt/từ chối shop và sản phẩm có lý do; khóa/mở user/shop; quản lý danh mục; tiếp nhận báo cáo và khiếu nại; xem audit; điều tra theo case. Tài khoản bị khóa bị chặn ngay ở backend cho hành động nhạy cảm, không chờ JWT hết hạn. Xóa tài khoản phải tách dữ liệu cá nhân và bản ghi tài chính cần giữ, không cascade xóa đơn.

## Trạng thái và transition

| Đối tượng | Trạng thái chính | Quy tắc |
|---|---|---|
| Shop | pending/active/rejected/suspended/closed | Chỉ quyền quản trị phù hợp duyệt/khóa |
| Product | draft/pending/published/rejected/archived | Chỉ published + shop active được public |
| Suborder | pending/confirmed/packing/shipped/delivered/completed/cancelled | Không bỏ bước; actor hợp lệ; cancel trước shipped theo policy |
| Payment | pending/authorized/paid/failed/cancelled | Backend/provider điều khiển; refund ở bản ghi riêng |
| Refund | requested/approved/processing/succeeded/failed/rejected | Tổng refund không vượt paid; provider xác nhận |
| Caption job | queued/processing/succeeded/failed/cancelled | succeeded không đồng nghĩa sản phẩm published |

COD có thể confirmed khi payment pending; online chỉ giao khi điều kiện thanh toán được đáp ứng. Parent order tổng hợp trạng thái suborder, không ép mọi shop cùng trạng thái. Khi giao dịch/provider và đơn lệch nhau phải có reconciliation; không nuốt webhook late.

## Tiêu chí MVP

Người mua tạo được đơn nhiều shop; shop A không đọc/sửa shop B; người khác không đọc chat/địa chỉ; giá không bị sửa từ client; SKU cuối không bán cho hai đơn đồng thời; caption chỉnh trước đăng; dữ liệu draft/suspended không lọt search; admin action có audit. Xem tiêu chí chi tiết tại TESTING.
