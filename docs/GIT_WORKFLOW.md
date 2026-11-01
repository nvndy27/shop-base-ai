# Quy trình Git và GitHub

Nguồn quy tắc: [AGENTS](../AGENTS.md#quy-tắc-git-và-github). Nhánh main giữ bản ổn định, new dùng phát triển; đưa thay đổi vào main bằng PR. Checkpoint khởi tạo ngày 01/11/2026 được chủ dự án cho phép push trực tiếp main một lần. Các lệnh sau chạy khi đã đọc status và có ủy quyền cho thao tác ghi remote.

## Bắt đầu công việc

```bash
rtk git status --short
rtk git branch -vv
rtk git fetch origin
rtk git switch new
rtk git pull --ff-only origin new
```

Chỉ đổi nhánh/pull khi working tree sạch. Nếu có thay đổi đang làm, giữ nguyên và xử lý trong phạm vi nhiệm vụ; không tự reset hoặc stash. Sau khi PR đã merge, đồng bộ main và fast-forward new như quy tắc trong AGENTS; không dùng pull để giải quyết mù lịch sử phân kỳ.

## Kiểm tra và commit

```bash
rtk git diff
rtk git diff --check
rtk pnpm check
rtk pnpm --dir frontend build
rtk git add <cac-file-da-review>
rtk git diff --cached
rtk git commit -m "feat(sales): add customer management"
```

Stage danh sách file đã review, không dùng git add . khi chưa kiểm kê. Conventional Commits giúp phân biệt chức năng, sửa lỗi, tài liệu và kiểm thử. Chỉ tài liệu có thể dùng kiểm tra liên kết/diff phù hợp theo AGENTS.

## Push và PR

```bash
rtk git push -u origin new
rtk proxy gh pr create --base main --head new --body-file /tmp/shop-base-ai-pr.md
```

Viết nội dung PR vào file trước, theo template trong .github. Chủ dự án review và cho phép merge; không push main cho công việc thường ngày. Branch protection là cấu hình GitHub riêng, chưa được thiết lập chỉ bằng tài liệu này. Không coi PR checklist là CI tự động.
