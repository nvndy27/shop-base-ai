# Chức năng theo requirements CSDL

Nguồn nghiệp vụ duy nhất cho giai đoạn hiện tại là [REQUIREMENTS](REQUIREMENTS.md), tiếp nhận 29/10/2026. Không dùng luồng marketplace trước đây để thay các quy tắc đơn và kho nội bộ. [ROADMAP](ROADMAP.md) ánh xạ chức năng sang mốc C0–C6 và KT01–KT28.

| Nhóm | Chức năng bắt buộc |
|---|---|
| Danh mục và sản phẩm | CRUD, mã/SKU chuẩn hóa và duy nhất, đơn vị tính, giá VND nguyên không âm, ngừng hoạt động và xóa có điều kiện |
| Khách hàng | Hồ sơ độc lập Auth; mã, tên, phone +84 duy nhất, email tùy chọn, địa chỉ và lịch sử đơn |
| Kho và tồn | Kho vật lý, phân bổ sản phẩm với tồn 0; nhập/xuất/điều chỉnh có lý do, chống tồn âm, ngừng kho có điều kiện |
| Đơn nháp | Chọn khách/kho, ít nhất một dòng, snapshot tên/giá/người nhận, chủ động lấy giá mới, sửa/xóa khi DRAFT |
| Xử lý đơn | DRAFT → CONFIRMED → COMPLETED; hủy DRAFT/CONFIRMED; xác nhận trừ tồn, hủy xác nhận hoàn kho; không hủy COMPLETED |
| Lịch sử kho | IN/OUT/ADJUSTMENT/SALE/CANCEL, bất biến, transaction và idempotency, truy vấn theo kho/sản phẩm/đơn/thời gian |
| Tìm kiếm | Elasticsearch cho sản phẩm/khách/đơn, ưu tiên mã chính xác, phân trang, phân biệt lỗi dịch vụ và không có kết quả, nạp lại có kiểm chứng |
| Nghiệm thu | Validation tại server/DB, dữ liệu mẫu, hướng dẫn chạy và đủ KT01–KT28 |

Nhân viên quản lý, bán hàng và kho là các nhóm sử dụng. Auth và phân quyền nâng cao không bắt buộc trong baseline môn học; triển khai trên nền hiện có vẫn phải kiểm quyền server, bảo vệ PII và giữ RLS. Ma trận quyền tối thiểu sẽ chốt ở C0.

Không đưa caption AI, chat, thanh toán online, thuế/giảm giá, chia đơn nhiều kho, giao từng phần hoặc trả hàng sau giao vào phạm vi hiện tại. Không xóa mã/tài liệu lịch sử để thực hiện việc đổi ưu tiên.
