# Requirements quản lý bán hàng nội bộ

Ngày tiếp nhận: 29/10/2026. Theo yêu cầu chủ dự án, đây là nguồn nghiệp vụ và nghiệm thu chính cho giai đoạn hiện tại; caption AI nằm ngoài phạm vi. Các đặc tả sàn trước đây chỉ còn giá trị tham khảo cho mã đã có, không bổ sung điều kiện nghiệm thu vào phạm vi này.

Nguồn được giữ nguyên tại [csdl-requirements.docx](reference/csdl-requirements.docx), sao chép từ project `Documents/ChatGPT/csdl`. Chọn bản mang tên `csdl-requirements.docx` làm baseline; `GR2_requirements.docx` là tài liệu đối chiếu, không tự trộn thay đổi.

SHA-256 file nguồn: `92eb4fa893e671673af2c7718fd5da4e4b9de6a8752a6f79af0a136f65120570`.

Phần dưới chuyển nội dung đoạn và bảng sang Markdown để tra cứu. Các mã KT01–KT28 là tiêu chí dự kiến, chưa phải kết quả kiểm thử. Kế hoạch triển khai: [ROADMAP](ROADMAP.md).

## Nội dung requirements gốc

YÊU CẦU HỆ THỐNG QUẢN LÝ BÁN HÀNG

1 Giới thiệu bài toán

Hệ thống được xây dựng để quản lý bán hàng cho một công ty thương mại giả định. Công ty có các sản phẩm được phân theo danh mục, bán cho khách hàng và lưu trữ tại một hoặc nhiều kho. Nhân viên cần quản lý thông tin sản phẩm, khách hàng, đơn hàng và số lượng hàng còn lại ở từng kho.

Khi lập đơn, nhân viên chọn khách hàng, kho xuất và các sản phẩm cần bán. Hệ thống tính tiền từ số lượng và đơn giá của từng sản phẩm. Khi đơn được xác nhận, số lượng tồn tại kho xuất được giảm tương ứng. Nếu không đủ hàng, hệ thống thông báo để nhân viên điều chỉnh đơn. Trường hợp hủy đơn đã xác nhận nhưng chưa giao, số lượng hàng được hoàn lại vào kho.

Ngoài các chức năng quản lý, hệ thống sử dụng Elasticsearch để tìm sản phẩm, khách hàng và đơn hàng theo từ khóa. Cơ sở dữ liệu quan hệ lưu thông tin nghiệp vụ; Elasticsearch lưu dữ liệu phục vụ tìm kiếm.

1.1 Mục đích

Quản lý dữ liệu bán hàng trong cùng một hệ thống, hạn chế nhập trùng hoặc sai thông tin.

Theo dõi đơn hàng và số lượng tồn theo từng kho.

Tự động trừ hoặc hoàn tồn khi xử lý đơn hàng.

Giúp nhân viên tra cứu thông tin theo mã, tên hoặc từ khóa.

1.2 Phạm vi

Hệ thống phục vụ một công ty bán hàng. Mỗi đơn thuộc một khách hàng và xuất từ một kho; mỗi sản phẩm có thể được lưu ở nhiều kho. Khách hàng được tạo hồ sơ trước khi lập đơn và không bắt buộc phải có tài khoản đăng nhập.

Hàng hóa được tính theo số lượng nguyên và giá tiền sử dụng VND. Phiên bản này chưa xử lý giảm giá, thuế, thanh toán trực tuyến, chia đơn ra nhiều kho, vận chuyển và trả hàng sau khi giao. Việc nhập, xuất và điều chỉnh tồn được ghi nhận trực tiếp, chưa xây dựng quy trình mua hàng từ nhà cung cấp.

1.3 Người sử dụng

Người quản lý phụ trách danh mục, sản phẩm, kho và theo dõi hoạt động bán hàng.

Nhân viên bán hàng quản lý hồ sơ khách, lập và xử lý đơn, tìm kiếm thông tin.

Nhân viên kho theo dõi tồn, ghi nhận nhập, xuất và điều chỉnh số lượng khi kiểm kê.

Ứng dụng phục vụ nhân viên thao tác nội bộ; khách hàng không trực tiếp đặt hàng. Phạm vi nghiệm thu tập trung vào nghiệp vụ tại mục 2 và tám bảng tại mục 4. Đăng nhập và phân quyền là phần mở rộng, không bắt buộc trong phiên bản này.

2 Yêu cầu chức năng

2.1 Quản lý danh mục và sản phẩm

Cho phép thêm, xem, sửa và tra cứu danh mục, sản phẩm. Mỗi sản phẩm có mã SKU duy nhất, tên, mô tả, đơn vị tính, giá bán và danh mục. Hệ thống kiểm tra mã trùng, thông tin bắt buộc và giá không âm trước khi lưu.

Sản phẩm có thể chuyển sang trạng thái ngừng kinh doanh. Chỉ được xóa khi chưa có dữ liệu tồn kho hoặc chi tiết đơn hàng tham chiếu. Danh mục chỉ được xóa khi không còn sản phẩm thuộc danh mục đó. Danh mục ngừng hoạt động không được gán cho sản phẩm mới; sản phẩm thuộc danh mục đó không được dùng để xác nhận đơn mới.

2.2 Quản lý khách hàng

Cho phép thêm và cập nhật họ tên, điện thoại, email, địa chỉ của khách. Nhân viên có thể tìm khách theo mã, tên hoặc số điện thoại và xem các đơn đã mua. Điện thoại được chuẩn hóa trước khi kiểm tra trùng; mỗi số điện thoại tương ứng với một hồ sơ khách.

Khách đã có đơn hàng được giữ lại để tra cứu lịch sử. Khi không còn sử dụng, hồ sơ chuyển sang trạng thái ngừng hoạt động. Thay đổi địa chỉ hoặc điện thoại trong hồ sơ không làm thay đổi thông tin người nhận trên đơn cũ. Chỉ được xóa hồ sơ khách chưa có đơn hàng tham chiếu.

2.3 Quản lý đơn hàng

Nhân viên chọn khách, kho xuất, sản phẩm và số lượng để tạo đơn nháp. Mỗi đơn có ít nhất một dòng sản phẩm. Hệ thống lấy giá sản phẩm làm giá mặc định của dòng hàng và tính tổng tiền. Nhân viên có thể thêm, bớt hoặc sửa dòng khi đơn còn nháp. Đơn giá lấy từ giá bán hiện tại và không cho sửa thủ công trong phạm vi phiên bản này. Khi giá sản phẩm thay đổi, đơn nháp giữ đơn giá đã lưu; nếu cần cập nhật giá, nhân viên phải chủ động lấy lại giá hiện tại trước khi xác nhận. Khi chọn khách hàng, hệ thống sao chép họ tên, điện thoại và địa chỉ sang recipient_name, recipient_phone và shipping_address. Nhân viên được sửa riêng thông tin người nhận khi đơn còn nháp mà không làm đổi hồ sơ khách. Sửa hồ sơ khách không tự cập nhật thông tin đã lưu trên đơn, kể cả đơn nháp. Nếu đổi khách của đơn nháp, hệ thống lấy lại thông tin người nhận từ khách mới và yêu cầu nhân viên kiểm tra trước khi lưu.

Hệ thống hỗ trợ xác nhận, hoàn tất và hủy đơn theo trạng thái hiện tại. Khi xác nhận, hệ thống kiểm tra lại tồn và trừ hàng tại kho đã chọn. Sau bước này, không được sửa sản phẩm, số lượng, đơn giá hoặc kho xuất. Đơn đã hoàn tất không được hủy. Thông tin khách hàng và người nhận cũng không được sửa sau xác nhận. Nhân viên chỉ chuyển hoàn tất khi đã giao hàng; phiên bản này không quản lý giao hàng từng phần.

Danh sách đơn hiển thị mã, khách, thời gian, kho xuất, trạng thái và tổng tiền. Nhân viên có thể mở chi tiết, tìm theo mã và lọc theo ngày hoặc trạng thái. Chỉ được xóa đơn còn nháp; các đơn đã xử lý được giữ để tra cứu.

2.4 Quản lý kho và tồn kho

Cho phép thêm, sửa, tra cứu kho và phân bổ sản phẩm vào kho. Mỗi cặp kho và sản phẩm có một số lượng tồn riêng. Khi mới phân bổ, số lượng bằng 0; nhân viên ghi nhận nhập kho để tăng số lượng.

Hệ thống hỗ trợ nhập kho, xuất kho thủ công và điều chỉnh theo kết quả kiểm kê. Mỗi lần thay đổi phải có số lượng, thời gian và lý do. Không cho phép xuất hoặc điều chỉnh làm tồn âm. Số lượng tồn không được sửa trực tiếp mà phải thông qua một trong các thao tác trên. Xuất thủ công chỉ dùng cho nghiệp vụ ngoài bán hàng, không dùng để xuất lại hàng của đơn đã xác nhận. Kho ngừng hoạt động không được nhập, xuất hoặc điều chỉnh tồn. Nhập, xuất thủ công và điều chỉnh đều cập nhật inventory và ghi stock_movements trong cùng một giao dịch; lỗi ở bất kỳ bước nào phải hoàn tác toàn bộ. Mọi thao tác làm đổi tồn phải kiểm soát cập nhật đồng thời trên cùng cặp kho và sản phẩm, kể cả khi diễn ra cùng lúc với xác nhận hoặc hủy đơn. Gửi lại cùng thao tác thủ công phải dùng lại request_key; nếu nội dung giống lần đã xử lý thì trả kết quả cũ, không ghi hoặc thay đổi tồn thêm. Nếu cùng khóa nhưng khác kho, sản phẩm, loại hoặc số lượng thì báo lỗi xung đột, không cập nhật.

Nhân viên có thể xem lịch sử biến động theo sản phẩm, kho, thời gian hoặc đơn hàng. Các lần bán hàng và hoàn tồn do hủy đơn cũng được ghi vào lịch sử. Không cho sửa hoặc xóa các bản ghi này; nếu ghi sai phải tạo lần điều chỉnh bù kèm lý do.

Kho chỉ được ngừng hoạt động khi không còn hàng và không còn đơn nháp hoặc đơn đã xác nhận đang chờ xử lý. Không giảm số tồn trên hệ thống chỉ để đủ điều kiện ngừng kho.

2.5 Tìm kiếm bằng Elasticsearch

Cho phép chọn nhóm dữ liệu cần tìm gồm sản phẩm, khách hàng hoặc đơn hàng. Sản phẩm được tìm theo mã, tên và mô tả; khách được tìm theo mã, tên hoặc điện thoại; đơn được tìm theo mã, tên người nhận hoặc tên sản phẩm trong đơn.

Kết quả hiển thị thông tin ngắn gọn, có phân trang và cho phép mở chi tiết. Mã khớp chính xác được ưu tiên; các kết quả tìm theo tên hoặc mô tả được sắp theo mức phù hợp. Khi không tìm thấy, hệ thống thông báo rõ. Nếu dịch vụ tìm kiếm gặp lỗi, phải báo lỗi thay vì hiển thị như không có dữ liệu.

Thông tin khách hàng và đơn hàng chỉ phục vụ tra cứu nội bộ. Có thể bổ sung tìm không dấu, lọc theo danh mục, khoảng giá và sắp xếp kết quả nếu thời gian thực hiện cho phép.

3 Quy trình xử lý đơn và quy tắc dữ liệu

3.1 Các bước xử lý đơn

1. Nhân viên chọn hoặc tạo khách hàng, chọn kho xuất và thêm các sản phẩm cần mua.

2. Hệ thống lưu đơn nháp cùng chi tiết. Bước này chưa giữ hàng và chưa trừ tồn.

3. Khi xác nhận, hệ thống kiểm tra khách, kho, sản phẩm còn hoạt động và đủ số lượng tại kho xuất.

4. Nếu mọi dòng đều đủ hàng, hệ thống trừ tồn, ghi lịch sử xuất do bán và chuyển đơn sang đã xác nhận.

5. Khi hàng đã giao, nhân viên chuyển đơn sang hoàn tất. Hệ thống không trừ tồn thêm lần nữa.

6. Nếu hủy trước khi giao, hệ thống xử lý theo bảng dưới.

| Trạng thái hiện tại | Thao tác được thực hiện | Thay đổi tồn kho |
| --- | --- | --- |
| Nháp | Sửa, xóa, xác nhận hoặc hủy | Chỉ trừ khi xác nhận thành công |
| Đã xác nhận | Hoàn tất hoặc hủy trước khi giao | Hủy thì hoàn số lượng về kho gốc |
| Hoàn tất | Xem và tra cứu | Không thay đổi |
| Đã hủy | Xem và tra cứu | Không thay đổi thêm |

3.2 Quy tắc cần tuân theo

Một sản phẩm chỉ xuất hiện một lần trong cùng đơn. Nếu chọn lại thì cập nhật số lượng hoặc báo đã có.

Số lượng mua là số nguyên lớn hơn 0; giá bán và số lượng tồn không âm.

Đơn giá được lưu tại từng dòng của đơn. Đổi giá sản phẩm sau này không làm thay đổi giá của đơn đã xác nhận. Quy tắc giữ giá cũng áp dụng cho đơn nháp, trừ khi nhân viên chủ động cập nhật giá theo mục 2.3.

Tên sản phẩm và thông tin người nhận cũng được lưu theo đơn để giữ lại thông tin lúc bán.

Thành tiền bằng số lượng nhân đơn giá. Tổng đơn bằng tổng thành tiền các dòng, do hệ thống tính.

Nếu một mặt hàng thiếu tồn, cả đơn không được xác nhận và không được trừ một phần.

Cập nhật trạng thái đơn, tồn và lịch sử phải cùng thành công hoặc cùng hủy bỏ khi có lỗi. Việc này được xử lý bằng giao dịch của cơ sở dữ liệu.

Khi hai người cùng đặt hàng, hệ thống phải kiểm soát cập nhật để không bán vượt tồn. Gửi lại yêu cầu xác nhận hoặc hủy không được làm trừ hoặc hoàn kho lần hai.

Không xóa khách, sản phẩm hoặc kho đã được đơn hàng sử dụng. Thay vào đó, chuyển sang ngừng hoạt động khi đủ điều kiện.

Khách, kho, sản phẩm hoặc danh mục đã ngừng hoạt động không được dùng để xác nhận đơn mới. Đơn đã xác nhận vẫn được hoàn tất hoặc hủy theo quy định.

Ví dụ, kho có 10 sản phẩm A. Tạo đơn nháp mua 3 sản phẩm thì tồn vẫn là 10. Xác nhận đơn làm tồn còn 7. Nếu hủy đơn trước khi giao, tồn trở lại 10. Hủy lại cùng đơn không làm số lượng tăng thêm.

3.3 Chuẩn hóa và kiểm tra dữ liệu

Các quy tắc sau áp dụng thống nhất khi thêm, sửa, nhập dữ liệu mẫu và tìm kiếm chính xác. Backend chuẩn hóa trước, sau đó kiểm tra định dạng, độ dài và tính duy nhất; cơ sở dữ liệu vẫn phải có ràng buộc UNIQUE. Không tự sửa dữ liệu sai thành một giá trị khác để lưu.

Mã nghiệp vụ và SKU: bỏ khoảng trắng đầu, cuối và chuyển chữ cái sang chữ hoa. Chỉ nhận chữ A–Z, chữ số 0–9, dấu gạch ngang và gạch dưới; ký tự đầu phải là chữ hoặc số, không nhận khoảng trắng bên trong. Kiểm tra độ dài theo từng trường tại mục 4 sau chuẩn hóa. Ví dụ, “ sp-001 ” được lưu thành “SP-001” và bị coi là trùng với “sp-001”.

Tính duy nhất của mã: kiểm tra trong từng bảng tương ứng; riêng SKU duy nhất trên toàn bộ bảng products. Mã của bản ghi ngừng hoạt động vẫn được giữ và không được dùng lại cho bản ghi mới. Khi sửa, loại chính bản ghi đang sửa khỏi phép kiểm tra trùng. Cơ sở dữ liệu phải ngăn được hai yêu cầu đồng thời tạo cùng mã.

Điện thoại: trong phạm vi đồ án, chỉ nhận số Việt Nam dạng 0 kèm 9 chữ số hoặc +84 kèm 9 chữ số; chữ số đầu sau 0 hoặc +84 phải khác 0. Cho phép khoảng trắng, dấu chấm và gạch ngang để phân cách khi nhập; loại các dấu phân cách này trước khi kiểm tra, từ chối chữ cái và ký tự khác. Dạng 0 được đổi sang +84 để lưu và tìm chính xác. Ví dụ “0912 345 678” và “+84 912-345-678” cùng thành “+84912345678”. Chưa hỗ trợ số bàn, số quốc tế khác hoặc số máy lẻ.

Quy tắc trùng điện thoại chỉ áp dụng cho customers.phone, kể cả hồ sơ ngừng hoạt động. recipient_phone áp dụng cùng quy tắc định dạng nhưng không UNIQUE vì một số có thể xuất hiện trên nhiều đơn. Khi cập nhật hồ sơ khách, không coi số hiện tại của chính hồ sơ đó là trùng.

Tên, địa chỉ và đơn vị tính: chuẩn hóa Unicode NFC, bỏ khoảng trắng đầu, cuối và gộp khoảng trắng liên tiếp thành một dấu cách; giữ nguyên dấu tiếng Việt và cách viết hoa do người dùng nhập. Trường bắt buộc không được chỉ chứa khoảng trắng. Mô tả và ghi chú giữ xuống dòng, chỉ bỏ khoảng trắng đầu, cuối; trường tùy chọn bỏ trống được lưu là NULL.

Email: không bắt buộc và không đặt UNIQUE. Nếu có, bỏ khoảng trắng đầu, cuối, kiểm tra định dạng địa chỉ email, không nhận khoảng trắng bên trong và giới hạn 254 ký tự. Giữ nguyên phần trước @, chuyển phần tên miền sang chữ thường; chuỗi rỗng sau chuẩn hóa được lưu là NULL.

Số lượng và tiền: backend nhận giá trị số, không nhận chuỗi có dấu phân cách hàng nghìn. Số lượng mua là số nguyên dương; tồn kho là số nguyên không âm; số lượng biến động là số nguyên khác 0. Giá tính bằng đồng VND, là số nguyên không âm trong giới hạn NUMERIC(14,0); từ chối phần thập phân và giá trị vượt giới hạn, không tự làm tròn. Tổng tiền tính bằng số thập phân chính xác hoặc số nguyên có kiểm soát tràn số.

Khi nhập hoặc sửa có lỗi, hệ thống nêu rõ trường và lý do; không lưu một phần bản ghi hoặc đơn hàng. Tìm chính xác theo mã và điện thoại phải dùng cùng quy tắc chuẩn hóa như lúc lưu. Chuẩn hóa mới không được làm thay đổi các thông tin lịch sử đã chốt trên đơn xác nhận.

4 Dữ liệu cần quản lý

Phần nghiệp vụ cốt lõi gồm tám bảng. Bảng tồn kho thể hiện số lượng hiện tại; bảng biến động kho ghi lại từng lần thay đổi. Hai bảng chi tiết đơn hàng và tồn kho sử dụng khóa chính ghép. Các bảng còn lại dùng UUID làm khóa chính.

Trong các bảng dưới, PK là khóa chính, FK là khóa ngoại và UNIQUE là giá trị không được trùng. Các trường bắt buộc phải có dữ liệu, trừ những trường ghi rõ có thể để trống. Tiền dùng NUMERIC, thời gian dùng TIMESTAMPTZ theo PostgreSQL.

4.1 Danh mục sản phẩm

Bảng categories dùng để phân loại sản phẩm.

| Thuộc tính | Kiểu dữ liệu | Ý nghĩa và ràng buộc |
| --- | --- | --- |
| id | UUID | PK, hệ thống tự tạo |
| code | VARCHAR(20) | Mã danh mục, UNIQUE |
| name | VARCHAR(100) | Tên danh mục |
| description | TEXT | Mô tả, có thể để trống |
| is_active | BOOLEAN | Đang sử dụng hay ngừng, mặc định true |

4.2 Sản phẩm

Bảng products lưu thông tin hiện tại của sản phẩm, không lưu số tồn chung cho mọi kho.

| Thuộc tính | Kiểu dữ liệu | Ý nghĩa và ràng buộc |
| --- | --- | --- |
| id | UUID | PK, hệ thống tự tạo |
| sku | VARCHAR(40) | Mã sản phẩm, UNIQUE toàn công ty |
| category_id | UUID | FK đến categories |
| name | VARCHAR(200) | Tên sản phẩm |
| description | TEXT | Mô tả, có thể để trống |
| unit | VARCHAR(30) | Đơn vị tính, ví dụ cái hoặc hộp |
| current_price | NUMERIC(14,0) | Giá bán hiện tại, từ 0 trở lên |
| is_active | BOOLEAN | Đang kinh doanh, mặc định true |
| created_at | TIMESTAMPTZ | Thời điểm tạo |
| updated_at | TIMESTAMPTZ | Thời điểm cập nhật gần nhất |

4.3 Khách hàng

Bảng customers lưu hồ sơ liên hệ của khách.

| Thuộc tính | Kiểu dữ liệu | Ý nghĩa và ràng buộc |
| --- | --- | --- |
| id | UUID | PK, hệ thống tự tạo |
| code | VARCHAR(30) | Mã khách, UNIQUE |
| full_name | VARCHAR(150) | Họ tên khách |
| phone | VARCHAR(20) | Điện thoại chuẩn hóa, UNIQUE |
| email | VARCHAR(254) | Email, có thể để trống |
| address | VARCHAR(300) | Địa chỉ liên hệ mặc định |
| is_active | BOOLEAN | Đang sử dụng, mặc định true |
| created_at | TIMESTAMPTZ | Thời điểm tạo |
| updated_at | TIMESTAMPTZ | Thời điểm cập nhật gần nhất |

Điện thoại được lưu bằng chuỗi theo dạng +84 sau khi chuẩn hóa theo mục 3.3. Mã khách và ID được giữ nguyên sau khi tạo.

4.4 Kho hàng

Bảng warehouses lưu thông tin địa điểm chứa hàng.

| Thuộc tính | Kiểu dữ liệu | Ý nghĩa và ràng buộc |
| --- | --- | --- |
| id | UUID | PK, hệ thống tự tạo |
| code | VARCHAR(20) | Mã kho, UNIQUE |
| name | VARCHAR(100) | Tên kho |
| address | VARCHAR(300) | Địa chỉ kho |
| is_active | BOOLEAN | Đang hoạt động, mặc định true |
| created_at | TIMESTAMPTZ | Thời điểm tạo |
| updated_at | TIMESTAMPTZ | Thời điểm cập nhật gần nhất |

4.5 Tồn kho

Bảng inventory lưu số lượng một sản phẩm tại một kho.

| Thuộc tính | Kiểu dữ liệu | Ý nghĩa và ràng buộc |
| --- | --- | --- |
| warehouse_id | UUID | PK ghép, FK đến warehouses |
| product_id | UUID | PK ghép, FK đến products |
| quantity | INTEGER | Tồn hiện tại, không âm, mặc định 0 |
| updated_at | TIMESTAMPTZ | Lần thay đổi tồn gần nhất |

Khóa chính là cặp warehouse_id và product_id. Một cặp chỉ có một bản ghi. Không có bản ghi nghĩa là sản phẩm chưa được phân bổ vào kho đó và chưa có hàng để bán từ kho này.

4.6 Đơn hàng

Bảng orders lưu thông tin chung và người nhận của đơn.

| Thuộc tính | Kiểu dữ liệu | Ý nghĩa và ràng buộc |
| --- | --- | --- |
| id | UUID | PK, hệ thống tự tạo |
| code | VARCHAR(30) | Mã đơn, UNIQUE |
| customer_id | UUID | FK đến customers |
| warehouse_id | UUID | FK đến warehouses, kho xuất cả đơn |
| status | VARCHAR(20) | DRAFT, CONFIRMED, COMPLETED hoặc CANCELLED |
| placed_at | TIMESTAMPTZ | Thời điểm tạo đơn |
| confirmed_at | TIMESTAMPTZ | Thời điểm xác nhận, để trống trước xác nhận |
| completed_at | TIMESTAMPTZ | Thời điểm hoàn tất, chỉ có khi hoàn tất |
| cancelled_at | TIMESTAMPTZ | Thời điểm hủy, chỉ có khi hủy |
| recipient_name | VARCHAR(150) | Tên người nhận theo đơn |
| recipient_phone | VARCHAR(20) | Điện thoại người nhận |
| shipping_address | VARCHAR(300) | Địa chỉ nhận hàng |
| note | VARCHAR(500) | Ghi chú, có thể để trống |
| updated_at | TIMESTAMPTZ | Thời điểm cập nhật gần nhất |

Đơn mới có trạng thái DRAFT. Tổng tiền được tính từ chi tiết, không lưu thêm một cột tổng phải cập nhật riêng. Thời điểm xử lý không được trước thời điểm tạo đơn. confirmed_at được giữ lại nếu đơn đã xác nhận sau đó bị hủy. Đơn hủy từ nháp không có confirmed_at; completed_at và cancelled_at không được đồng thời có giá trị. Trạng thái và thời điểm phải nhất quán: DRAFT chưa có thời điểm xử lý; CONFIRMED phải có confirmed_at; COMPLETED phải có confirmed_at và completed_at; CANCELLED phải có cancelled_at. Thời điểm hoàn tất hoặc hủy sau xác nhận không được trước confirmed_at. Đơn đã hủy không được mở lại để sửa, xác nhận hoặc hoàn tất.

4.7 Chi tiết đơn hàng

Bảng order_items lưu các sản phẩm được mua trong đơn.

| Thuộc tính | Kiểu dữ liệu | Ý nghĩa và ràng buộc |
| --- | --- | --- |
| order_id | UUID | PK ghép, FK đến orders |
| product_id | UUID | PK ghép, FK đến products |
| product_name_at_order | VARCHAR(200) | Tên sản phẩm được lưu khi thêm vào đơn |
| quantity | INTEGER | Số lượng mua, lớn hơn 0 |
| unit_price | NUMERIC(14,0) | Đơn giá của dòng, không âm |

Khóa chính là cặp order_id và product_id. Đơn giá tại đây được dùng để tính tiền của đơn, không lấy lại giá hiện tại từ products khi xem đơn cũ.

4.8 Biến động kho

Bảng stock_movements ghi lịch sử nhập, xuất và điều chỉnh số lượng.

| Thuộc tính | Kiểu dữ liệu | Ý nghĩa và ràng buộc |
| --- | --- | --- |
| id | UUID | PK, hệ thống tự tạo |
| warehouse_id | UUID | Cùng product_id tham chiếu inventory |
| product_id | UUID | Cùng warehouse_id tham chiếu inventory |
| order_id | UUID | FK đến orders, để trống với thao tác thủ công |
| movement_type | VARCHAR(20) | IN, OUT, ADJUSTMENT, SALE hoặc CANCEL |
| quantity_delta | INTEGER | Số tăng hoặc giảm, khác 0 |
| reason | VARCHAR(300) | Lý do thay đổi |
| request_key | UUID | UNIQUE cho từng biến động; khi gửi lại cùng thao tác phải dùng lại khóa của biến động đó, không dùng chung một khóa cho nhiều dòng sản phẩm |
| occurred_at | TIMESTAMPTZ | Thời điểm ghi nhận |

IN là nhập kho; OUT là xuất thủ công; ADJUSTMENT là điều chỉnh; SALE là xuất do bán; CANCEL là hoàn do hủy đơn. Tăng hàng dùng số dương, giảm hàng dùng số âm. Chỉ SALE và CANCEL bắt buộc gắn đơn hàng. Một sản phẩm trong một đơn chỉ được có một lần SALE và một lần CANCEL. IN và CANCEL có số lượng dương; OUT và SALE có số lượng âm; ADJUSTMENT có thể dương hoặc âm. IN, OUT và ADJUSTMENT phải để order_id trống. SALE và CANCEL phải khớp kho, sản phẩm, số lượng của đơn; CANCEL chỉ được ghi nếu trước đó đã có SALE tương ứng. Ràng buộc duy nhất có điều kiện trên (order_id, product_id, movement_type) áp dụng cho SALE và CANCEL để tránh ghi lặp theo từng dòng; khóa request_key phân biệt từng biến động, kể cả khi cùng một đơn có nhiều sản phẩm.

Các thời điểm tạo được hệ thống cấp tự động; thời điểm cập nhật được thay đổi khi có thao tác sửa. Mã nghiệp vụ và SKU không được để trống, được chuẩn hóa trước khi kiểm tra trùng. Với SALE và CANCEL, backend sinh khóa cho từng biến động và kiểm tra trạng thái đơn cùng ràng buộc duy nhất theo dòng hàng để chống ghi lặp. Với thao tác kho thủ công, bên gửi tạo và giữ nguyên request_key cho tới khi biết kết quả; không sinh khóa mới chỉ vì hết thời gian chờ phản hồi.

5 Quan hệ giữa các bảng

| Quan hệ | Quy định |
| --- | --- |
| Danh mục và sản phẩm | Một danh mục có thể có nhiều sản phẩm; mỗi sản phẩm thuộc một danh mục |
| Khách hàng và đơn hàng | Một khách có thể có nhiều đơn; mỗi đơn thuộc một khách |
| Kho và đơn hàng | Một kho xuất nhiều đơn; mỗi đơn xuất từ một kho |
| Đơn hàng và chi tiết | Một đơn có ít nhất một chi tiết; mỗi chi tiết thuộc một đơn |
| Sản phẩm và chi tiết | Một sản phẩm có thể xuất hiện trong nhiều đơn |
| Sản phẩm và tồn kho | Một sản phẩm có thể có tồn ở nhiều kho |
| Kho và tồn kho | Một kho có thể chứa nhiều sản phẩm |
| Tồn kho và biến động | Một cặp kho–sản phẩm có thể có nhiều lần biến động |
| Đơn và biến động | Một đơn có thể gây nhiều biến động; biến động thủ công không gắn đơn |

Danh mục, khách hàng, kho hoặc sản phẩm mới tạo có thể chưa có dữ liệu liên quan. Riêng đơn đã lưu phải có ít nhất một dòng. Quan hệ nhiều–nhiều giữa sản phẩm và kho được tách bằng inventory; giữa sản phẩm và đơn được tách bằng order_items.

Các khóa ngoại ngăn việc lưu tham chiếu không tồn tại. Không xóa dây chuyền từ khách hoặc sản phẩm sang đơn cũ. Khi xóa một đơn nháp hợp lệ, hệ thống xóa các dòng và đơn trong cùng một giao dịch. Không xóa kho hoặc bản ghi inventory đã có biến động kho. Bản ghi inventory chỉ được xóa khi số lượng bằng 0 và chưa có biến động tham chiếu. Các khóa ngoại lịch sử dùng RESTRICT hoặc NO ACTION; chỉ chi tiết của đơn nháp được xóa cùng đơn theo thao tác hợp lệ.

Dữ liệu được tách theo từng đối tượng để tránh lặp thông tin: tên danh mục lưu tại danh mục, địa chỉ kho lưu tại kho, còn số lượng tồn phụ thuộc cả kho và sản phẩm. Tên sản phẩm, đơn giá và người nhận trên đơn được giữ riêng vì đó là thông tin tại lúc bán. Các trường này không cập nhật theo hồ sơ hiện tại.

6 Tổ chức dữ liệu tìm kiếm

Elasticsearch được tổ chức thành ba index tương ứng với ba nhóm tra cứu.

| Index | Dữ liệu chính |
| --- | --- |
| products | ID, SKU, tên, mô tả, danh mục, giá và trạng thái sản phẩm |
| customers | ID, mã khách, họ tên, điện thoại, email và địa chỉ |
| orders | ID, mã đơn, khách, người nhận, trạng thái, ngày đặt, tổng tiền và tên sản phẩm theo đơn |

Tên và mô tả dùng kiểu text để tìm theo từ khóa. Mã, điện thoại và trạng thái dùng keyword để tìm chính xác. Giá dùng kiểu số, ngày dùng kiểu thời gian. ID trong mỗi tài liệu tìm kiếm trùng ID của bản ghi nguồn để có thể mở đúng chi tiết.

Khi thêm, sửa hoặc xóa dữ liệu thành công ở cơ sở dữ liệu quan hệ, backend cập nhật dữ liệu tìm kiếm tương ứng. Tổng tiền và tên sản phẩm của index đơn được lấy từ chi tiết đơn đã lưu. Thay đổi giá hoặc tên hiện tại của sản phẩm không làm đổi nội dung lịch sử này.

Dữ liệu tìm kiếm có thể cập nhật chậm hơn dữ liệu nghiệp vụ. Khi mở chi tiết hoặc xác nhận đơn, hệ thống đọc lại cơ sở dữ liệu quan hệ. Nếu Elasticsearch tạm ngừng, đơn hàng vẫn được lưu và xử lý bình thường; dữ liệu tìm kiếm được nạp lại sau. Hệ thống cần có lệnh nạp dữ liệu ban đầu và nạp lại index khi cần khôi phục dữ liệu tìm kiếm. Khi cập nhật Elasticsearch thất bại, backend ghi nhận lỗi để thử lại hoặc nạp lại dữ liệu; lỗi tìm kiếm không được làm hủy giao dịch nghiệp vụ đã thành công. Trong phạm vi đồ án, phải có cơ chế thử lại có thể kiểm chứng hoặc quy trình nạp lại được hướng dẫn rõ.

7 Yêu cầu khi sử dụng hệ thống

Thông báo rõ khi thiếu trường, mã trùng, số lượng sai, không đủ hàng hoặc thao tác không phù hợp với trạng thái đơn.

Hiển thị và lưu đúng tiếng Việt. Tiền không sử dụng kiểu số thực có sai số.

Danh sách và kết quả tìm kiếm có phân trang; không tải toàn bộ dữ liệu trong một lần.

Kiểm tra dữ liệu tại backend và cơ sở dữ liệu, không chỉ ở giao diện.

Các quy tắc nghiệp vụ phải được kiểm tra tại backend, áp dụng thống nhất cho mọi thao tác trong phiên bản này.

Có dữ liệu mẫu và hướng dẫn tạo cơ sở dữ liệu, chạy ứng dụng, nạp dữ liệu Elasticsearch.

8 Tiêu chí kiểm thử và nghiệm thu

Các ca dưới đây là tiêu chí nghiệm thu dự kiến, chưa phải kết quả kiểm thử ứng dụng. Chạy mỗi ca độc lập trên dữ liệu mẫu và ghi lại kết quả thực tế. Trừ ca nêu riêng, khách hàng, danh mục, sản phẩm và kho đều đang hoạt động; mã và điện thoại hợp lệ. A và B là hai sản phẩm mẫu. Với ca đồng thời hoặc gây lỗi, đối chiếu cả đơn hàng, inventory và stock_movements trong cơ sở dữ liệu.

| Mã | Nội dung | Đầu vào và thao tác | Kết quả mong đợi |
| --- | --- | --- | --- |
| KT01 | Chuẩn hóa mã | Đã có SKU SP-001; thêm SKU “ sp-001 ”. | Báo trùng; không tạo sản phẩm mới. Mã hợp lệ mới được lưu ở dạng chữ hoa. |
| KT02 | Mã sai hoặc trùng đồng thời | Nhập mã có khoảng trắng bên trong, ký tự / hoặc vượt độ dài; gửi đồng thời hai yêu cầu tạo cùng mã hợp lệ. | Từ chối mã sai; hai yêu cầu cùng mã chỉ tạo tối đa một bản ghi, yêu cầu còn lại nhận lỗi trùng rõ ràng. |
| KT03 | Chuẩn hóa điện thoại | Tạo khách bằng 0912 345 678; tạo khách khác bằng +84 912-345-678. | Khách đầu lưu +84912345678; khách thứ hai bị báo trùng. Sửa khách đầu và giữ số cũ vẫn thành công. |
| KT04 | Điện thoại không hợp lệ | Nhập số có chữ cái, thiếu chữ số hoặc mã quốc gia ngoài +84. | Báo lỗi định dạng; không lưu hồ sơ. Không tự cắt ký tự sai để biến thành số hợp lệ. |
| KT05 | Trường bắt buộc và email | Tên chỉ có khoảng trắng; email sai định dạng; email tùy chọn để trống; tên hợp lệ có nhiều khoảng trắng. | Từ chối tên rỗng và email sai; email trống lưu NULL; tên hợp lệ được gộp khoảng trắng và giữ dấu tiếng Việt. |
| KT06 | Số lượng và giá | Nhập lượng mua 0, -1 hoặc 1,5; giá âm, có phần thập phân hoặc vượt NUMERIC(14,0). | Từ chối từng giá trị sai; không làm tròn hoặc lưu một phần đơn. |
| KT07 | Đơn nháp và dòng trùng | Kho có A = 10; lưu nháp mua A = 3; thêm lại A rồi sửa lượng thành 4. | Tồn vẫn 10; không có SALE; đơn chỉ có một dòng A với lượng 4. |
| KT08 | Đơn thiếu chi tiết | Lưu đơn không có dòng hàng hoặc xóa dòng cuối rồi lưu. | Từ chối lưu; đơn đã lưu luôn có ít nhất một dòng hợp lệ. |
| KT09 | Xác nhận đúng kho | Kho K1 có A = 10, K2 có A = 20; xác nhận đơn A = 3 tại K1. | Đơn CONFIRMED; K1 còn 7, K2 vẫn 20; có một SALE bằng -3 tại K1 và confirmed_at. |
| KT10 | Một dòng thiếu hàng | Kho có A = 10, B = 1; xác nhận đơn A = 3 và B = 2. | Đơn giữ DRAFT; tồn A và B không đổi; không có SALE nào của đơn. |
| KT11 | Gửi lại xác nhận | Kho A = 10; đơn DRAFT mua A = 3. Gửi hai yêu cầu xác nhận đồng thời, sau đó gửi lại khi đơn đã CONFIRMED. | Chỉ một lần chuyển sang CONFIRMED; tồn cuối 7; chỉ một SALE bằng -3. Yêu cầu lặp không tạo thêm biến động. |
| KT12 | Hủy đơn nháp | Kho A = 10; hủy đơn DRAFT mua A = 3. | Đơn CANCELLED, có cancelled_at; tồn vẫn 10; confirmed_at trống; không có SALE hoặc CANCEL. |
| KT13 | Hủy đơn đã xác nhận | Kho A từ 10 còn 7 sau xác nhận đơn A = 3; hủy khi chưa giao rồi gửi lại yêu cầu hủy. | Tồn trở về 10, không tăng thêm; chỉ một CANCEL bằng +3; giữ confirmed_at và ghi cancelled_at. |
| KT14 | Đơn có nhiều sản phẩm | Xác nhận rồi hủy đơn gồm A = 3 và B = 2, cả hai đều đủ hàng. | Mỗi sản phẩm có một SALE và một CANCEL; mỗi biến động có request_key riêng; tồn cả hai được hoàn đúng. |
| KT15 | Khóa đơn và hoàn tất | Khi đơn ở CONFIRMED, thử sửa sản phẩm, lượng, giá, kho, khách và người nhận. Sau đó hoàn tất, thử hủy và gửi lại yêu cầu hoàn tất. | Từ chối sửa ngay từ CONFIRMED. Hoàn tất không đổi tồn; completed_at không trước confirmed_at. Đơn COMPLETED không được hủy; yêu cầu lặp không đổi tồn hoặc tạo lịch sử. |
| KT16 | Giữ giá và thông tin lịch sử | Lập nháp A giá 100000; đổi giá hiện tại thành 120000; cập nhật giá nháp chủ động rồi xác nhận. Sau đó sửa tên A và hồ sơ khách. | Nháp giữ 100000 cho tới khi chủ động lấy giá 120000. Sau xác nhận, giá, tên sản phẩm và người nhận trên đơn không đổi theo hồ sơ nguồn. |
| KT17 | Tính tổng tiền | Đơn có A: lượng 3, giá 100000; B: lượng 2, giá 250000. | Thành tiền lần lượt 300000 và 500000; tổng 800000 VND, tính chính xác từ các dòng đã lưu. |
| KT18 | Bán đồng thời vượt tồn | Kho A = 5; hai đơn cùng xác nhận, mỗi đơn mua A = 4. | Chỉ một đơn thành công; tồn cuối là 1; đơn còn lại không có SALE và được báo thiếu hàng. |
| KT19 | Hoàn tác khi lỗi | Gây lỗi sau khi trừ tồn nhưng trước khi ghi đủ lịch sử hoặc cập nhật trạng thái. | Toàn bộ giao dịch bị hoàn tác; trạng thái, tồn và lịch sử trở về trước thao tác. |
| KT20 | Nhập xuất và điều chỉnh | Kho A = 5; nhập +3, xuất thủ công -2, điều chỉnh -1 bằng ba khóa khác nhau. Gửi lại một thao tác với đúng khóa cũ; thử giảm quá tồn và sửa/xóa lịch sử. | Tồn lần lượt 8, 6, 5; có đủ ba biến động đúng dấu và lý do. Yêu cầu lặp trả kết quả cũ, không đổi tồn; từ chối tồn âm và sửa/xóa lịch sử. |
| KT21 | Ràng buộc tham chiếu và xóa | Xóa khách/sản phẩm/kho đã có đơn; xóa inventory đã có biến động; xóa đơn DRAFT hợp lệ. | Từ chối xóa dữ liệu đang được tham chiếu; đơn nháp và chi tiết được xóa cùng giao dịch, không đổi tồn. |
| KT22 | Dữ liệu ngừng hoạt động | Lần lượt ngừng khách, sản phẩm hoặc danh mục rồi xác nhận đơn liên quan; ngừng kho còn hàng hoặc đơn đang xử lý. | Không xác nhận đơn mới với dữ liệu ngừng hoạt động; không ngừng kho chưa đủ điều kiện. Kho đã ngừng không được nhập/xuất/điều chỉnh. |
| KT23 | Tìm kiếm và phân trang | Tìm mã chính xác, tên tiếng Việt, điện thoại dạng 0 và +84; dữ liệu đủ để có nhiều trang; tìm từ khóa không tồn tại. | Mã khớp chính xác được ưu tiên; hai dạng điện thoại tìm cùng khách; mở đúng chi tiết; phân trang hoạt động; không có kết quả được báo rõ. |
| KT24 | Elasticsearch lỗi | Dừng Elasticsearch; tạo và xác nhận đơn hợp lệ; thực hiện tìm kiếm. | Nghiệp vụ vẫn lưu thành công trong cơ sở dữ liệu; tìm kiếm báo lỗi dịch vụ; lỗi đồng bộ được ghi nhận, không bị hiểu là không có kết quả. |
| KT25 | Khôi phục chỉ mục | Khôi phục Elasticsearch; chạy lại quy trình nạp index hai lần sau các thao tác thêm, sửa và xóa hợp lệ. | Index khớp dữ liệu nguồn, không trùng tài liệu và không giữ kết quả đã xóa; đơn cũ vẫn giữ thông tin lịch sử. |
| KT26 | Thông tin người nhận | Chọn khách X để lập nháp; sửa người nhận riêng; sửa hồ sơ X; rồi đổi khách của nháp sang Y và lưu. | Ban đầu lấy thông tin từ X; sửa người nhận không sửa hồ sơ X. Sửa hồ sơ X không đổi đơn. Đổi sang Y lấy thông tin Y và cho kiểm tra trước khi lưu. |
| KT27 | Hoàn tác thao tác kho | Kho A = 5; thực hiện nhập +3 hoặc điều chỉnh -1 và gây lỗi giữa bước cập nhật tồn với ghi lịch sử. | Cả hai bước cùng hoàn tác; tồn vẫn 5 và không có biến động của yêu cầu lỗi. |
| KT28 | Xuất kho đồng thời với bán | Kho A = 5; đồng thời xuất thủ công 4 và xác nhận đơn mua A = 4. Thử dùng lại request_key đã thành công với số lượng khác. | Chỉ một thao tác giảm tồn thành công; tồn cuối 1, lịch sử khớp thao tác thành công. Dùng lại khóa với nội dung khác bị báo xung đột, không đổi tồn. |
