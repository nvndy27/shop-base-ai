# Tổng quan quản lý bán hàng nội bộ

Từ 29/10/2026, dự án ưu tiên hệ thống bán hàng nội bộ cho một công ty theo [REQUIREMENTS](REQUIREMENTS.md). Nhân viên quản lý danh mục, sản phẩm, khách hàng, kho, tồn và đơn; khách không trực tiếp đặt hàng và không bắt buộc có tài khoản. Tiếng Việt, tiền VND nguyên, một đơn xuất từ một kho, một sản phẩm có thể ở nhiều kho.

Caption AI nằm ngoài phạm vi hiện tại. Marketplace nhiều shop, chat, thanh toán online và vận chuyển là mã/phạm vi trước đây được giữ lại, không phải điều kiện nghiệm thu mới. Kế hoạch và khoảng cách với mã hiện có ở [ROADMAP](ROADMAP.md).

Giữ Vite/React, Next.js BFF, TypeScript/Zod, pnpm, Supabase PostgreSQL/Auth và Elasticsearch. Đề xuất bổ sung module nội bộ trong repo hiện có, tách nghiệp vụ khỏi commerce; chưa áp migration hoặc chuyển đổi dữ liệu. PostgreSQL là nguồn chính; transaction quản lý đơn, tồn và lịch sử. Elasticsearch phục vụ tìm kiếm, lỗi dịch vụ không cản trở giao dịch nghiệp vụ.

Requirements yêu cầu ba nhóm tìm kiếm sản phẩm/khách/đơn. Việc index dữ liệu riêng đang xung đột với AGENTS hiện hành; cần giải quyết trước C5 như ROADMAP ghi nhận. Không mở API riêng tư hoặc giảm bảo vệ RLS vì đăng nhập nằm ngoài tiêu chí bắt buộc của đồ án.
