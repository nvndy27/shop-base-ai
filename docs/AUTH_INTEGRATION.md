# Auth frontend — bàn giao 01/10/2026

## Cập nhật theo yêu cầu ngày 02/10/2026

- Đăng ký có Người dùng (mua sắm) / Người bán (mua sắm và đăng ký shop). Lựa chọn chỉ là onboarding preference trong sessionStorage, không metadata cấp quyền; người bán xác minh Auth xong đến `/profile#shop`, cả OTP và OAuth. Người dùng có thể đăng ký shop sau tại Tài khoản.
- Tài khoản có Shop của bạn: GET `/me/shops` chỉ trả membership active của actor qua bearer/RLS, POST `/shop-applications` dùng RPC hiện có tạo shop pending. Không tự duyệt, cấp role, tạo sản phẩm hoặc mở dashboard giả. Header bỏ icon Shop, thanh tìm kiếm bỏ Giỏ hàng/Tài khoản bị trùng.

- `/auth` có hai box Đăng ký / Đăng nhập, mặc định Đăng ký qua email OTP. Đăng ký cho phép tạo user (`shouldCreateUser: true`); Đăng nhập email/SMS dùng `false`, không tự tạo account mới. Chỉ có phiên sau xác minh mã thành công. Google giữ luồng OAuth thống nhất của Supabase (có thể tạo account ở lần đầu), không hứa chặn đăng ký Google bằng box phía client.
- `/settings` thay mục “Xem thử” trên header. Có đăng nhập/tạo tài khoản, thêm/đổi SĐT qua `updateUser({phone})` rồi `verifyOtp(type: phone_change)` trên cùng user; không dùng `signInWithOtp(phone)` để liên kết vì có thể đổi sang account khác. Xác nhận actor và SĐT bằng `getUser`, không metadata.
- `/checkout` kiểm server qua GET `/api/v1/me/purchase-eligibility`: Auth `getUser` cung cấp `phone` + `phone_confirmed_at`, repository kiểm profile chính chủ active; từ chối user chỉ xác minh email, banned và anonymous. API không trả SĐT. Chưa có endpoint đặt hàng thật; kiểm điều kiện không tạo đơn/giữ kho. Mọi endpoint tạo đơn tương lai phải gọi kiểm quyền trong cùng thao tác server, không tin kết quả check trước của browser.
- Bỏ delay/redirect giả lập đặt hàng thành công và tắt nút tạo đơn cho đến M3. Cart/orders vẫn demo có nhãn. Demo UI cũ chỉ còn đường dẫn phụ từ Cài đặt, không thay phiên thật.
- **Cấu hình email cần thực hiện trên môi trường được phê duyệt:** bật Email provider và Confirm Email; dùng nội dung `supabase/templates/email-otp.html` cho Magic Link và Confirm Signup để hiển thị `{{ .Token }}`. Kiểm OTP length/expiry phù hợp; frontend nhận mã email 6–10 chữ số. Tài liệu: https://supabase.com/docs/guides/auth/auth-email-passwordless.
- SMTP mặc định chỉ gửi tới email thuộc team dự án; Gmail ngoài team cần Custom SMTP cấu hình trực tiếp Dashboard. Không lưu SMTP password/Auth token trong frontend/chat. Tài liệu: https://supabase.com/docs/guides/auth/auth-smtp. SMS vẫn cần provider riêng để xác minh SĐT, đăng ký email không phụ thuộc Twilio.
- Chưa chỉnh cấu hình cloud, gửi email/SMS hoặc tạo tài khoản thật trong lần cập nhật này: đang chờ Gmail và môi trường của chủ dự án. Các thông tin provider ở phần bàn giao 01/10 bên dưới là lịch sử, không được coi là kiểm tra trạng thái hiện tại.
- Kiểm tra dashboard chỉ đọc ngày 02/10: main vẫn có nhãn Production, allow signup/Confirm Email bật, Email Enabled, Phone/Google Disabled. Emails hiển thị “Set up custom SMTP to edit templates”; dự án chưa có SMTP riêng để sửa mẫu OTP. Không thay provider, template hoặc secret trên cloud.
- Kiểm thử: typecheck, 69 unit, 37 integration/SDK, frontend/backend build pass; lint không lỗi, còn warning có sẵn. Tests dùng Auth transport fixture, không chứng minh SMTP/SMS delivery hay login bằng phiên thật.

## Sửa luồng OTP ngày 03/10/2026 (D034)

- Chặn submit trùng trong lúc gửi/xác nhận OTP; trang auth không hiện form khi đang kiểm tra phiên hoặc đã có user.
- Gộp restore đồng thời (bao gồm React StrictMode) thành một lần getSession/getUser; vẫn xác minh user qua Auth và không coi cached session là bằng chứng thành công.
- Nếu xác nhận OTP lỗi nhưng còn phiên đã được Auth xác minh, cập nhật AuthContext và chuyển sang Tài khoản. Nếu không có phiên hợp lệ, giữ mã/lỗi và có countdown chờ thử lại khi bị 429; không tự retry endpoint hoặc gửi thư mới.
- Cooldown gửi mã giữ bằng timestamp giữa reload/tab, không lưu email/SĐT/OTP. Tách lỗi giới hạn email dự án khỏi xác nhận OTP. Có nút kiểm tra lại phiên sau lỗi restore tạm thời.
- Giao diện OTP: nhãn input riêng, nút xác nhận/gửi lại mỗi nút một hàng cách nhau 16px, nút đổi địa chỉ ở vùng riêng; styles auth có scope riêng.
- 50 tests auth/cooldown/installed SDK đạt; build frontend và lint đạt (warning có sẵn). Browser fixture mô phỏng 429 không gửi email/đăng nhập thật; kiểm bố cục desktop và viewport 390px, không chồng nút hoặc tràn ngang. Chưa tái nghiệm thu OTP bằng email thật; không thay cấu hình/quota cloud.
- Giới hạn máy chủ vẫn có hiệu lực; 429 xác nhận mã có thể do giới hạn request theo IP. Xem [Supabase rate limits](https://supabase.com/docs/guides/auth/rate-limits). Countdown UI chỉ giúp ngừng lặp request, không khẳng định quota server đã reset.

## Xác nhận email và phiên sau Confirm (03/10/2026, D035)

- Nguyên nhân trong mã cũ: Email signInWithOtp chưa truyền emailRedirectTo; homepage không xử lý Auth return, còn callback chỉ chấp nhận PKCE. Link xác nhận mặc định có thể xác nhận email rồi trả fragment token về homepage mà frontend bỏ qua vì detectSessionInUrl tắt.
- Email từ frontend nay truyền callback cố định theo origin `/auth/callback`, SDK vẫn dùng PKCE. Trang chủ nhận cả PKCE return và link email cũ, không render catalog trước khi hoàn tất callback.
- Với link email cũ, chỉ nhận cặp token trong fragment có type signup/magiclink và bearer; từ chối token trong query, recovery, duplicate/mixed payload. Xác minh token qua Auth.getUser và email_confirmed_at trước setSession, đối chiếu user ID, không tự cấp phiên hoặc quyền bằng URL. Đây là hỗ trợ tương thích link email cũ; Google vẫn PKCE.
- Callback xóa code/token/error khỏi URL ngay, không log/echo; SDK quản lý localStorage/refresh và phát sự kiện cập nhật AuthContext. Mở lại account dùng restore/getUser hiện có. Link mới PKCE cần mở trên browser/origin đã yêu cầu gửi mail; localhost và 127.0.0.1 có storage khác nhau.
- Countdown khi bị giới hạn gửi mail dùng 60 giây, không tự khóa form một giờ theo phỏng đoán thời điểm quota reset. Server vẫn quyết định quota; thử lại không đảm bảo thư sẽ được gửi.
- 66 tests auth/SDK/callback/cooldown đạt, typecheck/build frontend đạt; lint không lỗi, còn warning có sẵn. SDK fixture xác minh persist+reload và deny token giả/unconfirmed/mismatch. Browser xác minh return lỗi từ homepage được đưa vào callback và URL sạch, không gửi mail trong test này. Thử gửi một link đăng nhập thật từ frontend cho email test đã được chủ dự án cung cấp: bị Supabase báo over_email_send_rate_limit; chưa có thư mới, chưa nghiệm thu link email thật hoàn chỉnh. Không lặp request hoặc giả lập đăng nhập khi quota bị chặn.
- Tài liệu: [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [email link fragment](https://supabase.com/docs/guides/auth/sessions/implicit-flow). Không thay cloud Site URL, provider, SMTP, schema hoặc deploy.

## Đã triển khai

- Frontend Vite riêng tại `frontend/`, không nhập vào workspace backend hoặc đổi thiết kế/CSS.
- Supabase JS 2.117.2, cùng phiên bản backend. Không đổi provider sang Auth0.
- Google qua `signInWithOAuth`, PKCE và callback cố định `/auth/callback`. Không nhận `returnTo` tùy ý; Google dùng PKCE. Hỗ trợ link email cũ được giới hạn và kiểm Auth tại D035 ở trên.
- Phone chuẩn hóa số Việt Nam sang E.164; `signInWithOtp` và `verifyOtp(type: sms)`. Chỉ chuyển sang bước nhập mã khi provider trả thành công; OTP phải là 6 chữ số. Cooldown UI 60 giây không thay rate limit server.
- Kiểm tra Auth settings chỉ đọc trước Google/SMS; provider tắt hoặc không kiểm tra được thì báo lỗi, không gửi OTP hoặc giả tạo phiên.
- AuthProvider: khôi phục phiên, xác minh user qua Auth `getUser`, theo dõi auth events/refresh, dọn subscription. Callback đổi code một lần ngay cả trong React StrictMode, xóa code/error khỏi URL và không echo lỗi provider.
- API client lấy token hiện tại từ SDK, gửi bearer trên relative `/api/v1/*`, không cookie/token query. 401 gọi signOut local; không retry mutation để tránh ghi trùng. 403/503 không tự coi là logout.
- `/profile` yêu cầu phiên; profile/địa chỉ lấy API thật, không còn hồ sơ/thiết bị mẫu. Đặt địa chỉ mặc định và xóa dùng PATCH/DELETE với `id` trong JSON như contract. Local/global logout gọi SDK thật, chỉ chuyển trang khi thành công.
- Xác nhận email/SĐT không được mô tả là KYC. Không giả lập thao tác liên kết identity hay thu hồi từng thiết bị.

## Cấu hình và ranh giới

- `SUPABASE_URL` trong `apps/web/.env.local` trước đó trỏ dashboard; đã sửa riêng sang endpoint dự án sau approval, giữ nguyên key và biến khác. Auth settings bằng publishable key trả HTTP 200.
- Vite đọc cấu hình backend ở server hoặc dùng cặp override `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` tại frontend. Chỉ cặp URL/key public được đưa vào bundle; tắt exposure tự động `VITE_*`. Chặn secret/service-role ở cả config frontend và backend; không xuất `.env` vào log/browser.
- Theo yêu cầu ghi nhớ thiết bị (D016), SDK quản lý phiên trong `localStorage` của trình duyệt và auto-refresh; khôi phục khi mở lại cùng origin/profile trình duyệt rồi xác minh user qua Auth `getUser`. Không có bản sao token tự quản lý. Adapter chuyển các khóa SDK của dự án từ sessionStorage một lần, xóa khóa cũ và dùng marker để tab cũ không hồi sinh phiên sau logout. Đây là storage JS đọc được, **không HttpOnly**, vẫn cần chống XSS; phiên chỉ tồn tại khi storage và Auth session còn hợp lệ. Trình duyệt riêng tư/xóa dữ liệu/thu hồi phiên vẫn cần đăng nhập lại.
- Local logout thu hồi refresh token phiên hiện tại; global logout thu hồi refresh token các phiên. Access token đã cấp có thể còn hiệu lực đến expiry; DB vẫn kiểm active user và quyền ở request nhạy cảm.
- Dev server bind localhost:5175, strictPort. `/api` proxy tới localhost:3000, chuyển Origin thành APP_ORIGIN upstream cố định; chặn Origin ngoài hai loopback dev origins. Backend vẫn giữ kiểm bearer, Origin và RLS, không có wildcard CORS hoặc tắt quyền.
- Dev proxy chỉ dùng local. Production/preview cần reverse proxy `/api/v1/*` cùng origin đến BFF và APP_ORIGIN đúng public origin; `vite preview` không tự cung cấp API proxy. Không triển khai production trong nhiệm vụ này.

## Cấu hình provider còn thiếu

Dashboard dự án `rbhqkpjvbnuhhfhwrhdo`, main có nhãn Production:

- Google **Disabled**, Phone **Disabled**, Email enabled.
- Site URL giữ nguyên `http://localhost:3000`.
- Sau xác nhận riêng của người dùng ngày 01/10/2026, đã Save URLs cho `http://localhost:5175/auth/callback`; dashboard xác nhận allowlist có đúng URL này (Total URLs: 1). Không đổi Site URL hoặc bật provider.
- Google: người quản trị tạo OAuth web client trong Google Cloud; authorized redirect URI phải là `https://rbhqkpjvbnuhhfhwrhdo.supabase.co/auth/v1/callback` (callback provider, khác callback frontend). Nhập Client ID/Secret trực tiếp ở Supabase Google provider, bật/save sau review consent/scopes. Không gửi secret vào chat hoặc frontend.
- Phone: chọn SMS provider hỗ trợ thị trường Việt Nam, cấu hình credential trực tiếp trên Supabase, bật phone provider sau review chi phí/quota. Chưa chọn/mua provider, chưa gửi SMS/email. Trước mở public phải kiểm thử rate limits, CAPTCHA/abuse và ngân sách; cooldown client không chống SMS pumping.
- Quyết định lịch sử 01/10: chỉ Google/phone theo D004. Yêu cầu 02/10 ở trên bổ sung email OTP; không thêm email/password.

## Kiểm chứng

- Typecheck backend: pass.
- Unit: 57/57 (gồm validation/public config, bearer contract, disabled-provider/no-fake-login và backend env).
- Integration: 34/34 (29 SQL/HTTP/deployment regression + 5 installed-SDK tests: PKCE/verifier, OTP lỗi, restore/getUser, expired-token refresh, signOut).
- Frontend và backend production build: pass; frontend lint không lỗi, còn warning ngoài auth mới. SDK integration dùng transport/storage fixture, không tạo Auth account thật.
- Browser: URL/key được nạp; Google disabled báo lỗi tại trang auth, số điện thoại sai bị chặn, `/profile` chưa có phiên chuyển `/auth`, callback lỗi xóa query và không echo raw description, trang chủ vẫn 16 cards.
- Local API/proxy: backend và frontend `/api/v1/me` không token cùng trả 401 UNAUTHENTICATED; Origin lạ tới proxy bị 403.
- Migration M1 không sửa/rerun; SHA-256 giữ `82b9ab01bd4468b2852f27a39310a02903921a5d39f0dec6182b70ed05a4546f`.

## Chưa nghiệm thu

Chưa đăng nhập Google, nhận/xác minh SMS, tạo profile từ registration, refresh/logout/revocation trên phiên Auth thật; chưa A/B qua PostgREST/API thật hoặc MFA/concurrency. Cần người dùng tự nhập credential và đăng nhập bằng tài khoản dev được phê duyệt, rồi kiểm thử hai user/hai shop. Không tạo fake users trên production để thay bằng chứng.

M1 vẫn chưa hoàn thành; chưa production-ready. Catalog/cart/orders/checkout/chat hiện còn demo riêng, không phải tích hợp đã hoàn thành. Thêm/sửa địa chỉ, avatar, liên kết/đổi identity, liệt kê và thu hồi từng thiết bị, membership administration vẫn ngoài lát cắt này.
