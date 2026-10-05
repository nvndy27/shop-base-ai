# Claude Code — sàn thương mại điện tử

@AGENTS.md

## Quy trình bổ sung

- Bắt đầu bằng README, ROADMAP và kiểm kê phần code liên quan; chỉ mở tài liệu cần cho nhiệm vụ để tiết kiệm context.
- Không dùng auto-memory làm nguồn quyết định nghiệp vụ. Quyết định được duyệt phải lưu trong `docs/DECISIONS.md`.
- Với nhiệm vụ lớn, thực hiện từng milestone có thể kiểm tra; kết thúc milestone hiện tại trước khi mở tính năng tiếp theo.
- Khi tạo/sửa UI đọc `docs/DESIGN.md`; tham chiếu gốc chỉ là nguồn phong cách. Không sao chép logo/brand Claude.
- Trước dùng hook, MCP, plugin hoặc script bên ngoài: hiểu quyền truy cập và side effect; không gửi dữ liệu khách hàng/secret sang dịch vụ khác nếu chưa nằm trong tích hợp được phép.
- Kiểm thử quyền, nghiệp vụ tại backend thay vì chỉ screenshot. Nếu chỉ làm UI, ghi rõ backend chưa triển khai.

## Bàn giao

Nêu đường dẫn đã sửa, tiêu chí nghiệm thu đạt/chưa đạt, kiểm tra thực chạy, blocker và việc tiếp theo. Không đánh dấu production-ready khi các điều kiện M7 chưa được xác minh.
