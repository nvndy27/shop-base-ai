# Codex — quy trình bổ sung

`AGENTS.md` yêu cầu Codex đọc file này. Không dựa vào tên CODEX.md để tự động nạp.

## Khi bắt đầu

- Đọc AGENTS, README và ROADMAP; kiểm tra hướng dẫn lồng nhau, git status, scripts hiện có.
- Nếu repository trống, bootstrap theo CODEBASE ở M0. Nếu đã có code, xác định khoảng cách với đặc tả; không tạo app thứ hai hay di chuyển code hàng loạt.
- Không dựng lệnh kiểm tra tưởng tượng. Chỉ dùng scripts có thật; bổ sung script hợp lý khi đang khởi tạo và ghi trong README.

## Khi thực hiện

- Tìm kiếm bằng `rg`, đọc đúng module và phụ thuộc; tránh tải toàn repository vào context.
- Ưu tiên patch nhỏ, rõ ràng, giữ lockfile và style hiện có. Chạy các bước độc lập song song khi an toàn; migration/mutation phụ thuộc phải tuần tự.
- Việc liên quan orders/payments/chat/shop permissions phải đọc SECURITY, DATABASE và test quyền trước khi kết luận.
- Không dùng kết quả `build` làm bằng chứng RLS, webhook hoặc concurrency đã đúng. Báo từng nhóm kiểm tra thực chạy.
- Có blocker dịch vụ: làm phần hợp đồng/adapter/test độc lập; để trạng thái chưa cấu hình rõ ràng, không thay backend bằng localStorage.

## Khi kết thúc

Đọc diff, xác nhận không secret và không thay đổi ngoài phạm vi. Báo tiếng Việt ngắn gọn: đã làm, kiểm tra, chưa làm, bước kế tiếp. Cập nhật tiến độ trong DECISIONS khi có thay đổi thực; không mở rộng phạm vi chỉ để có thêm commit.
