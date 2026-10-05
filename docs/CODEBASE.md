# Cấu trúc codebase

## Stack đề xuất cho repository mới

TypeScript strict, Next.js App Router cho web/BFF, React, Tailwind với token riêng, component accessible (ví dụ shadcn/Radix), Zod cho schema; Supabase JS/SSR theo tài liệu hiện hành; PostgreSQL migrations; Elasticsearch REST/client chỉ server; worker TypeScript riêng cho index/caption/outbox; Vitest và Playwright. Dùng pnpm nếu chưa có package manager. Chọn phiên bản stable tương thích khi bootstrap, pin qua lockfile, không viết số version đoán trong đặc tả.

Đây là đề xuất, không phải code đã tồn tại. Nếu repository dùng stack khác thì giữ stack, ghi ADR khi cần điều chỉnh. Chưa cần microservice catalog/order riêng; modular monolith và worker đủ cho MVP. Không đưa model inference nặng vào request web; service Python/FastAPI chỉ khi mô hình của người dùng cần runtime đó.

## Cây dự kiến

```text
AGENTS.md / CLAUDE.md / CODEX.md
docs/
apps/
  web/
    src/app/                  # routes người mua, seller, admin và API
    src/components/           # UI dùng chung, không chứa nghiệp vụ giao dịch
    src/features/             # auth, catalog, cart, checkout, orders, chat, seller, admin
    src/server/               # authz, services, repositories, adapters
    src/lib/                  # format, env validation, schema hỗ trợ
    public/
  worker/
    src/jobs/                 # search index, caption, reconciliation
    src/adapters/
packages/
  contracts/                  # request/response schema dùng chung
  domain/                     # state machine, money, permission, rule thuần
supabase/
  migrations/
  tests/                      # database/RLS allow-deny
tests/
  integration/
  e2e/
```

Tree là đề xuất; thư mục chỉ tạo khi có nội dung. Không tạo hàng chục module rỗng để đủ cấu trúc.

## Ranh giới

Route/controller: parse schema, xác thực, gọi service, trả DTO. Service: kiểm quyền tài nguyên, trạng thái, transaction và side effect/outbox. Repository: truy vấn có owner/shop scope. Adapter: Supabase/Elastic/payment/caption, không rò provider types khắp UI. Domain: money integer VND, trạng thái, rule thuần. Component client không import server adapters.

Không đưa business rule vào React handler duy nhất. Mỗi thao tác quan trọng có một nơi định nghĩa: `createCheckout`, `transitionSuborder`, `requestRefund`, `sendMessage`, `requestCaption`. Kiểm tra role đơn giản không thay kiểm quyền tài nguyên.

## Quy ước

- Identifier/code/comment tiếng Anh; UI và giải thích tiếng Việt. i18n chỉ thêm khi cần, không dựng đa ngôn ngữ ngoài phạm vi.
- Server env validate; tách public và private. Secret không prefix NEXT_PUBLIC; không in giá trị env khi debug.
- Tiền integer hoặc bigint phù hợp giới hạn; API serialize decimal string nếu vượt safe integer. Không float trong tổng thanh toán.
- Thời gian lưu UTC timestamptz, hiển thị Asia/Ho_Chi_Minh. UUID cho ID, không coi UUID là cơ chế bảo mật.
- Form schema và DTO allowlist; không `update(payload)` trên entity chứa role/payment/status.
- Error code ổn định, request ID, thông báo không lộ stack hoặc dữ liệu người khác.
- File upload qua pipeline kiểm tra. Nội dung mô tả dạng text hoặc rich-text allowlist, không raw HTML tùy ý.
- Script dự kiến: dev/build/typecheck/lint/test/test:integration/test:e2e. Khi bootstrap phải tạo thật rồi mới ghi lệnh trong README; không giả định chúng đã có.

## Môi trường và CI

Dev/test dùng seed giả, không PII thật. Staging có dự án Supabase, index Elastic, bucket và payment sandbox riêng. CI chạy typecheck, test domain, DB/RLS, integration theo service có sẵn, build và scan secrets/dependencies. Production deployment cần migration plan, backup/restore và quyền thực hiện rõ ràng.

Quan sát: request correlation, job ID, p95 search, index lag, lỗi webhook/caption, tồn reserved hết hạn, refund/payout pending. Không bật body logging trên endpoints nhạy cảm. Không thêm analytics theo dõi cá nhân khi chưa có yêu cầu/chính sách.
