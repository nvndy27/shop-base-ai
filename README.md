# Quản lý bán hàng nội bộ theo requirements CSDL

**Phạm vi hiện hành từ 29/10/2026:** ưu tiên requirements của project `csdl`, loại caption AI khỏi kế hoạch hiện tại. Nhân viên quản lý danh mục, sản phẩm, khách hàng, nhiều kho, tồn và đơn; nghiệm thu theo KT01–KT28. Mã marketplace/chat đang có được giữ lại, không đồng nghĩa đã đáp ứng nghiệp vụ nội bộ.

- [Requirements chính thức trong repo](docs/REQUIREMENTS.md) và [file nguồn giữ nguyên](docs/reference/csdl-requirements.docx).
- [Quy trình commit, pull, push và PR](docs/GIT_WORKFLOW.md).
- [Roadmap mới C0–C6](docs/ROADMAP.md): baseline/thiết kế → dữ liệu nền → tồn kho → đơn nháp → xử lý đơn → tìm kiếm → nghiệm thu.
- [Tổng quan](docs/OVERVIEW.md), [chức năng](docs/FEATURES.md), [quyết định đổi phạm vi D039](docs/DECISIONS.md#d039--ưu-tiên-requirements-csdl-và-loại-caption-ai-khỏi-phạm-vi-hiện-tại-29102026).

Bước đề xuất tiếp theo là C0 kỹ thuật + C1 backend. Giữ stack và cấu trúc đang chạy; chưa thay schema, dữ liệu hay giao diện trong lượt lập kế hoạch. Phần tìm kiếm khách/đơn riêng tư cần giải quyết xung đột AGENTS trước C5.

## Tài liệu và hướng dẫn triển khai trước khi đổi phạm vi

Nội dung bên dưới lưu lại trạng thái sàn và cách chạy mã hiện có. Các mô tả caption, MVP M0–M7 và ưu tiên marketplace không còn là yêu cầu nghiệm thu hiện hành. Lịch sử roadmap được giữ ở [bản lưu](docs/reference/ROADMAP-marketplace-20261012.md).

# Bộ đặc tả sàn thương mại điện tử

Ngày: 01/10/2026 · Phiên bản đặc tả: 0.1 · Trạng thái: backend M0/M1 một phần; schema M1 đã áp dụng và kiểm tra quyền SQL trên Supabase, Auth/PostgREST ứng dụng chưa nghiệm thu.

Sàn nhiều người bán, lấy cảm hứng chức năng từ Shopee/Lazada và phong cách tối giản từ `DESIGN-claude.md`. Tên sản phẩm, tên miền, mô hình caption và nhà cung cấp thanh toán chưa được chốt. Không sử dụng logo hoặc nội dung nhận diện của Claude, Shopee, Lazada.

## Thêm vào dự án

1. Giải nén, đặt `AGENTS.md`, `CLAUDE.md`, `CODEX.md` và thư mục `docs/` ở gốc repository.
2. Nếu repository đã có các file này, hợp nhất nội dung thay vì ghi đè. Giữ các quy tắc và cấu trúc hiện có; báo xung đột.
3. Đặt file tham chiếu gốc tại `docs/reference/DESIGN-claude.md`.
4. Bắt đầu từ milestone M0 trong `docs/ROADMAP.md`. Chưa có mã nguồn thì bootstrap theo `docs/CODEBASE.md`; có mã nguồn thì kiểm kê trước, không thay stack tự động.
5. Mỗi phiên giao nhiệm vụ nhỏ, có tiêu chí nghiệm thu. Không yêu cầu AI xây toàn bộ sàn trong một lượt.

## Danh mục

| File | Mục đích |
|---|---|
| [OVERVIEW](docs/OVERVIEW.md) | Mục tiêu, giả định, giới hạn và kiến trúc |
| [FEATURES](docs/FEATURES.md) | Chức năng, quyền, luồng và trạng thái |
| [DESIGN](docs/DESIGN.md) | Token, màn hình, responsive và tương tác |
| [CODEBASE](docs/CODEBASE.md) | Stack đề xuất, cấu trúc mã nguồn, quy tắc |
| [DATABASE](docs/DATABASE.md) | Mô hình dữ liệu, ràng buộc, phân quyền |
| [INTEGRATIONS](docs/INTEGRATIONS.md) | Supabase, Elasticsearch, caption và thanh toán |
| [API](docs/API.md) | Hợp đồng API và xử lý lỗi |
| [SECURITY](docs/SECURITY.md) | Rà soát rủi ro ở mức thiết kế |
| [TESTING](docs/TESTING.md) | Nghiệm thu và kiểm thử bảo mật |
| [ROADMAP](docs/ROADMAP.md) | Milestone và điều kiện hoàn thành |
| [DECISIONS](docs/DECISIONS.md) | Quyết định, điểm chưa chốt, tiến độ |
| [SOURCES](docs/SOURCES.md) | Tài liệu chính thức đã tham chiếu |
| [AGENTS.md](AGENTS.md) | Hướng dẫn dùng chung, Codex đọc theo cơ chế AGENTS |
| [CLAUDE.md](CLAUDE.md) | Điểm vào cho Claude Code, nhập quy tắc chung |
| [CODEX.md](CODEX.md) | Quy trình bổ sung cho Codex, được AGENTS yêu cầu đọc |

`CODEX.md` không được giả định tự động nạp. `AGENTS.md` là điểm vào và yêu cầu đọc nó. `CLAUDE.md` nhập `AGENTS.md` để tránh hai bộ quy tắc lệch nhau. Các file chỉ dẫn hỗ trợ agent, không thay thế quyền hệ thống, CI hoặc kiểm soát truy cập thực tế.

## Prompt khởi đầu

> Đọc AGENTS.md, hướng dẫn dành cho công cụ của bạn, README và docs/ROADMAP.md. Kiểm kê repository, báo milestone hiện tại và các xung đột với đặc tả. Thực hiện M0; không triển khai thanh toán thật, không đổi stack nếu đã có dự án. Kết thúc bằng thay đổi, kiểm tra đã chạy và phần còn thiếu.

## Prompt theo milestone

> Thực hiện M1 trong docs/ROADMAP.md theo tiêu chí nghiệm thu. Chỉ mở tài liệu liên quan, giữ phạm vi M1. Tạo migration và kiểm thử allow/deny cho tài khoản, phân quyền shop. Nếu thiếu cấu hình dịch vụ, tạo adapter có trạng thái chưa cấu hình; không giả lập thành công.

> Rà soát luồng checkout theo docs/SECURITY.md và docs/TESTING.md. Ưu tiên truy cập chéo shop, sửa giá, đặt hàng đồng thời và webhook trùng. Chỉ kết luận lỗi khi có bằng chứng trong code; phân biệt rủi ro thiết kế, lỗi xác nhận và hạng mục chưa kiểm chứng.

## Giới hạn hiện tại

Cập nhật 12/10: trang đăng nhập chuyển sang email + mật khẩu tự đăng ký, giữ Supabase cho phiên và quyền backend. Muốn dev không gửi email cần cấu hình Confirm Email trên project dev riêng; chưa thay cloud hoặc nghiệm thu tài khoản thật. Checkout vẫn yêu cầu SĐT xác minh. Xem [AUTH_INTEGRATION](docs/AUTH_INTEGRATION.md) D037.

Cập nhật marketplace/COD cho môn học: đã có mã schema/RPC/API/UI và kiểm thử cục bộ cho sản phẩm có SKU/kho, seller, giỏ tài khoản, quote/đơn nhiều shop, hủy/hoàn kho, Storage ảnh và worker Elastic. Hai migration mới chưa áp dụng cloud, còn cần cấu hình server và nghiệm thu phiên thật; xem [COURSE_COMMERCE](docs/COURSE_COMMERCE.md). Caption và thanh toán online chưa triển khai.

Cập nhật 03/10: catalog nguồn 20.000 sản phẩm đã nối API Supabase và Elasticsearch local; Home/chi tiết/gợi ý sử dụng API thật trên máy. Cách chạy, hợp đồng và giới hạn tại [CATALOG_API](docs/CATALOG_API.md). Chưa deploy bản mới lên Vercel hoặc triển khai seller inventory/outbox/đơn hàng thật.

Cài đặt hiện có Tiếng Việt/English cho catalog; tên dịch bằng mô hình local và giá nguồn USD có thể hiển thị VND theo tỷ giá cập nhật hằng ngày. Nguồn USD và giá đơn của shop được giữ riêng; setup/giới hạn tại [CATALOG_API](docs/CATALOG_API.md).

Cập nhật 05/10: đã có lát cắt 1 của M5 (chat) — schema `chat` với quyền thành viên dẫn xuất, RPC `public.chat`, API `/api/v1/chat/*` và trang Chat nối API thật; migration `202610050001_chat.sql` **chưa áp dụng cloud**. Sau rà soát đã sửa 5 lỗi thật (tải lịch sử, vòng lặp reload, đọc bảng qua RLS, shop đóng mất lịch sử phía người bán, RPC nhận `body` không phải string). Realtime, tệp đính kèm, báo cáo và chặn chưa triển khai. Xem [DECISIONS](docs/DECISIONS.md) D036.

Schema M1 đã có trên Supabase; chưa xác minh login/Auth/PostgREST của ứng dụng hoặc kết nối Elasticsearch, chưa biết hợp đồng API mô hình, chưa có audit độc lập hay chứng nhận bảo mật. Các giá trị quota, timeout, SLA cần đo và hiệu chỉnh trước vận hành.

## Backend hiện có — M0/M1

Không có giao diện. `apps/web` là Next.js BFF chỉ có API; hợp đồng TypeScript/Zod dùng chung ở `packages/contracts`. Đã có hồ sơ, địa chỉ, đăng ký shop pending, kiểm quyền membership, duyệt shop qua permission + AAL2/MFA và audit riêng.

Frontend Vite riêng do người dùng/agent khác tạo đã có tại `frontend/` (port 5175), không thuộc workspace backend. Auth/profile đã nối SDK/API theo yêu cầu tiếp theo, giữ thiết kế; Google/Phone provider và callback cloud chưa nghiệm thu. Hướng dẫn chạy hai server: `frontend/README.md`; trạng thái và bước cấu hình: `docs/AUTH_INTEGRATION.md`. Port 3000 vẫn chỉ là API, không phải trang bán hàng.

### Chạy cục bộ

Yêu cầu Node.js >= 22.12 và pnpm 12.8.1 (phiên bản đã pin trong `package.json`). Cài pnpm bằng cơ chế quản lý công cụ của môi trường; Corepack cũ có thể chưa tương thích entrypoint native của pnpm 12.

**Không chạy `npm install` trong repository này.** Đây là pnpm workspace (`workspace:*`) và dùng `pnpm-lock.yaml`; không trộn npm với cây dependency do pnpm tạo.

Nếu máy chưa có lệnh `pnpm`, chạy qua `npx` để dùng đúng phiên bản, không cần cài global:

```bash
npx --yes pnpm@12.8.1 install --frozen-lockfile --ignore-scripts
npx --yes pnpm@12.8.1 check
npx --yes pnpm@12.8.1 dev
```

Nếu pnpm đã có trong PATH:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm dev
```

Hoặc `pnpm check` để chạy toàn bộ bốn nhóm kiểm tra. Lifecycle scripts dependency không cần chạy cho lát cắt này. `.npmrc` đặt store trong workspace.

Copy `.env.example` sang `apps/web/.env.local` rồi cấu hình URL/publishable key của dự án Supabase **dev riêng**, cùng `APP_ORIGIN`. Không cung cấp secret qua chat. Backend không cần service-role key. Thiếu cấu hình trả lỗi 503, không tạo phiên hoặc dữ liệu giả.

Migration `supabase/migrations/202610010001_identity_and_shops.sql` đã áp dụng qua SQL Editor vào dự án `rbhqkpjvbnuhhfhwrhdo`, nhánh `main`, sau xác nhận riêng của người dùng. **Không chạy lại migration này trên cùng database hoặc chỉnh file đã áp dụng.** Chưa tự thiết lập lịch sử migration Supabase CLI; cần đồng bộ history đúng hiện trạng trước khi dùng CLI deploy, tránh replay CREATE TABLE.

Với database dev mới khác, review/apply migration theo quy trình môi trường đó. `supabase/tests/bootstrap.sql` chỉ dành cho test PostgreSQL nhúng, tuyệt đối không áp dụng lên Supabase. `supabase/tests/verify_m1_deployment.sql` kiểm schema/grants và deny với roles thật mà không tạo user/fixtures; script này đã pass trên Supabase được chỉ định.

API nhận `Authorization: Bearer <access-token>` của Supabase; không đọc cookie hoặc token trong URL. Auth adapter xác minh qua Auth `getUser`, và dữ liệu đi bằng JWT người dùng để RLS có hiệu lực. Google/phone login dùng SDK Supabase ở frontend; provider, redirect/PKCE, SMS quota và vòng đời phiên vẫn cần cấu hình/kiểm thử chung. Không có endpoint thu mật khẩu, gửi SMS hoặc login giả.

Chi tiết payload/response M1: `docs/API.md`. Báo cáo quyền và giới hạn môi trường: `docs/BACKEND_VERIFICATION.md`.
