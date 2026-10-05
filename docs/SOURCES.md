# Nguồn tham chiếu

Đọc đối chiếu ngày 01/10/2026. Những kiến trúc, hạn mức và roadmap trong bộ này là đề xuất của dự án; không phải yêu cầu bắt buộc từ nhà cung cấp. Khi triển khai cần kiểm tra SDK/provider docs theo phiên bản đang dùng.

| Nguồn chính thức | Nội dung áp dụng |
|---|---|
| [OpenAI: AGENTS.md](https://developers.openai.com/codex/guides/agents-md) | Codex khám phá hướng dẫn AGENTS; tên file khác không tự được giả định nạp |
| [Claude Code: memory](https://code.claude.com/docs/en/memory) | CLAUDE.md và nhập file hướng dẫn dùng chung |
| [Supabase Auth](https://supabase.com/docs/guides/auth) | Định danh, session và các phương thức đăng nhập |
| [Supabase Google](https://supabase.com/docs/guides/auth/social-login/auth-google) | Tích hợp Google OAuth |
| [Supabase Phone](https://supabase.com/docs/guides/auth/phone-login) | Phone OTP cần cấu hình SMS provider |
| [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking) | Cơ chế liên kết danh tính và điểm cần xác minh |
| [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) | Policy theo hàng, quyền đặc biệt, metadata không đáng tin |
| [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data) | Hồ sơ user, giới hạn token sau thay đổi tài khoản |
| [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization) | Broadcast/Presence private và policy realtime; không lưu lịch sử chat |
| [Elastic search application security](https://www.elastic.co/docs/solutions/elasticsearch-solution-project/search-applications/search-application-security) | Backend search và API key hạn chế quyền |
| [OWASP API Security 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) | Rủi ro authorization theo object/property và tiêu thụ tài nguyên |
| [OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) | Kiểm bytes/type, quota, quyền và xử lý file |
| [OWASP WebSocket Security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html) | Xác thực, authorization, session và payload realtime |
| [Stripe webhooks](https://docs.stripe.com/webhooks) | Ví dụ chính thức về signature/deduplication; không chốt Stripe cho dự án |

Thiết kế tham chiếu gốc: [DESIGN-claude.md](reference/DESIGN-claude.md), do người dùng cung cấp, giữ nguyên để truy vết. Quy tắc commerce cụ thể trong DESIGN là bản điều chỉnh của dự án.
