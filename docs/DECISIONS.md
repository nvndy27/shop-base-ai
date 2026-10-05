# Quyết định và tiến độ

## Quyết định ban đầu

| ID | Quyết định | Trạng thái |
|---|---|---|
| D001 | Đặc tả sàn nhiều shop, người mua có thể đồng thời bán | Baseline đề xuất theo yêu cầu |
| D002 | Supabase là dữ liệu/Auth/Storage; Elastic search; mô hình caption người dùng | Theo yêu cầu |
| D003 | Phong cách kem/san hô/serif, điều chỉnh cho commerce và contrast | Theo reference, token cụ thể đề xuất |
| D004 | Google OAuth + phone OTP | Diễn giải “Gmail/SĐT”; xác minh lại nếu cần giới hạn Gmail |
| D005 | Modular monolith + worker, stack TypeScript/Next.js | Đã kiểm kê: repo chỉ có docs; bootstrap BFF backend theo đề xuất, worker chưa triển khai |
| D006 | Caption bản nháp có seller duyệt; không bịa thuộc tính | Bất biến an toàn |
| D007 | COD/sandbox trước; chưa triển khai ví/escrow/payout thật | Giới hạn MVP đề xuất |

## Chưa chốt

Tên/brand; repository hiện có; provider SMS và khả năng deliver tại Việt Nam; endpoint/runtime/schema/license mô hình; provider payment/settlement; vận chuyển và phí; chính sách kiểm duyệt/đổi trả/hủy; thông tin xác minh shop; hosting/gói tài nguyên; retention và nghĩa vụ theo thị trường; ngân sách/quota; quy mô tải mong muốn.

Không cần chặn M0 để hỏi tất cả. Tới milestone phụ thuộc mới xác minh điểm cần thiết; tiếp tục phần độc lập. Không tự chọn dịch vụ trả phí hoặc xuất dữ liệu thật để giải quyết thiếu thông tin.

## Tiến độ thực

- Đã tạo bộ đặc tả Markdown.
- Đã có source backend API-only, migration M1, contracts và test; không sửa/tạo giao diện.
- M0/M1: một phần backend đã triển khai; schema M1 đã áp dụng lên Supabase và kiểm tra SQL permissions thật sau xác nhận riêng. Auth/PostgREST ứng dụng chưa nghiệm thu; M2–M7 chưa triển khai, chưa deploy ứng dụng.
- Kiểm kê `.git` ngày 01/10/2026: thư mục không chứa repository Git hợp lệ; chưa thể dùng git status/diff, không init/commit/push.

## D008 — Bootstrap backend (01/10/2026)

- Bối cảnh: repository chỉ có đặc tả, không có package manager hoặc source đang chạy.
- Quyết định triển khai: Next.js 16.3.8, React 19.3.0 (phụ thuộc Next, không có UI), Supabase JS 2.117.2, Zod 4.6.5, TypeScript 7.0.2, Vitest 5.0.3, pnpm 12.8.1; pin qua lockfile. Phiên bản và Node engines đã truy vấn npm registry khi bootstrap, không suy đoán từ bộ nhớ.
- Phạm vi: M0 nền backend + M1 identity/permissions. Không tự triển khai toàn sàn hoặc đổi provider sang Auth0. Worker/Elastic/caption/payments để milestone sau.
- Kiểm chứng: typecheck, unit, SQL/API integration, production build; chi tiết tại BACKEND_VERIFICATION.

## D009 — Phiên và hợp đồng frontend (01/10/2026)

- Lát cắt backend chỉ nhận bearer token; Auth xác minh qua `getUser`, query/RPC sử dụng JWT cùng actor. Không nhận cookie, không dùng service-role, không copy token vào localStorage.
- Google/phone vẫn dùng SDK theo API baseline. Redirect/PKCE, token storage/refresh/logout, SMS provider/rate limit cần phối hợp frontend và cấu hình Supabase thật; chưa nghiệm thu.
- Giữ nguyên method/path đã có. DTO M1 trong contracts là chi tiết triển khai của phần đặc tả chưa định nghĩa field; cần frontend review đồng bộ. Không tự thêm `/me/addresses/:id`; PATCH/DELETE mang `id` trong JSON.
- Nếu chuyển sang session cookie/BFF, phải đề xuất thay đổi trước, thêm CSRF/session lifecycle test; hiện không tuyên bố HttpOnly cookie.

## D010 — Phân quyền M1 (01/10/2026)

- Dữ liệu profile/address/shop/membership/user permission ở public schema để PostgREST xử lý JWT user + RLS. Chỉ grant cột cần đọc/sửa; không grant DML trực tiếp cho địa chỉ/shop/membership/role.
- `private` chứa helper và audit; không đưa schema này vào PostgREST exposed schemas. RPC mutation SECURITY DEFINER đặt search_path rỗng, revoke PUBLIC/anon EXECUTE, kiểm actor/trạng thái/quyền tại DB.
- Application atomic tạo shop pending và membership owner. Role catalog chỉ catalog/kho; fulfillment chỉ đơn; owner gồm cả hai. Staff bị revoke không có shop scope.
- Moderator duyệt shop cần permission `shops:moderate` ở bảng tin cậy và JWT AAL2; không duyệt shop của chính mình; state transition + audit cùng transaction. Cấp permission ban đầu qua quy trình quản trị DB tin cậy, không từ metadata hay API người dùng.
- Suspension chặn catalog/kho mới, không xóa quyền scoped với đơn đang thực hiện. Chưa triển khai đơn hoặc transition order ở M1.
- Default address có partial unique index; RPC khóa profile để serialize mutation, thất bại rollback toàn bộ. Chưa chứng minh race đa connection bằng PostgreSQL/Supabase thật.

## D011 — Áp dụng schema M1 lên Supabase được chỉ định (01/10/2026)

- Người dùng chỉ định dự án `rbhqkpjvbnuhhfhwrhdo` (`shopbase`) và xác nhận riêng việc chạy migration trên nhánh main có nhãn Production. Không suy diễn đây là phê duyệt vận hành toàn ứng dụng hoặc chạy milestone khác.
- Preflight chỉ đọc: không có bảng ứng dụng, không user Auth, không xung đột tên RPC/trigger; không có bảng `supabase_migrations.schema_migrations`.
- Áp dụng nguyên văn `202610010001_identity_and_shops.sql` qua SQL Editor; checksum editor trùng source SHA-256 `82b9ab01bd4468b2852f27a39310a02903921a5d39f0dec6182b70ed05a4546f`. Transaction báo Success; không chỉnh migration đã áp dụng.
- Kiểm tra thật bằng `supabase/tests/verify_m1_deployment.sql`: sáu bảng RLS, 10 policies, Auth trigger, default-address partial unique index, fixed search_path, column/internal helper/RPC grants và anon/subjectless deny pass. Probe trong transaction rollback, không tạo fixtures/user hay đổi grants.
- Kiểm tra cục bộ thêm regression test cho verifier: 24 unit + 29 integration; typecheck/build/check pass.
- SQL Editor snippets riêng đã lưu: migration `2c2916f1-743b-4d37-adc5-d848e26755dd`; verifier `6ecfd41c-ed19-4326-abb5-f56036cc0da3`. Không tự tạo/sửa Supabase CLI migration ledger; cần đồng bộ history theo hiện trạng trước khi chuyển CLI, không replay migration cũ.
- Chưa kiểm Auth trigger bằng đăng ký user thật, AAL2 bằng token thật, PostgREST gateway hay A/B real sessions/concurrency. Không tạo fake Auth accounts để thay bằng chứng login; provider/config/frontend lifecycle vẫn là phần chưa nghiệm thu.

## D012 — Nối Auth frontend hiện có (01/10/2026)

- Người dùng yêu cầu nối đăng nhập Google/phone thật, callback, refresh/logout; giữ thiết kế và API. Dùng frontend Vite đang có, không đổi stack/provider hoặc gom lockfile vào backend workspace.
- Supabase SDK 2.117.2; PKCE, callback fixed, AuthProvider, SDK sessionStorage/auto-refresh, bearer relative API qua dev proxy. Không localStorage, không tuyên bố HttpOnly; sessionStorage JS-readable cần XSS hardening trước public. Giữ D009 bearer/no-cookie và kiểm active user/RLS ở backend.
- Bỏ mô phỏng thành công ở login/profile/logout/địa chỉ; chức năng identity-link/device listing chưa có được thể hiện rõ không hỗ trợ. Không tự thêm password/email login hoặc chạy milestone khác.
- Sửa riêng URL env từ dashboard sang API endpoint sau approval; không thay key. Config chỉ cho publishable/anon, không expose server secret; Auth settings HTTP 200 nhưng Google/Phone disabled. Backend được khởi động cục bộ; proxy 401 không phiên và deny Origin lạ 403 đã kiểm.
- Sau xác nhận riêng của người dùng ngày 01/10/2026, đã lưu `http://localhost:5175/auth/callback` vào redirect allowlist main Production; dashboard hiển thị đúng URL, Total URLs: 1. Giữ Site URL, không bật provider. Client ID/Secret Google và SMS credential cần nhập trực tiếp dashboard, không gửi vào chat/frontend. Chưa tạo account/gửi SMS, không đổi schema/grants/migration.
- Typecheck, 57 unit + 34 integration, frontend/backend build pass; browser error/guard/callback smoke pass. Installed-SDK test dùng transport giả, chưa thay E2E bằng Auth users thật. M1 vẫn một phần; chi tiết và checklist tại AUTH_INTEGRATION.

## D013 — Giao diện tài khoản và hồ sơ xem thử cục bộ (02/10/2026)

- Theo yêu cầu chỉnh Cart/Orders/Profile: box 20–24px, nút 12–14px, bố cục giỏ hàng có tóm tắt riêng, tab và trạng thái đơn hàng rõ hơn, khoảng cách toolbar trang chủ đồng nhất 12px.
- Thêm hồ sơ mẫu `Người dùng thử` ở `/demo/cart`, `/demo/orders`, `/demo/profile`, chỉ đăng ký route trong Vite dev. Không tạo Auth user trên nhánh main Production, không thay AuthProvider/RequireAuth, không tạo session/token giả hoặc gọi API hồ sơ bằng demo identity. Profile thật tiếp tục dùng bearer/API/RLS như D012.
- Demo để xem UI, không phải nghiệm thu Auth hoặc catalog/cart/orders. Thanh toán, trả hàng và thao tác tài khoản không được thực hiện trong bản xem thử. M1 và các milestone khác giữ trạng thái hiện tại.
- Kiểm chứng: frontend build/lint pass (còn warning có sẵn); 57 unit tests pass. Browser desktop/mobile 390px không tràn ngang ở ba trang xem thử; tab đơn hàng lọc đúng, toolbar trang chủ có hai khoảng cách 12px; `/profile` không phiên vẫn chuyển `/auth`. Bundle production không chứa route hoặc identity demo. Chưa tạo tài khoản Auth thật hay kiểm API hồ sơ bằng phiên thật trong nhiệm vụ này.

## D014 — Email OTP, Cài đặt và SĐT trước mua hàng (02/10/2026)

- Chủ dự án yêu cầu đăng ký bằng mã tới Gmail, chỉ cần thêm SĐT khi mua hàng, thay “Xem thử” bằng “Cài đặt”. Bổ sung email OTP bên cạnh Google/phone theo D004; Supabase và stack giữ nguyên.
- Email dùng SDK gửi/xác minh OTP, không password hoặc admin auto-confirm. Liên kết SĐT dùng updateUser + phone_change, giữ actor/email; không đăng nhập lại qua SMS để tránh đổi tài khoản.
- Kiểm điều kiện mua tại server qua `/me/purchase-eligibility`: profile active + phone/phone_confirmed_at từ Auth.getUser, không metadata/payload. Thêm test deny email-only, anonymous, banned và metadata giả; allow SĐT thật theo Auth fixture. Endpoint đặt hàng/kho/giá chưa triển khai; server check này không hoàn thành M3.
- Cloud email templates/SMTP/SMS và tài khoản thật chưa cấu hình/tạo: cần Gmail và môi trường được người dùng chỉ định. Không tạo email giả hoặc sửa nhánh Production để thay nghiệm thu.
- Typecheck, 69 unit + 37 integration/SDK, frontend/backend build pass; lint còn warning có sẵn. M1 vẫn một phần, chưa E2E SMTP/SMS/Auth thật. Chi tiết cấu hình: AUTH_INTEGRATION.

## D015 — Lựa chọn giao diện sáng/tối (02/10/2026)

- Thêm Sáng, Tối và Theo hệ thống tại Cài đặt, dùng được khi chưa đăng nhập. Lựa chọn áp dụng toàn frontend, lưu riêng trong localStorage trên thiết bị; không lưu token hoặc thay đổi tài khoản.
- Mặc định theo hệ thống, phản ứng khi thiết bị đổi chế độ và đồng bộ lựa chọn giữa các tab. Storage bị chặn vẫn đổi giao diện trong phiên hiện tại; giá trị không hợp lệ trở về mặc định.
- Bổ sung bảng màu tối, màu chữ trên nút và trạng thái để giữ khả năng đọc; lựa chọn dùng radio bàn phím và xuống một cột trên điện thoại.
- Kiểm chứng: frontend build/lint, test lựa chọn/lưu trữ/đồng bộ; browser xác nhận sáng/tối, giữ lựa chọn sau reload và không tràn ngang tại 390px. Lint còn ba warning có sẵn; không thay schema hoặc cấu hình cloud.

## D016 — Tách đăng ký/đăng nhập và nhớ thiết bị (02/10/2026)

- Chủ dự án yêu cầu hai box riêng, mặc định Đăng ký; tài khoản có sẵn chọn Đăng nhập. Email/SMS đăng nhập gửi `shouldCreateUser: false`, đăng ký gửi `true`; Google vẫn là luồng OAuth thống nhất, không kiểm tồn tại account bằng client.
- Theo ủy quyền nhớ đăng nhập, thay quyết định storage tab-scoped trong D009/D012 bằng localStorage SDK-managed, giữ bearer/PKCE/refresh/getUser/backend authz. Không đổi sang cookie/BFF hoặc provider khác. Chuyển khóa SDK cũ một lần và ngăn tab cũ phục hồi cache sau logout.
- Đây là phiên JS-readable, không HttpOnly và không gắn phần cứng; nhớ cùng origin/profile trình duyệt khi storage/phiên còn hợp lệ. Không thay thời hạn/giới hạn phiên ở cloud. Đăng xuất vẫn gọi SDK thu hồi refresh token; server kiểm quyền như trước.
- Kiểm chứng: 44 tests Auth unit/installed-SDK pass; frontend build/lint không lỗi, còn warning có sẵn. Chưa login/refresh/logout bằng account cloud thật vì SMTP/provider chưa nghiệm thu.

## D017 — Trang chủ hai cột và điều hướng icon trên điện thoại (02/10/2026)

- Sửa lưới sản phẩm/skeleton trên trang chủ thành hai cột dưới 640px; selector riêng thắng quy tắc grid chung đang ép một cột, không đổi grid của các trang khác. Điều chỉnh khoảng cách, chữ và giá cho card hẹp.
- Thanh điều hướng dùng SVG home/shop/cart/orders/user/settings; màn hình nhỏ chỉ hiện icon với tên truy cập được, mục đang chọn và vùng bấm 44px. Logo rút thành SB dưới 480px để giữ một dòng. Icon shop dẫn tới danh sách sản phẩm hiện có, không tạo shop/dashboard giả.
- Browser đo ở 390px và 320px: hai cột sản phẩm, sáu icon cùng một hàng và không tràn ngang. Build/typecheck pass; lint còn ba warning có sẵn. Catalog vẫn dữ liệu mẫu như trước.

## D018 — Shop trong Tài khoản và lựa chọn đăng ký (02/10/2026)

- Theo yêu cầu chủ dự án: bỏ icon Shop ở header và nút Giỏ hàng/Tài khoản cạnh ô tìm kiếm; vẫn giữ năm mục điều hướng chính và lưới mobile hai cột.
- Đăng ký có Người dùng / Người bán, mặc định Người dùng. Ý định người bán chỉ hướng đến mục Shop của bạn sau xác minh OTP/OAuth, không tự cấp role hoặc dùng user_metadata làm quyền. Người bán vẫn có chức năng mua sắm; người dùng có thể đăng ký shop sau.
- Mục Shop của bạn trong Profile dùng API thật: thêm GET `/me/shops` qua active profile + membership actor + RLS; POST đăng ký dùng RPC M1 hiện có, trả pending và chờ duyệt. Không thay migration/grants/RLS hoặc triển khai catalog/dashboard seller thuộc M2.
- Typecheck, 74 unit + 39 integration/SDK, hai build pass; lint còn warning có sẵn. Test SQL deny anonymous/banned/cross-user/revoked membership, allow shop chính chủ và pending. Chưa nghiệm thu bằng Auth account thật/cloud PostgREST.

## D019 — Thanh điều hướng cố định và bóng sản phẩm (02/10/2026)

- Giữ header ở đầu viewport bằng sticky, nền đặc và z-index dưới modal. Root tăng theo toàn bộ nội dung thay vì cố định 100% chiều cao để thanh không biến mất khi cuộn quá một màn hình; anchor có khoảng trống tránh bị header che.
- Bóng card khi hover/focus dùng xanh trời pha tím nhẹ, có bảng màu sáng/tối. Loại bỏ shadow hover trùng ở Home để component dùng một nguồn, giữ nâng nhẹ và tôn trọng reduced-motion.
- Kiểm chứng browser: header top bằng 0 khi cuộn sâu trên desktop và mobile 390px; hover nhận đúng hai lớp bóng màu và nâng 4px. Frontend build pass, lint còn ba warning có sẵn.

## D020 — Dataset mạng để bắt đầu catalog/cart/order (02/10/2026)

- Chủ dự án ưu tiên năm phần catalog/search/cart/order/seller và muốn dữ liệu mạng để demo trước. Chọn snapshot DummyJSON thay sản phẩm viết tay và ảnh phong cảnh; không nhập dữ liệu người mua thật.
- 32 sản phẩm / 14 danh mục / 3 shop giả lập / 3 giỏ / 3 đơn tổng hợp chia theo shop, giá VND minh họa. Nguồn/thời điểm/hash/điều chỉnh trong snapshot, importer validate trước ghi. Đơn được tạo từ dòng giỏ nguồn, không nói đó là lịch sử mua thật.
- Home/ProductDetail dùng chung dữ liệu. Giỏ/đơn mẫu chỉ đi vào route demo; tài khoản thật chưa có API M3 thì không gán fixture của người khác. Search chỉ lọc dataset, không thay Elasticsearch như nghiệm thu tích hợp.
- Không sửa migration/cấu hình cloud/ghi dữ liệu thật. M2 mới chuẩn bị dataset; backend catalog/search/cart/order/seller tiếp tục theo lát cắt ở DEMO_COMMERCE_DATA, M2/M3 chưa hoàn thành.

## D021 — Giao diện catalog không có nhãn demo (02/10/2026)

- Theo yêu cầu chủ dự án, bỏ các banner demo, nhãn ảnh minh họa và chữ mẫu trong catalog; tên shop hiển thị bỏ hậu tố Demo. Căn danh mục/tìm kiếm/lưới cùng mép, bộ lọc bo góc và co giãn trên di động.
- Dataset vẫn giữ nguồn/provenance trong tài liệu và snapshot; đây là thay đổi trình bày, không đánh dấu M2/M3 hoàn thành hoặc bật thao tác giao dịch chưa tích hợp.

## D022 — Bố cục trang chi tiết sản phẩm (02/10/2026)

- Máy tính: giới hạn khung ảnh chính 460px ở trái, thông tin và gallery chọn ảnh bên phải. Mô tả và đánh giá nằm trong các khối bên dưới hai cột.
- Dưới 760px xếp dọc, ảnh chính tối đa 360px, thumbnail hai cột; giữ chọn ảnh và trạng thái rỗng đánh giá, không tạo đánh giá giả.

## D023 — Gợi ý tìm kiếm trong catalog hiện tại (02/10/2026)

- Home có autocomplete từ tên sản phẩm/danh mục hiện có, hỗ trợ không dấu, tối đa sáu gợi ý, chọn bằng chuột/chạm hoặc phím lên/xuống/Enter; Escape đóng danh sách. Gợi ý theo danh mục đang lọc, không thêm mục không tồn tại.
- Vẫn là tìm kiếm snapshot phía frontend, chưa tích hợp Elasticsearch hoặc API search M2.

## D024 — Tải catalog Amazon cho bài tìm kiếm (02/10/2026)

- Chủ dự án xác nhận đây là đồ án chưa có người dùng và yêu cầu tải dataset lớn. Đã lưu cục bộ 20.000 metadata sản phẩm, 4.000/nhóm từ năm nhóm Amazon Reviews 2023; nguồn/hash và giới hạn tại AMAZON_CATALOG_DATA.
- Không tải review/user/file ảnh; giữ giá USD lịch sử hoặc null, không giả tồn kho/quyền shop. File lớn ngoài bundle frontend và được gitignore.
- Chưa import Supabase/Elasticsearch hoặc thay UI; không nâng trạng thái M2/M3.

## D025 — Nhập catalog vào Elasticsearch local; chuẩn bị Supabase (02/10/2026)

- Theo yêu cầu nhập dataset vào Docker/Supabase, đã chạy Elasticsearch 9.5.4 local qua Compose, TLS/auth bật và loopback-only. Đã nhập và smoke-check 20.000 sản phẩm. Không đưa credential lên browser.
- Supabase mới chuẩn bị migration schema catalog_import có RLS và SQL transaction riêng; full import + reimport được kiểm PGlite, quyền allow/deny và constraint được test. Chưa apply cloud vì phải chọn môi trường đích; project main trước đây là Production.
- Đây là nguồn dataset học thuật tách saleable catalog, không gán owner/shop/kho/VND hoặc nghiệm thu M2. Trạng thái và lệnh tại CATALOG_IMPORT_SETUP.

## D026 — Hoàn tất nhập catalog lên Supabase cloud (03/10/2026)

- Chủ dự án yêu cầu “kiểm thử và nhập lên supabase” và xác nhận tiếp tục. Đã áp dụng migration catalog riêng một lần trên shopbase main và nhập 20.000 metadata nguồn Amazon, mỗi nhóm 4.000.
- Cloud đã kiểm count/price count, RLS hai bảng, deny SELECT anon/authenticated, allow SELECT service_role và deny quyền ghi service_role bằng scripts/verify-amazon-supabase.sql. Bảng kèm index 27 MB, toàn database 38 MB lúc kiểm.
- Giữ dataset_key/hash và upsert theo ASIN để phục hồi khi ngắt; chưa nối frontend/search API hoặc biến fixture thành hàng có kho/giá bán VND. Migration history cloud vẫn cần đồng bộ trước khi dùng db push; không replay M1/catalog.

## D027 — Nối catalog nguồn với API và Elasticsearch (03/10/2026)

- Theo yêu cầu nối API/Elastic, đã thêm hai RPC public giới hạn projection của dataset Amazon cố định; giữ RLS/deny bảng nguồn và không dùng Supabase secret. Migration mới đã áp dụng cloud một lần.
- Next.js trả danh sách/chi tiết Supabase, tìm kiếm/gợi ý/sort bằng Elastic rồi hydrate ASIN theo thứ tự từ PostgreSQL. Browser chỉ gọi BFF; key Elastic riêng read-only và CA xác minh ở server.
- Home chuyển khỏi DummyJSON, có phân trang/loading/error/retry và autocomplete 250 ms. Chi tiết dùng ASIN/ảnh/features/giá USD hoặc null; không giả SKU/kho/mua thành công.
- Kiểm thực qua API và Vite: 20.000 sản phẩm, năm danh mục, kitchen 839, điện tử/dien tu 4.000, gợi ý sáu, giá sort/pagination/bounds đạt; 122 tests và hai build đạt. Chưa deploy, chưa có đồng bộ outbox. Hợp đồng/chạy/giới hạn tại CATALOG_API.

## D028 — Thu gọn tên sản phẩm và chỉ hiện sản phẩm có giá (03/10/2026)

- Chủ dự án yêu cầu tên nhỏ hơn và lọc bỏ sản phẩm không có giá. Thẻ dùng chữ sans-serif 16px desktop/14px mobile, hai dòng cùng chiều cao; tiêu đề chi tiết 20–26px.
- Migration mới thay projection RPC để chỉ trả giá > 0, cả chi tiết và category count; Elastic range filter áp dụng search/sort/suggestions. Giữ nguồn nhập, không xóa dữ liệu thiếu giá.
- Cloud đã apply; kiểm API qua Vite xác nhận tổng 7.803, không có giá null trong danh sách/search, phân trang/sort/gợi ý/bounds đạt. Typecheck, bốn test catalog và frontend build đạt.

## D029 — Quay lại kết quả và đặt lại Trang chủ (03/10/2026)

- Từ khóa, danh mục, sắp xếp và vị trí phân trang catalog chuyển sang URL; lịch sử cursor đi cùng navigation state. Thẻ sản phẩm truyền đường về để nút mũi tên trên chi tiết khôi phục đúng kết quả, kể cả trong trạng thái tải/lỗi. Mở chi tiết trực tiếp quay về danh sách.
- Link Trang chủ trỏ `/`, xóa tìm kiếm/bộ lọc và đưa về trang đầu; ô tìm kiếm đồng bộ lại khi điều hướng. Back trình duyệt và reload giữ các tham số tìm kiếm.
- Kiểm trên localhost: tìm keyboard, lọc Điện tử, giá tăng dần, trang 2 → chi tiết → quay lại; Trang chủ trở về 7.803 sản phẩm với ô tìm kiếm rỗng. Frontend build và lint các file thay đổi đạt (còn cảnh báo effect/bundle có sẵn). Chưa deploy Vercel.

## D030 — Quay lại trước tìm kiếm và bộ lọc mobile (03/10/2026)

- Kết quả catalog có nút Quay lại trước khi mở sản phẩm. Giữ tối đa 20 màn hình catalog trước trong navigation state; khôi phục tham số và cursor history, không quay nhầm vào chi tiết. URL mở trực tiếp có đường về danh sách ban đầu.
- Danh mục/Sắp xếp dùng hai cột bằng nhau, label phía trên; mobile đặt số kết quả bên dưới để hai ô 44px luôn cùng hàng. Kiểm browser 320px/360px: cùng width/height/top, không tràn ngang; tìm kiếm rồi Quay lại khôi phục ô rỗng và 7.803 sản phẩm. Frontend build/lint đạt với cảnh báo effect/bundle cũ. Chưa deploy.

## D031 — Menu lọc đồng nhất và mũi tên có khoảng đệm (03/10/2026)

- Thay select native ở Home bằng CatalogSelect: menu bo góc, hàng lựa chọn tối thiểu 44px, dấu tích, màu theo theme; mũi tên cách mép phải khoảng 13px mobile/15px desktop. Hai ô vẫn bằng nhau và menu neo trong màn hình hẹp.
- Có listbox/combobox ARIA, chọn bằng Arrow/Enter, đóng Escape/Tab/click ngoài. Build và lint đạt (cảnh báo effect cũ); browser kiểm chọn danh mục và sort bằng bàn phím, kích thước/menu mobile. API local bị dừng trong lúc kiểm đã khởi động lại; không thay backend hay deploy.

## D032 — Luồng course marketplace và COD, caption để sau (03/10/2026)

- Chủ dự án yêu cầu tự làm phần có thể làm, không thanh toán thực tế; caption sau. Giữ catalog Amazon riêng và thêm schema commerce cho sản phẩm shop/SKU/kho/giỏ/quote/đơn snapshot nhiều shop, COD phí giao hàng 0đ. Giữ yêu cầu SĐT đã xác minh, không login giả/cấp role qua metadata.
- Mutation qua JWT user/RPC quyền server, kho/tiền transaction, idempotency và version; COD pending chưa xác nhận 7 ngày expire, confirmed cần seller xử lý. Shop suspended không bán mới, giữ quyền xử lý đơn cũ. Kiểm duyệt dùng permission shops:moderate + AAL2 và audit.
- Outbox versioned riêng, worker có lease/retry; tombstone không physical delete. Elastic local có index và khóa đọc/ghi riêng; real stale-event/tombstone check đạt. Upload decode/re-encode ảnh, bỏ EXIF, Storage chỉ server ghi; secret cần file riêng chưa cấu hình.
- Đã viết frontend tích hợp marketplace/chi tiết/giỏ/đơn/checkout/seller/địa chỉ/moderation, mock cũ chỉ còn route demo dev. Hai migration mới chưa apply cloud main Production: cần quyền riêng cho bước đó; không seed fixture Auth users lên cloud. Chi tiết/code/checks/giới hạn tại COURSE_COMMERCE. Không tuyên bố M1/M2/M3 hoặc E2E cloud hoàn tất.

## D033 — Ngôn ngữ catalog và quy đổi giá hiển thị (03/10/2026)

- Chủ dự án yêu cầu Tiếng Việt/English trong Cài đặt; chọn mô hình dịch miễn phí trên máy. Lưu lựa chọn trên trình duyệt, đổi nhãn Cài đặt/điều hướng/catalog/chi tiết; các màn nghiệp vụ khác chưa dịch toàn bộ.
- Dùng VietAI/envit5-translation, chạy CPU CTranslate2 int8 để tạo sẵn tên Việt cho sản phẩm có giá. Giữ thương hiệu khớp metadata/mã/thông số nhận diện được từ nguồn, giữ tên gốc ở chi tiết. File bản dịch riêng kiểm khớp ASIN/tên hiện tại; không sửa dữ liệu Supabase/Elastic hoặc giá giao dịch. Tên máy dịch cần rà chất lượng.
- Việt: giá nguồn USD quy đổi tham khảo sang VND bằng tỷ giá ExchangeRate-API cập nhật mỗi ngày; Anh: giá USD/tên nguồn. Cache 24 giờ, validate timestamp/tỷ giá và số an toàn, lỗi về USD; liên kết nguồn ở chân trang, bỏ dòng tỷ giá/ngày cập nhật theo yêu cầu giao diện. Giá VND của shop/đơn không đổi theo lựa chọn hiển thị.
- Gợi ý tên dịch giữ query tiếng Anh để tương thích Elastic; chưa index tìm từ khóa trên tên Việt, chưa dịch mô tả/review. Setup, hợp đồng và lệnh kiểm tại CATALOG_API. Đã tạo 7.803 hàng tên (7.641 khác nguồn, 162 giữ nguyên), kiểm hash/ASIN/mã/thông số/thương hiệu khớp metadata và API local; typecheck, 148 test qua các lượt liên quan và hai build đạt. Không deploy hoặc apply migration cloud trong lần này.

## Mẫu ADR

ID/date; bối cảnh; quyết định; phương án xem xét; tác động; ai xác nhận; file/migration; kiểm chứng; cách thay đổi an toàn. Không ghi secret hoặc PII.

## Mẫu bàn giao phiên

Nhiệm vụ và milestone; file thay đổi; tiêu chí đạt/chưa đạt; checks thực chạy; blocker; rủi ro; việc tiếp theo. Giữ log ngắn theo kết quả, tránh nhật ký mọi lệnh terminal.


## D034 — Khôi phục phiên và giao diện OTP rõ ràng (03/10/2026)

- Theo phản ánh lỗi giới hạn lúc xác nhận OTP, chặn request trùng, gộp restore đồng thời và thử khôi phục phiên đã xác minh trước khi báo lỗi xác nhận. Không giả lập phiên, bỏ Auth.getUser hay nới quota cloud.
- 429 giữ mã hiện tại và có thời gian chờ; cooldown gửi mã tồn tại giữa reload/tab chỉ bằng timestamp. Phân biệt giới hạn gửi email và lỗi xác nhận.
- Tách nút xác nhận/gửi lại/đổi địa chỉ thành các vùng rõ ràng, scoping CSS auth. 50 tests liên quan và frontend build/lint đạt, browser fixture/mobile đạt; chưa nghiệm thu email thật trong lượt sửa này.


## D035 — Confirm email hoàn tất phiên trên frontend (03/10/2026)

- Sửa Email signInWithOtp truyền emailRedirectTo `/auth/callback` theo origin hiện tại; giữ PKCE cho link mới.
- Root route xử lý Auth return thay vì bỏ qua link Confirm khi về trang chủ. Link email cũ chỉ nhận fragment signup/magiclink bearer, kiểm Auth.getUser/email_confirmed_at trước lưu SDK session và đối chiếu user ID; không token query, recovery hoặc cấp quyền bằng payload.
- Callback xóa thông tin xác thực khỏi URL và không log/echo. SDK giữ phiên trên cùng browser/origin; 66 tests liên quan/typecheck/frontend build đạt và browser error-return smoke đạt. Thử gửi link thật một lần qua frontend bị quota email Supabase chặn; chưa nghiệm thu email thật end-to-end. Không thay cloud config/deploy hoặc bỏ giới hạn server.
