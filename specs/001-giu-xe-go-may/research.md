# Research: App Giữ Xe Gò Mây Arena

**Date**: 2026-11-03 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Ràng buộc từ chủ sân: chạy trên **cả Android và iPhone**, dạng **mở link là dùng**, dùng **Google Apps
Script** cũng được, chi phí gần 0đ.

---

## R1. Kiến trúc tổng thể: Apps Script thuần hay tách giao diện?

**Decision**: Tách làm 2 phần:

- **Giao diện (frontend)**: một trang web tĩnh dạng PWA (HTML + JavaScript thuần, không cần build),
  host miễn phí trên **GitHub Pages**. Đây chính là "cái link" nhân viên mở, có thể "Thêm vào màn hình
  chính" để dùng như app.
- **Máy chủ (backend)**: **Google Apps Script** triển khai dạng Web App làm API; dữ liệu lưu ở
  **Google Sheets**, ảnh lưu ở **Google Drive** của chủ sân.

**Rationale**: Trang do Apps Script phục vụ trực tiếp (HtmlService) chạy trong iframe bị hạn chế của
Google nên:

- không đăng ký được Service Worker → **không mở được app khi mất mạng** (vi phạm Nguyên tắc II);
- không mở được camera trực tiếp trong trang (chỉ mở được app camera của máy qua ô chọn file, thêm
  2–3 chạm mỗi lượt và **không tự chụp ảnh lúc ra được**) → vi phạm Nguyên tắc I và FR-009b.

Tách giao diện ra GitHub Pages giữ được toàn bộ lợi ích của Google (Sheets dễ xem, Drive lưu ảnh,
miễn phí, Duy tự quản lý) mà vẫn có camera trực tiếp, chạy offline và chạy ngầm.

**Alternatives considered**:

- *Apps Script HtmlService thuần*: đơn giản nhất nhưng không offline, camera chậm → loại.
- *App cài đặt (Flutter/React Native)*: chạy ngầm tốt nhất nhưng phải làm 2 bản, iPhone khó cài ngoài
  App Store → loại cho v1.
- *Firebase/Supabase làm backend*: realtime tốt hơn nhưng Duy phải học thêm công cụ; Sheets quen thuộc
  và đủ cho quy mô ~400 lượt/ngày → loại cho v1, giữ làm phương án nâng cấp.

---

## R2. Lưu trên máy trước, chạy offline

**Decision**: Service Worker lưu toàn bộ giao diện để mở được khi mất mạng; **IndexedDB** lưu lượt
gửi, ảnh (dạng Blob) và **hàng đợi thao tác (outbox)** chờ gửi lên máy chủ. Mỗi lượt gửi có mã định
danh do máy tự tạo (UUID) để gửi lại nhiều lần không bị trùng.

**Rationale**: Đáp ứng FR-013, FR-020, Nguyên tắc II. IndexedDB lưu được hàng trăm MB ảnh trên cả
Chrome Android và Safari iOS; app gọi `navigator.storage.persist()` để trình duyệt không tự xóa.

**Alternatives considered**: localStorage (giới hạn ~5MB, không lưu ảnh được) → loại.

**Rủi ro ghi nhận**: Safari iOS có thể xóa dữ liệu web của trang **không được thêm vào màn hình chính**
sau 7 ngày không mở. → Bắt buộc hướng dẫn nhân viên iPhone "Thêm vào màn hình chính" (đưa vào
quickstart), và vì ảnh luôn được sao lưu lên Drive nên không mất dữ liệu.

---

## R3. Sao lưu ngầm lên cloud

**Decision**: Khi app đang mở, một vòng xử lý nền gửi hàng đợi outbox lên Apps Script mỗi vài giây khi
có mạng; ảnh được nén trên máy (cạnh dài 1280px, JPEG chất lượng ~0.7, khoảng 100–150KB) rồi gửi dạng
base64. Lỗi thì thử lại với thời gian chờ tăng dần. Mở lại app thì hàng đợi tự chạy tiếp.

**Rationale**: Đáp ứng FR-023. Trình duyệt (nhất là iOS) **không cho chạy ngầm khi đã tắt hẳn app**;
nhưng nhân viên luôn mở app suốt ca nên đây không phải vấn đề thực tế. Ảnh chưa sao lưu luôn nằm an
toàn trong IndexedDB cho tới khi lên được Drive (FR-025).

**Alternatives considered**: Background Sync API — chỉ có trên Chrome Android, không có trên iOS →
dùng thêm như "điểm cộng" trên Android, không phụ thuộc vào nó.

**Gọi API Apps Script từ GitHub Pages**: dùng `POST` với `Content-Type: text/plain` (yêu cầu "simple",
không cần preflight CORS) — cách làm phổ biến và ổn định với Apps Script Web App.

---

## R4. Đồng bộ 2–3 máy trong 5 giây

**Decision**: (1) Có thao tác mới (gửi/trả xe...) thì máy **đẩy lên ngay** (`push`, gom trong 300 ms),
không chờ vòng định kỳ; (2) mỗi máy hỏi máy chủ "có gì mới từ lần trước?" (`pull` theo số phiên bản
tăng dần) mỗi **3 giây** khi app đang mở và có mạng. Máy chủ giữ một bộ đếm phiên bản; mỗi thay đổi tăng bộ đếm.
Ghi dữ liệu dùng `LockService` để 2 máy ghi cùng lúc không đè nhau.

**Rationale**: Apps Script không có kết nối realtime. Thời gian xe gửi ở máy A hiện ở máy B ≈ gửi
lên ngay (~1–2 s) + chờ lượt `pull` kế tiếp của máy B (≤ 3 s) ≈ **dưới 5 giây** (FR-014). (Bản trước
đẩy lên theo vòng 4 giây nên trường hợp xấu ~8 giây — đã sửa sau `/speckit-analyze`.) Tải: 3 máy × 20
lần/phút + các lần `push` ≈ 70 lượt gọi/phút giờ cao điểm, mỗi lượt vài trăm ms, nằm trong giới hạn
Apps Script (tối đa 30 lượt chạy đồng thời).

**Khóa dữ liệu**: chỉ giữ `LockService` trong lúc đọc/ghi Sheets (vài trăm ms). **Không bao giờ** gọi
dịch vụ AI hay ghi file Drive trong lúc giữ khóa, để các máy khác không bị chờ hoặc báo `BUSY`.

**Xung đột số phiếu** (2 máy cùng dùng số 037 khi offline): máy chủ giữ lượt đến trước, lượt sau bị
đánh dấu `conflict` để quản lý gán lại số (FR-012a). Khi online, máy kiểm tra số trùng ngay trên dữ
liệu đã đồng bộ nên hiếm khi xảy ra.

---

## R5. Camera, chụp ảnh và quét QR trên cả Android và iPhone

**Decision**:

- Camera mở sẵn bằng `getUserMedia` (camera sau); chụp ảnh bằng cách lấy khung hình từ video → **0 độ
  trễ, không mở app camera riêng**, và **tự chụp ảnh lúc ra** khi bấm "Trả xe" (FR-009b).
- Quét QR: dùng `BarcodeDetector` có sẵn của trình duyệt nếu có (Chrome Android), nếu không thì dùng
  thư viện **jsQR** (chạy được trên Safari iOS).
- Nút bật đèn flash (torch) trên máy hỗ trợ; nếu máy không hỗ trợ thì ẩn nút.

**Rationale**: Đáp ứng Nguyên tắc I (1 chạm) và FR-006, FR-009b trên cả hai hệ điều hành.

**Alternatives considered**: `<input type="file" capture>` — mở app camera của máy, thêm 2 chạm và
không tự chụp được → chỉ dùng làm phương án dự phòng nếu `getUserMedia` bị từ chối quyền.

---

## R6. Phân tích ảnh bằng AI: biển số, màu xe, mũ bảo hiểm

**Decision**: Sau khi **mỗi ảnh (vào và ra)** lên tới Apps Script, máy chủ gửi ảnh tới **một dịch vụ AI
đọc ảnh** qua `UrlFetchApp` với **một lần gọi duy nhất**, yêu cầu trả về JSON:

```json
{ "plate": "59X1-123.45", "color": "đỏ", "vehicleType": "motorbike",
  "helmetsOnVehicle": 2, "helmetsWorn": 0, "otherItems": ["áo mưa"],
  "confidence": { "plate": 0.9, "color": 0.95, "helmets": 0.8 } }
```

Với ảnh lúc ra, máy chủ so với kết quả ảnh lúc vào bằng luật đơn giản (trong `shared/compare.js`):

- `color` khác nhau (theo nhóm màu: đỏ, xanh dương, xanh lá, đen, trắng, xám/bạc, vàng, cam, nâu,
  hồng/tím) **và** cả hai `confidence.color` ≥ ngưỡng → cảnh báo **cao**.
- `plate` đọc được ở cả hai ảnh, khác nhau quá 1 ký tự → cảnh báo **cao**.
- `(helmetsOnVehicle + helmetsWorn)` lúc ra < lúc vào **và** cả hai `confidence.helmets` ≥ ngưỡng →
  cảnh báo **trung bình**.
- Ngưỡng mặc định 0,7, quản lý chỉnh được để giảm báo sai (SC-014).

Máy nhân viên nhận cảnh báo qua vòng `pull` 3 giây → tổng thời gian ≈ tải ảnh (2–4s) + AI (2–5s) +
pull (≤ 3s) ≈ **dưới 15 giây** (SC-012). Để giữ được mức này giờ cao điểm, hàng đợi tải ảnh **ưu tiên
ảnh lúc ra** trước ảnh lúc vào.

**Đo độ chính xác**: trước khi dùng thật, gom ~50 ảnh thật ở bãi (ngày/đêm, có/không mũ, nhiều màu) kèm
đáp án đúng, chạy script đánh giá để đo SC-009, SC-013, SC-014 và chỉnh câu lệnh gửi AI cùng ngưỡng.

Nhà cung cấp AI cấu hình được trong Script Properties:

- **Mặc định: Google Gemini API (gói miễn phí, model Flash)** — 0đ ở quy mô ~400 ảnh/ngày (vào + ra),
  giờ cao điểm ~6–12 ảnh/phút, nằm trong giới hạn gói miễn phí hiện tại. Giới hạn này có thể bị Google
  thay đổi → khi hết lượt, ảnh được xếp hàng phân tích lại sau, không ảnh hưởng gửi/trả xe.
- **Dự phòng: Claude API (model Haiku)** — trả phí theo lượt, chi phí thấp, dùng khi cần độ chính xác
  hoặc ổn định cao hơn.

Kết quả ghi vào ảnh/lượt gửi và tới các máy qua `pull` (FR-021, FR-022, FR-026 → FR-029). Phân tích ảnh
lúc vào chạy ngay khi ảnh lên, nên thường đã có sẵn khi khách ra để hiện "Xe máy màu đỏ · 2 mũ" (FR-027).

**Rationale**: Đọc biển số Việt Nam (2 dòng, nhiều kiểu) trực tiếp trên trình duyệt (Tesseract.js) cho
kết quả kém và làm nặng máy; dịch vụ AI đọc ảnh chính xác hơn nhiều với ảnh chụp cả chiếc xe. Chạy ở
máy chủ nên **không ảnh hưởng tốc độ ở cổng** (Nguyên tắc II).

**Alternatives considered**:

- *OCR của Google Drive* (miễn phí sẵn trong Apps Script): kém với ảnh có biển số nhỏ trong khung hình
  → loại.
- *Tesseract.js trên máy*: nặng, chậm, kém chính xác → loại.
- *Google Cloud Vision*: đọc chữ tốt nhưng không hiểu "đâu là biển số", vượt gói miễn phí ở ~6.000
  ảnh/tháng → loại.

**Vì sao so sánh bằng luật thay vì hỏi AI "hai ảnh có khớp không"**: luật rõ ràng, kiểm thử được, chỉnh
ngưỡng được, và mỗi ảnh chỉ phân tích một lần (rẻ hơn, dùng lại cho tìm kiếm/báo cáo).

**Lưu ý quyền riêng tư**: gói miễn phí của Gemini có thể dùng dữ liệu để cải thiện dịch vụ. Ảnh chỉ là
ảnh xe trong bãi, nhưng chủ sân nên biết điều này; nếu không đồng ý thì chuyển sang gói trả phí.

---

## R7. Mã QR trên phiếu và in phiếu

**Decision**:

- Nội dung QR: `GM1|20261103|037|<ck>` — phiên bản, ngày, số thứ tự, và `<ck>` là 6 ký tự mã kiểm tra
  (HMAC-SHA256 với khóa bí mật). Khóa bí mật được máy chủ gửi về máy sau khi đăng nhập để kiểm tra
  được cả khi offline (FR-002).
- In phiếu: trang quản lý tạo phiếu ngay trong trình duyệt (thư viện **qrcode-generator**) thành trang
  in A4, **24 phiếu/trang (3 cột × 8 hàng)**, mỗi trang chứa số liên tiếp; 200 phiếu ≈ 9 trang. In bằng
  lệnh In của trình duyệt (in thẳng hoặc lưu PDF). Cắt từng trang, xếp chồng theo thứ tự trang.

**Rationale**: Không cần máy chủ tạo PDF; in được từ máy tính hoặc điện thoại của Duy; đáp ứng FR-001,
FR-003, SC-003.

---

## R8. Dung lượng và giới hạn miễn phí

| Hạng mục | Ước tính | Giới hạn miễn phí | Kết luận |
|---|---|---|---|
| Ảnh lên Drive | ~400 ảnh/ngày × 150KB ≈ 60MB/ngày → ~1,8GB cho 30 ngày | 15GB (dùng chung Gmail) | Đủ, có dọn tự động |
| Dòng dữ liệu Sheets | ~6.000 lượt/tháng; giữ 90 ngày ≈ 18.000 dòng | 10 triệu ô | Đủ |
| Lượt gọi Apps Script | ~45 lần/phút giờ cao điểm | 30 lượt chạy đồng thời, 6 phút/lượt | Đủ |
| Phân tích ảnh AI | ~400 ảnh/ngày (vào + ra) | Gói miễn phí Gemini Flash | Đủ (cần theo dõi) |

**Decision**: Một trigger chạy mỗi đêm trong Apps Script xóa ảnh trên Drive cũ hơn 30 ngày và chuyển
lượt cũ hơn 90 ngày sang file lưu trữ (FR-019).

---

## R9. Đăng nhập và phân quyền

**Decision**: Mỗi nhân viên có **tên + mã PIN 4–6 số** do quản lý tạo. Đăng nhập trả về một token lưu
trên máy; mọi lệnh gửi lên kèm token, máy chủ kiểm tra vai trò (nhân viên / quản lý) trước khi thực
hiện (FR-018). Web App triển khai dạng "Thực thi với tư cách: Tôi (chủ sân), Ai cũng truy cập được",
bảo vệ bằng token, nên nhân viên **không cần tài khoản Google**.

**Rationale**: Đơn giản cho nhân viên (Nguyên tắc V); Duy giữ toàn quyền dữ liệu trên Google của mình.

---

## R10. Kiểm thử

**Decision**:

- Logic thuần (nhảy số phiếu, tính tiền, kiểm tra QR, gộp dữ liệu đồng bộ, xử lý xung đột) viết thành
  module JavaScript dùng chung, kiểm thử bằng **Vitest**.
- Luồng đầu-cuối (gửi/trả xe, offline rồi online lại) kiểm thử bằng **Playwright** với camera giả lập
  của Chromium và một máy chủ giả lập API.
- Phần Apps Script kiểm thử logic bằng Vitest (cùng module) + kiểm thử tay theo [quickstart.md](./quickstart.md)
  trên bản triển khai thử.

**Rationale**: Constitution yêu cầu luồng gửi/trả và đồng bộ offline phải có kiểm thử tự động.
