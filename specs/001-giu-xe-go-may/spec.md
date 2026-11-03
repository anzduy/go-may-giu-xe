# Feature Specification: App Giữ Xe Gò Mây Arena

**Feature Branch**: `001-giu-xe-go-may`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "App giữ xe cho sân bóng đá Gò Mây. Mỗi ngày in sẵn khoảng 200 phiếu có
mã QR theo thứ tự; khách vào thì đưa phiếu, chụp hình xe."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gửi xe: số tự nhảy + chụp ảnh xe (Priority: P1)

Khách chạy xe vào. Màn hình gửi xe luôn hiện sẵn **số phiếu tiếp theo** bằng chữ thật to (ví dụ
**006**) và camera đã mở sẵn. Nhân viên rút phiếu trên cùng của xấp (đúng số 006), chụp một tấm ảnh
xe thấy rõ biển số, rồi đưa phiếu cho khách. Xong một lượt, app tự nhảy sang **007**. **Không cần
quét phiếu, không cần gõ gì** khi mọi thứ đúng thứ tự.

Nếu phiếu trên tay không khớp số trên màn hình (rơi phiếu, phiếu rách, phiếu dính nhau), nhân viên
chạm vào ô số và sửa thành số trên phiếu thật (ví dụ 009). Lượt này lưu với số 009, và lượt tiếp
theo app tự đề xuất **010**. Nhân viên cũng có thể quét QR của phiếu thay cho gõ tay, kết quả như
nhau.

**Why this priority**: Đây là thao tác diễn ra nhiều nhất, nhất là giờ cao điểm Chủ nhật có Kul
Tournament. Bỏ bước quét và gõ giúp mỗi lượt chỉ còn **1 chạm (chụp ảnh)**.

**Independent Test**: Bắt đầu từ số 001, chụp 5 xe liên tiếp, kiểm tra 5 lượt mang số 001–005. Sửa
số thành 009 rồi chụp xe thứ 6, kiểm tra lượt đó là 009 và màn hình đề xuất 010.

**Acceptance Scenarios**:

1. **Given** đầu ngày chưa có lượt nào, **When** nhân viên mở màn hình gửi xe,
   **Then** app đề xuất số **001** và camera sẵn sàng chụp.
2. **Given** màn hình đang đề xuất 005, **When** nhân viên chụp ảnh xe,
   **Then** app tạo lượt gửi số 005 kèm ảnh và giờ vào, xe hiện trong danh sách trong bãi, và màn
   hình đề xuất ngay **006**.
3. **Given** màn hình đang đề xuất 006 nhưng phiếu trên tay là 009, **When** nhân viên sửa ô số thành
   009 và chụp ảnh, **Then** lượt được lưu với số 009 và màn hình đề xuất **010**. Các số 006, 007,
   008 được ghi nhận là "bị bỏ qua" (vẫn dùng lại được nếu tìm thấy phiếu).
4. **Given** phiếu 003 đang gắn với một xe trong bãi, **When** nhân viên sửa ô số thành 003,
   **Then** app báo ngay "Phiếu 003 đang có xe trong bãi" và không cho chụp/lưu với số đó.
5. **Given** đề xuất đã tới số cuối của bộ phiếu (ví dụ 200), **When** chụp xong lượt 200,
   **Then** app báo "Đã hết phiếu hôm nay" và gợi ý quản lý tạo thêm phiếu.
6. **Given** nhân viên chụp xong nhưng nhận ra sai (chụp nhầm xe, sai số), **When** bấm "Hoàn tác"
   trong vòng 10 giây, **Then** lượt vừa tạo bị hủy (có lưu vết) và số đề xuất quay lại số cũ.
7. **Given** điện thoại mất mạng, **When** nhân viên gửi xe,
   **Then** lượt gửi và ảnh vẫn lưu trên máy, số vẫn tự nhảy, và mọi thứ tự đồng bộ khi có mạng lại.

---

### User Story 2 - Trả xe: quét mã hoặc nhập số + chụp xe lúc ra (Priority: P1)

Khách đưa phiếu khi lấy xe. Nhân viên **quét mã QR** trên phiếu, hoặc **gõ số in trên phiếu** (ví dụ
"37") nếu quét không được. App hiện **ảnh xe lúc vào** thật to, giờ vào, số tiền 5.000đ, và camera
đã mở sẵn bên cạnh. Nhân viên nhìn xe khớp ảnh, thu tiền, bấm **"Trả xe"**: đúng lúc bấm, app **tự
chụp ảnh xe lúc ra**. Vẫn chỉ **1 chạm** sau khi quét.

Ảnh lúc vào và lúc ra được lưu cạnh nhau. Nếu khách quay lại khiếu nại (ví dụ "mất mũ bảo hiểm"),
quản lý mở lượt đó xem hai ảnh so sánh: lúc vào xe có treo mũ không, lúc ra còn không, ai trực.

**Why this priority**: Gửi và trả là một cặp. Ảnh lúc vào chống giao nhầm xe (constitution, Nguyên
tắc III); ảnh lúc ra là bằng chứng khi có tranh chấp mất đồ (mũ bảo hiểm, áo mưa, đồ treo xe).

**Independent Test**: Gửi 5 xe, trả 5 xe (3 xe quét mã, 2 xe gõ số). Kiểm tra danh sách xe trong bãi
về 0, mỗi lượt có giờ vào, giờ ra, số tiền, **ảnh lúc vào và ảnh lúc ra**.

**Acceptance Scenarios**:

1. **Given** phiếu 037 đang gắn với một xe trong bãi, **When** nhân viên quét mã phiếu,
   **Then** app hiện ảnh xe lúc vào (to, rõ), biển số đọc được (nếu có), loại xe, giờ vào, số tiền.
2. **Given** phiếu 037 nhòe không quét được, **When** nhân viên gõ "37" trên bàn phím số,
   **Then** app tìm ra đúng lượt 037 đang trong bãi và hiện như khi quét.
3. **Given** màn hình trả xe đang hiện, **When** nhân viên bấm "Trả xe",
   **Then** app tự chụp ảnh xe lúc ra, đóng lượt gửi, ghi giờ ra, số tiền, nhân viên trả, và xe biến
   khỏi danh sách. Nhân viên không phải chờ ảnh tải lên.
4. **Given** một lượt đã trả, **When** quản lý mở chi tiết lượt đó,
   **Then** thấy **ảnh lúc vào và ảnh lúc ra đặt cạnh nhau**, phóng to được, kèm giờ và tên nhân viên.
5. **Given** phiếu đã được trả lúc 19:42, **When** quét lại phiếu đó,
   **Then** app báo "Phiếu đã trả xe lúc 19:42" và không cho trả lần hai.
6. **Given** phiếu chưa từng dùng để gửi xe, **When** quét hoặc gõ số ở chế độ trả xe,
   **Then** app báo "Phiếu này chưa gửi xe nào".
7. **Given** nhân viên thấy xe khác ảnh, **When** bấm "Không khớp",
   **Then** app không trả xe và chuyển sang quy trình kiểm tra như mất phiếu (User Story 4).

---

### User Story 3 - Tạo và in phiếu QR mỗi ngày (Priority: P1)

Mỗi ngày (hoặc tối hôm trước), chủ sân mở app, chọn "In phiếu ngày", nhập số lượng (mặc định 200).
App tạo bộ phiếu đánh số thứ tự 001–200 cho ngày đó và xuất ra file in trên giấy A4. Duy in bằng
máy in có sẵn, cắt ra, xếp thành xấp theo thứ tự. Nếu đông khách và gần hết phiếu, có thể tạo
thêm (201–250...).

**Why this priority**: Không có phiếu thì không gửi xe được. Đây là điều kiện để chạy User Story 1.

**Independent Test**: Tạo bộ 200 phiếu cho ngày mai, mở file in, đếm đủ 200 phiếu, quét thử vài
phiếu thấy app nhận đúng ngày và số thứ tự.

**Acceptance Scenarios**:

1. **Given** quản lý chọn ngày 08/11/2026 và số lượng 200, **When** bấm "Tạo phiếu",
   **Then** app tạo phiếu 001–200 cho ngày đó và xuất file in A4, mỗi phiếu có QR, số thứ tự lớn
   dễ đọc, ngày và chữ "Gò Mây Arena".
2. **Given** đã có phiếu 001–200 cho hôm nay, **When** quản lý tạo thêm 50 phiếu,
   **Then** app tạo tiếp 201–250, không trùng số cũ.
3. **Given** một phiếu của ngày hôm trước chưa dùng, **When** quét phiếu đó ở chế độ gửi xe,
   **Then** app báo "Phiếu của ngày khác" và không cho dùng.
4. **Given** tài khoản nhân viên (không phải quản lý), **When** mở chức năng tạo phiếu,
   **Then** app không cho phép.

---

### User Story 4 - Mất phiếu và tìm xe bằng ảnh (Priority: P2)

Khách báo mất phiếu. Nhân viên mở "Xe trong bãi" dạng lưới ảnh, tìm xe khách chỉ, kiểm tra giấy tờ
xe, chọn "Trả xe – mất phiếu", nhập ghi chú bắt buộc (ví dụ "đã xem cà vẹt, tên Nguyễn Văn A") và
thu **10.000đ**.

**Why this priority**: Không xảy ra hằng ngày nhưng dễ thất thoát và tranh cãi nhất.

**Independent Test**: Gửi 3 xe, chọn một xe trong lưới ảnh, trả theo quy trình mất phiếu. Kiểm tra
lượt đó có trạng thái "mất phiếu", ghi chú, số tiền 10.000đ và tên nhân viên.

**Acceptance Scenarios**:

1. **Given** có 30 xe trong bãi, **When** nhân viên mở "Xe trong bãi",
   **Then** thấy ảnh của cả 30 xe kèm số phiếu và giờ vào, sắp theo giờ vào mới nhất.
2. **Given** đã chọn đúng xe, **When** bấm "Mất phiếu" mà không nhập ghi chú,
   **Then** app bắt buộc nhập ghi chú trước khi trả xe.
3. **Given** trả xe mất phiếu thành công, **When** sau đó có người quét phiếu bị mất đó,
   **Then** app báo "Phiếu đã báo mất, xe đã trả lúc HH:MM".

---

### User Story 5 - Chốt ca và xem doanh thu (Priority: P2)

Cuối ca, nhân viên bấm "Chốt ca". App tổng hợp số lượt gửi, số tiền phải có, số lượt mất phiếu và
số xe còn trong bãi. Chủ sân (Duy) xem báo cáo theo ngày, tuần hoặc tháng từ xa để đối chiếu tiền
mặt nhân viên nộp.

**Why this priority**: Giúp chủ sân kiểm soát tiền khi không có mặt. Chỉ có ý nghĩa khi đã gửi và
trả được xe.

**Independent Test**: Tạo 10 lượt đã trả (trong đó 1 lượt mất phiếu), chốt ca. Tổng tiền phải là
9 × 5.000đ + 10.000đ = 55.000đ.

**Acceptance Scenarios**:

1. **Given** ca có 20 lượt đã trả, 1 lượt mất phiếu, 3 xe còn trong bãi, **When** nhân viên bấm
   "Chốt ca", **Then** báo cáo hiện đúng các con số đó, tổng tiền, và ảnh 3 xe còn tồn.
2. **Given** chủ sân đăng nhập tài khoản quản lý, **When** chọn xem tuần này,
   **Then** thấy doanh thu từng ngày, từng ca, tên nhân viên, và số phiếu đã in so với đã dùng.
3. **Given** tài khoản nhân viên, **When** cố mở báo cáo tổng hoặc cài đặt giá,
   **Then** app không cho phép.

---

### User Story 6 - Ảnh lưu ngay trên máy, tự đọc biển số và sao lưu lên cloud chạy ngầm (Priority: P2)

Mọi ảnh (lúc vào, lúc ra) được **lưu ngay trên điện thoại** nên nhân viên không bao giờ phải chờ.
Sau đó app **tự làm ngầm**: (1) đọc biển số từ ảnh xe lúc vào và gắn vào lượt gửi, (2) đẩy ảnh và
dữ liệu lên cloud khi có mạng. Ảnh trên cloud là bản sao lưu: nếu ảnh trên điện thoại bị xóa, máy
hỏng hay mất, xem lại vẫn được.

**Why this priority**: Tăng tốc và an toàn dữ liệu, nhưng gửi/trả xe (P1) vẫn chạy được trước khi
có tính năng này. Biển số tự đọc giúp tìm xe nhanh khi mất phiếu mà không bắt nhân viên gõ.

**Independent Test**: Tắt mạng, gửi 10 xe. Kiểm tra cả 10 lượt có ảnh xem được ngay. Bật mạng, chờ
và kiểm tra cả 10 ảnh đã lên cloud và biển số đã được gắn vào lượt. Xóa ảnh trên máy (hoặc đăng
nhập máy khác), mở lại lượt gửi vẫn xem được ảnh từ cloud.

**Acceptance Scenarios**:

1. **Given** nhân viên vừa chụp xe, **When** ảnh chụp xong,
   **Then** lượt gửi được lưu ngay trên máy và màn hình sẵn sàng cho xe tiếp theo, không chờ đọc biển
   số hay tải lên.
2. **Given** ảnh xe thấy rõ biển "59X1-123.45", **When** việc đọc biển số chạy xong,
   **Then** lượt gửi hiện biển số 59X1-123.45 và tìm được bằng "12345" hoặc "345".
3. **Given** ảnh không đọc được biển số (che, mờ, xe đạp), **When** đọc xong,
   **Then** lượt gửi ghi "chưa đọc được biển số" mà không báo lỗi làm phiền nhân viên; nhân viên vẫn
   gõ tay biển số được nếu muốn.
4. **Given** biển số vừa đọc được trùng với một xe đang trong bãi, **When** đọc xong,
   **Then** app hiện cảnh báo nhỏ "Biển số này đã có trong bãi (phiếu 012)" nhưng không chặn thao tác.
5. **Given** có 15 ảnh chưa lên cloud, **When** nhân viên nhìn màn hình chính,
   **Then** thấy biểu tượng nhỏ "Chờ sao lưu: 15"; khi có mạng, số này tự giảm về 0.
6. **Given** ảnh đã lên cloud, **When** ảnh trên điện thoại bị xóa hoặc mở trên máy khác,
   **Then** app tự lấy ảnh từ cloud để hiển thị.

---

### User Story 7 - AI phân tích ảnh: màu xe, số mũ bảo hiểm và cảnh báo không khớp (Priority: P2)

Cùng lúc với đọc biển số, app **tự phân tích ngầm** mỗi ảnh xe để ghi lại: **màu xe**, **số mũ bảo
hiểm** (treo/để trên xe và đội trên đầu người trong ảnh), và đồ dễ thấy khác (áo mưa, túi treo xe).

- **Lúc trả xe**: màn hình trả xe hiện sẵn tóm tắt từ ảnh lúc vào, ví dụ **"Xe máy màu đỏ · 2 mũ"**,
  để nhân viên liếc so nhanh (không thêm thao tác).
- **Sau khi trả xe**: app phân tích ảnh lúc ra và **so với ảnh lúc vào**. Nếu **khác màu xe**, **khác
  biển số**, hoặc **ít mũ hơn**, app hiện **cảnh báo** trên máy nhân viên (rung + âm báo + thẻ đỏ, ví dụ
  "⚠️ Phiếu 037: lúc vào 2 mũ, lúc ra 1 mũ") và ghi vào danh sách **Cảnh báo** để quản lý xem lại.

**Why this priority**: Giúp phát hiện sớm giao nhầm xe và mất mũ bảo hiểm, ngay khi khách có thể còn
ở cổng. Nhưng đây là lớp hỗ trợ: gửi/trả xe (P1) và ảnh vào/ra làm bằng chứng vẫn chạy được trước khi
có tính năng này.

**Independent Test**: Gửi một xe đỏ treo 2 mũ; trả xe với ảnh ra chỉ còn 1 mũ → trong vòng 15 giây
(khi có mạng) máy nhân viên hiện cảnh báo "lúc vào 2 mũ, lúc ra 1 mũ". Gửi xe đỏ, trả xe với ảnh ra là
xe xanh → cảnh báo "khác màu xe". Gửi và trả cùng một xe không đổi gì → không có cảnh báo.

**Acceptance Scenarios**:

1. **Given** ảnh lúc vào đã phân tích xong ("màu đỏ, 2 mũ"), **When** nhân viên quét phiếu để trả xe,
   **Then** màn hình trả xe hiện dòng "Xe máy màu đỏ · 2 mũ" cạnh ảnh lúc vào.
2. **Given** lúc vào 2 mũ, **When** ảnh lúc ra phân tích được 1 mũ (tính cả mũ trên xe và trên đầu),
   **Then** máy nhân viên rung, kêu, hiện cảnh báo đỏ "Phiếu 037: lúc vào 2 mũ, lúc ra 1 mũ" kèm 2 ảnh
   cạnh nhau, và cảnh báo được lưu cho quản lý.
3. **Given** lúc vào xe màu đỏ, **When** ảnh lúc ra là xe màu xanh,
   **Then** cảnh báo mức **cao** "Phiếu 037: có thể giao nhầm xe (đỏ → xanh)".
4. **Given** lúc vào 1 mũ treo trên xe, **When** lúc ra khách đang đội mũ đó và xe không còn mũ treo,
   **Then** app tính vẫn đủ 1 mũ và **không** cảnh báo.
5. **Given** AI không chắc chắn (ảnh tối, mờ, bị che), **When** so sánh,
   **Then** app **không** báo động, chỉ ghi "không đủ rõ để so sánh" trong chi tiết lượt.
6. **Given** nhân viên thấy cảnh báo, **When** bấm "Đã kiểm tra" và chọn kết quả ("khách đội mũ / đúng
   xe", "báo sai", "có vấn đề thật" + ghi chú), **Then** cảnh báo được đóng, lưu vết người xử lý.
7. **Given** máy đang mất mạng, **When** trả xe,
   **Then** việc trả xe không bị ảnh hưởng; phân tích và cảnh báo (nếu có) chạy khi có mạng lại, và
   cảnh báo vẫn được lưu cho quản lý dù khách đã đi.

---

### Edge Cases

- Hết phiếu in sẵn giữa giờ cao điểm: nhân viên chọn "Gửi xe không phiếu". App vẫn dùng số tiếp
  theo, hiện chữ thật to để nhân viên ghi tay lên giấy cho khách, và vẫn bắt buộc chụp ảnh xe. Khi
  trả xe, nhân viên nhập tay số đó.
- Phiếu nhòe, rách, ướt mưa, không quét được: nhân viên nhập tay số thứ tự trên phiếu (app hiểu là
  phiếu của hôm nay).
- Nhân viên lỡ đưa phiếu khác số trên màn hình mà không sửa (phiếu dính nhau, rút nhầm): khi trả
  xe, quét phiếu khách đưa sẽ ra ảnh xe khác hoặc "chưa gửi xe nào". Nhân viên bấm "Không khớp" và
  tìm xe theo lưới ảnh (User Story 4), rồi app cho **gán lại số phiếu đúng** cho lượt đó (có lưu
  vết). Để giảm lỗi này, số đề xuất hiện thật to để nhân viên liếc so với phiếu trên tay.
- 2–3 máy cùng gửi xe một lúc (nhiều cổng vào): mỗi máy tự nhảy số theo xấp phiếu của mình; nếu số
  đề xuất đã bị máy khác dùng, app tự nhảy tới số trống kế tiếp. Khuyến nghị mỗi cổng vào cầm một
  khoảng số riêng (ví dụ máy A 001–100, máy B 101–200) bằng cách sửa số ở lượt đầu tiên.
- Xe gửi qua đêm: phiếu hôm qua vẫn dùng để **trả xe** bình thường hôm sau. Báo cáo chốt ca đánh
  dấu "tồn qua đêm". Phiếu cũ chỉ bị chặn khi dùng để **gửi xe** mới.
- Máy cổng ra chưa nhận được dữ liệu từ máy cổng vào (do máy cổng vào mất mạng): app báo "Chưa có
  dữ liệu phiếu này, chờ đồng bộ". Nhân viên được phép "Trả xe tạm" kèm chụp ảnh xe lúc ra. Lượt
  được ghép lại khi đồng bộ, và quản lý thấy các lượt trả tạm này trong báo cáo.
- Hai máy cùng trả một phiếu khi cả hai offline: khi đồng bộ, app giữ lượt trả đầu tiên và đánh
  dấu xung đột cho quản lý xem.
- Điện thoại sắp đầy bộ nhớ: app cảnh báo sớm, và chỉ tự dọn những ảnh **đã sao lưu lên cloud
  xong** (cũ hơn 7 ngày). Ảnh chưa sao lưu không bao giờ bị app tự xóa.
- Nhân viên tắt app hoặc khóa màn hình khi còn ảnh chưa sao lưu: lần mở app tiếp theo việc sao lưu
  tự chạy tiếp, không mất ảnh nào.
- Mất mạng cả buổi tối: biển số có thể chưa đọc được đến khi có mạng lại; gửi/trả xe vẫn bình thường.
- Mũ bảo hiểm: khách thường **đội mũ khi dắt xe ra** nên app đếm cả mũ trên xe lẫn mũ trên đầu người
  trong ảnh lúc ra. Khách mang thêm mũ (lúc ra nhiều mũ hơn) thì không cảnh báo.
- Áo mưa trùm xe, ảnh chụp góc khác lúc vào, đèn vàng buổi tối làm màu xe trông khác: AI chỉ cảnh báo
  khi đủ chắc chắn; còn lại ghi "không đủ rõ để so sánh".
- Cảnh báo đến khi khách đã đi (mạng chậm, offline): cảnh báo vẫn lưu cho quản lý kèm ảnh để xử lý
  nếu khách quay lại khiếu nại.
- Dịch vụ AI tạm lỗi hoặc hết lượt miễn phí trong ngày: gửi/trả xe vẫn bình thường; ảnh chờ phân tích
  được xếp hàng và phân tích lại sau.
- Khiếu nại mất mũ bảo hiểm: quản lý tìm lượt theo số phiếu, biển số hoặc giờ, xem cặp ảnh vào/ra.
  App chỉ cung cấp bằng chứng, việc xử lý bồi thường do chủ sân quyết định.
- Ảnh chụp mờ hoặc tối (buổi tối): app cho chụp lại ngay trên màn hình xem trước. Đèn flash bật
  được bằng một chạm.
- Điện thoại hết pin giữa ca: nhân viên đăng nhập trên máy khác và thấy đủ xe trong bãi (với dữ
  liệu đã đồng bộ).
- Sửa giá giữa ngày: lượt đang trong bãi tính theo giá tại thời điểm gửi.

## Requirements *(mandatory)*

### Functional Requirements

**Phiếu QR in sẵn**

- **FR-001**: System MUST cho quản lý tạo bộ phiếu cho một ngày bất kỳ với số lượng tùy chọn (mặc
  định 200), đánh số thứ tự liên tục, và tạo thêm phiếu nối tiếp số cũ khi cần.
- **FR-002**: Mỗi phiếu MUST vừa có **số thứ tự in to** (001–200) vừa có **mã QR** chứa cùng số đó
  kèm ngày của phiếu, để khi trả xe quét mã hay gõ số đều ra cùng một lượt gửi. Mã QR MUST có phần
  kiểm tra để app nhận ra mã không phải do Gò Mây Arena tạo.
- **FR-003**: System MUST xuất bộ phiếu thành file in trên giấy A4 bằng máy in thông thường. Mỗi phiếu
  có: mã QR, số thứ tự chữ lớn, ngày, "Gò Mây Arena", đường cắt rõ ràng. Thứ tự trên giấy MUST giúp
  cắt xong xếp xấp đúng thứ tự 001 → 200 dễ dàng.
- **FR-004**: Phiếu MUST chỉ dùng được để gửi xe trong đúng ngày của phiếu, nhưng dùng được để trả
  xe vào bất kỳ ngày nào sau đó.

**Gửi xe**

- **FR-005**: Màn hình gửi xe MUST luôn hiện **số phiếu đề xuất tiếp theo** bằng chữ lớn, cùng camera
  đã sẵn sàng. Chụp ảnh xe là thao tác duy nhất cần làm để tạo lượt gửi với số đề xuất. Giờ vào tự ghi.
- **FR-006**: Số đề xuất MUST bằng **số của lượt gửi vừa tạo + 1** (theo máy đang dùng). Đầu ngày
  bắt đầu từ 001.
- **FR-007**: Nhân viên MUST sửa được số phiếu bằng cách chạm vào ô số (bàn phím số) hoặc quét QR
  trên phiếu. Sau khi lưu với số đã sửa N, số đề xuất tiếp theo MUST là N + 1.
- **FR-008**: System MUST chặn ngay khi số đang chọn trùng với phiếu đang có xe trong bãi, phiếu đã
  trả, phiếu báo mất, hoặc vượt quá số phiếu đã tạo trong ngày, kèm thông báo rõ lý do. Khi số đề
  xuất bị trùng (ví dụ máy khác đã dùng), app MUST tự nhảy tới số trống kế tiếp.
- **FR-008a**: Lượt gửi MUST có ít nhất một ảnh xe. Loại xe (xe máy, xe điện, xe đạp) mặc định
  "Xe máy", đổi bằng một chạm. Biển số **không bắt buộc**.
- **FR-008b**: System MUST cho "Hoàn tác" lượt vừa tạo trong vòng 10 giây; lượt bị hủy vẫn được lưu
  vết và số đề xuất quay về số đó.
- **FR-008c**: Các số bị nhảy qua (do sửa số) MUST được đánh dấu "bị bỏ qua" trong báo cáo, nhưng
  vẫn dùng lại được khi nhân viên nhập tay đúng số đó.

**Trả xe**

- **FR-009**: Khi trả xe, nhân viên MUST tìm được lượt gửi bằng **quét mã QR** hoặc **gõ số phiếu**
  (bàn phím số, không cần gõ số 0 ở đầu). Gõ số mặc định tìm các xe **đang trong bãi**; nếu có nhiều
  lượt cùng số (ví dụ phiếu 037 hôm qua chưa trả và phiếu 037 hôm nay), app hiện tất cả kèm ảnh và
  ngày để chọn.
- **FR-009a**: Màn hình trả xe MUST hiện ảnh xe lúc gửi (chiếm phần lớn màn hình), biển số (nếu đã
  đọc được), loại xe, giờ vào, số tiền phải thu, và camera mở sẵn.
- **FR-009b**: Khi nhân viên bấm "Trả xe", System MUST **tự chụp ảnh xe lúc ra** cùng lúc, không cần
  thêm thao tác. Lượt trả xe MUST có ảnh lúc ra.
- **FR-009c**: Quản lý MUST xem được ảnh lúc vào và lúc ra **đặt cạnh nhau** cho bất kỳ lượt nào,
  phóng to được, kèm giờ và nhân viên trực.
- **FR-010**: Nhân viên MUST xác nhận "Trả xe" hoặc "Không khớp". Chọn "Không khớp" thì không trả
  xe và chuyển sang quy trình mất phiếu.
- **FR-011**: System MUST tính tiền **đồng giá mỗi lượt, không tính giờ**. Giá mặc định: xe máy
  5.000đ, xe điện 5.000đ, xe đạp 5.000đ. Quản lý chỉnh được giá.
- **FR-012**: System MUST hỗ trợ trả xe "mất phiếu": chọn xe từ lưới ảnh xe trong bãi, ghi chú
  bắt buộc, thu **10.000đ** (mặc định, quản lý chỉnh được) thay cho giá thường. Phiếu mất bị vô
  hiệu hóa.
- **FR-012a**: Khi phát hiện khách cầm phiếu khác số đã ghi (đưa nhầm phiếu lúc gửi), nhân viên MUST
  gán lại được số phiếu đúng cho lượt đó sau khi tìm thấy xe bằng ảnh; thao tác được lưu vết.

**Ảnh, biển số và sao lưu (chạy ngầm)**

- **FR-020**: Mọi ảnh MUST được lưu ngay trên điện thoại trước; thao tác gửi/trả xe MUST hoàn tất mà
  không chờ tải ảnh lên hay đọc biển số.
- **FR-021**: System MUST tự đọc biển số từ ảnh xe lúc vào ở chế độ chạy ngầm và gắn kết quả vào lượt
  gửi. Không đọc được thì để trống, không báo lỗi; nhân viên và quản lý sửa tay được biển số.
- **FR-022**: Biển số đọc được MUST dùng được để tìm xe (theo một phần biển số) và để cảnh báo nhẹ khi
  trùng với xe đang trong bãi (không chặn thao tác).
- **FR-023**: System MUST tự sao lưu ảnh và dữ liệu lên cloud ở chế độ chạy ngầm khi có mạng, tự thử
  lại khi lỗi, và tiếp tục sau khi app bị tắt/mở lại. Màn hình chính MUST hiện số ảnh chờ sao lưu.
- **FR-024**: Khi ảnh không còn trên điện thoại (bị xóa, máy khác, máy mới), System MUST tự hiển thị
  bản trên cloud.
- **FR-025**: System MUST KHÔNG tự xóa ảnh trên điện thoại khi ảnh đó chưa sao lưu xong. Ảnh đã sao
  lưu và cũ hơn 7 ngày MAY được app dọn để giải phóng bộ nhớ máy.

**Phân tích ảnh và cảnh báo (chạy ngầm)**

- **FR-026**: System MUST tự phân tích ngầm **mỗi ảnh xe (vào và ra)** để ghi: biển số, màu xe chính,
  loại xe nhìn thấy, **số mũ bảo hiểm trên xe**, **số mũ bảo hiểm đội trên đầu**, đồ dễ thấy khác (áo
  mưa, túi), và **mức độ chắc chắn** của từng kết quả. Biển số từ FR-021 là một phần của phân tích này.
- **FR-027**: Màn hình trả xe MUST hiện tóm tắt phân tích ảnh lúc vào (ví dụ "Xe máy màu đỏ · 2 mũ")
  khi đã có, mà không thêm thao tác và không chờ kết quả nếu chưa có.
- **FR-028**: Sau khi trả xe, System MUST so sánh phân tích ảnh ra với ảnh vào và tạo **cảnh báo** khi:
  (a) khác màu xe hoặc khác biển số đọc được → mức **cao** (có thể giao nhầm xe);
  (b) tổng số mũ lúc ra (trên xe + trên đầu) **ít hơn** lúc vào → mức **trung bình** (có thể mất mũ).
  Chỉ cảnh báo khi cả hai kết quả đủ chắc chắn; nhiều mũ hơn lúc vào thì không cảnh báo.
- **FR-029**: Cảnh báo MUST hiện trên máy của nhân viên vừa trả xe (rung, âm báo, thẻ đỏ kèm 2 ảnh
  cạnh nhau) trong vòng **15 giây** sau khi trả xe khi có mạng, và hiện trong danh sách **Cảnh báo** của
  quản lý. Cảnh báo MUST KHÔNG chặn hay làm chậm lượt trả xe tiếp theo.
- **FR-030**: Nhân viên hoặc quản lý MUST đóng được cảnh báo bằng một kết quả ("đúng xe / khách đội mũ",
  "báo sai", "có vấn đề thật") kèm ghi chú tùy chọn; thao tác được lưu vết. Báo cáo chốt ca MUST hiện số
  cảnh báo và số cảnh báo chưa xử lý.
- **FR-031**: Quản lý MUST sửa tay được kết quả phân tích (màu, số mũ, biển số) khi AI đọc sai.

**Vận hành chung**

- **FR-013**: System MUST hoạt động đầy đủ luồng gửi, trả, tra cứu và chụp ảnh khi không có mạng,
  và tự đồng bộ (kể cả ảnh) khi có mạng lại (xem FR-020 → FR-025).
- **FR-014**: System MUST cho 2–3 điện thoại dùng cùng lúc (ví dụ một máy ở cổng vào, một máy ở
  cổng ra). Khi có mạng, xe gửi ở máy này MUST hiện ở máy kia trong vòng 5 giây, kèm ảnh.
- **FR-015**: System MUST hiển thị trên màn hình chính: số xe đang trong bãi và số phiếu còn lại
  chưa dùng của hôm nay. Cảnh báo khi còn dưới 20 phiếu.
- **FR-016**: System MUST lưu vết mọi thao tác (gửi, trả, mất phiếu, trả tạm, hủy) kèm nhân viên và
  thời gian. Không cho xóa lượt, chỉ quản lý được hủy lượt kèm lý do.
- **FR-017**: System MUST tạo báo cáo chốt ca gồm: số lượt, tổng tiền theo loại xe, lượt mất phiếu,
  lượt trả tạm, xe còn tồn (có ảnh), số phiếu đã dùng.
- **FR-018**: System MUST phân 2 vai trò: **nhân viên** (gửi, trả, tra cứu, chốt ca) và **quản lý**
  (thêm: tạo/in phiếu, báo cáo tổng, cài đặt giá, quản lý nhân viên, hủy lượt).
- **FR-019**: System MUST lưu lịch sử lượt gửi tối thiểu 90 ngày và ảnh xe (vào và ra) trên cloud
  tối thiểu 30 ngày.

### Key Entities *(include if feature involves data)*

- **Bộ phiếu ngày (Ticket Batch)**: các phiếu tạo cho một ngày; gồm ngày, khoảng số (001–200,
  201–250...), người tạo, thời điểm tạo.
- **Phiếu (Ticket)**: một tờ phiếu in sẵn; gồm mã, ngày, số thứ tự, trạng thái (chưa dùng / bị bỏ
  qua / đang gửi xe / đã trả / báo mất).
- **Lượt gửi (Parking Session)**: một lần xe vào bãi; gồm phiếu, ảnh xe lúc vào, ảnh xe lúc ra,
  loại xe, biển số (tự đọc hoặc nhập tay, có thể trống), giờ vào, giờ ra, số tiền, trạng thái (trong bãi / đã trả / mất
  phiếu / trả tạm / đã hủy), nhân viên nhận, nhân viên trả, ghi chú.
- **Ảnh xe (Vehicle Photo)**: ảnh chụp gắn với một lượt gửi; loại ảnh (lúc vào / lúc ra), thời điểm
  chụp, máy chụp, trạng thái sao lưu (chỉ trên máy / đã lên cloud), còn trên máy hay không.
- **Phân tích ảnh (Photo Analysis)**: kết quả AI cho một ảnh: biển số, màu xe, loại xe, số mũ trên xe,
  số mũ trên đầu, đồ khác, mức độ chắc chắn, trạng thái (chờ phân tích / xong / không rõ / sửa tay).
- **Cảnh báo (Alert)**: gắn với một lượt gửi; loại (khác màu / khác biển số / thiếu mũ), mức (cao /
  trung bình), nội dung, thời điểm, trạng thái (mới / đã xử lý), kết quả xử lý, người xử lý.
- **Bảng giá (Price Rule)**: giá mỗi lượt theo loại xe, phí mất phiếu, ngày áp dụng.
- **Nhân viên (Staff)**: tên, vai trò (nhân viên / quản lý), trạng thái hoạt động.
- **Ca làm việc (Shift)**: khoảng thời gian một nhân viên trực; gom các lượt và kết quả chốt ca.
- **Nhật ký thay đổi (Audit Entry)**: ai làm gì, lúc nào, với lượt nào, lý do.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Gửi một xe đúng thứ tự chỉ cần **1 chạm** (chụp ảnh) và dưới 5 giây; gửi xe phải sửa
  số dưới 10 giây; trả một xe (quét + xem ảnh + xác nhận) dưới 8 giây. Đo trên 20 lượt liên tiếp.
- **SC-001a**: Ít nhất 95% lượt gửi trong ngày không cần sửa số.
- **SC-002**: Giờ cao điểm, 1 nhân viên xử lý được ít nhất 90 xe vào trong 15 phút.
- **SC-003**: Tạo và xuất file in 200 phiếu mất dưới 1 phút; quét được 100% phiếu in từ máy in văn
  phòng thông thường trong điều kiện đèn bãi xe buổi tối.
- **SC-004**: 0 lượt và 0 ảnh bị mất khi dùng offline cả một buổi tối rồi đồng bộ lại.
- **SC-005**: Tổng tiền trên báo cáo chốt ca khớp 100% với tính tay từ danh sách lượt.
- **SC-006**: Nhân viên mới tự gửi và trả xe đúng sau tối đa 5 phút hướng dẫn.
- **SC-007**: Trong tháng đầu sử dụng, 0 trường hợp giao nhầm xe.
- **SC-008**: Trả xe (quét mã hoặc gõ số, xem ảnh, bấm "Trả xe" kèm tự chụp ảnh ra) dưới 8 giây.
- **SC-009**: Ít nhất 80% ảnh xe máy có biển số rõ (ban ngày và dưới đèn bãi) được đọc đúng biển số;
  kết quả có trong vòng 1 phút khi có mạng.
- **SC-010**: Khi có mạng ổn định, 95% ảnh lên cloud trong vòng 5 phút sau khi chụp; 100% ảnh lên
  cloud trong ngày.
- **SC-011**: Khi có khiếu nại mất đồ, quản lý mở được cặp ảnh vào/ra của lượt đó trong dưới 30 giây.
- **SC-012**: Khi có mạng, cảnh báo không khớp hiện trên máy nhân viên trong vòng 15 giây sau khi bấm
  "Trả xe" ở ít nhất 90% trường hợp.
- **SC-013**: Trong buổi chạy thử có dàn dựng, app phát hiện ít nhất 90% trường hợp xe khác màu rõ rệt
  và ít nhất 80% trường hợp bớt mũ treo trên xe.
- **SC-014**: Cảnh báo sai (bị đánh dấu "báo sai") chiếm không quá 5% số lượt trả xe trong tuần đầu; nếu
  vượt, quản lý chỉnh được độ nhạy cảnh báo.

## Assumptions

- Bãi chỉ nhận 3 loại xe: xe máy, xe điện, xe đạp. Ô tô không thuộc v1.
- Phí mất phiếu 10.000đ là tổng số tiền thu cho lượt đó (không cộng thêm 5.000đ giá thường).
- Chủ sân có sẵn máy in văn phòng (in giấy A4); không cần máy in tại cổng.
- Phiếu đã trả được thu lại và bỏ đi, không tái sử dụng; hôm sau in bộ mới.
- Nhân viên dùng điện thoại cá nhân (Android hoặc iPhone) có camera, chụp ảnh và quét QR được.
- Thu tiền mặt là chủ yếu; chuyển khoản/QR ngân hàng không thuộc v1.
- Đọc biển số tự động là hỗ trợ, không phải bắt buộc: lúc sai thì vẫn đối chiếu bằng ảnh và số phiếu.
- Nhân viên được hướng dẫn chụp góc thấy cả biển số và mũ/đồ treo trên xe, ở cả lúc vào và lúc ra.
- Cảnh báo AI là **gợi ý để kiểm tra**, không phải kết luận; quyết định cuối cùng là của nhân viên và
  chủ sân.
- Ảnh trên điện thoại là ảnh lưu trong app (không nhất thiết hiện trong thư viện ảnh của máy).
- Một bãi xe duy nhất (Gò Mây Arena); không quản lý nhiều bãi.
- Không liên kết với hệ thống đặt sân ở v1.
