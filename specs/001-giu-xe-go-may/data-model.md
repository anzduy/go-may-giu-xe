# Data Model: App Giữ Xe Gò Mây Arena

**Date**: 2026-11-03 | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

Dữ liệu tồn tại ở **2 nơi**:

- **Trên điện thoại** (IndexedDB): bản sao để làm việc offline + hàng đợi chờ gửi.
- **Trên Google** (Sheets + Drive của chủ sân): bản chính và bản sao lưu.

Mỗi entity dưới đây tương ứng với **một trang tính (sheet)** trong file Google Sheets `GoMay-GiuXe`,
trừ khi ghi khác.

---

## 1. Session — Lượt gửi (sheet `Sessions`)

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `id` | UUID (chuỗi) | ✔ | Máy tạo ra lúc gửi xe; dùng để gửi lại không bị trùng |
| `ticketDate` | `YYYYMMDD` | ✔ | Ngày của phiếu |
| `ticketNo` | số nguyên 1–999 | ✔ | Số in trên phiếu |
| `noTicket` | true/false | ✔ | `true` khi "gửi xe không phiếu" (hết phiếu) |
| `vehicleType` | `motorbike` \| `ebike` \| `bicycle` | ✔ | Mặc định `motorbike` |
| `plate` | chuỗi | | Biển số (tự đọc hoặc nhập tay), dạng chuẩn hóa `59X112345` |
| `plateStatus` | `pending` \| `read` \| `unreadable` \| `manual` | ✔ | Mặc định `pending` |
| `inSummary` | chuỗi | | Tóm tắt từ ảnh vào, ví dụ "Xe máy màu đỏ · 2 mũ" (hiện ở màn hình trả xe) |
| `inAt` | thời điểm ISO | ✔ | Giờ vào (theo đồng hồ máy) |
| `inStaffId` | chuỗi | ✔ | Nhân viên nhận xe |
| `inDeviceId` | chuỗi | ✔ | Máy nhận xe |
| `inPhotoId` | chuỗi | ✔ | Ảnh lúc vào |
| `outAt` | thời điểm ISO | | Giờ ra |
| `outStaffId` | chuỗi | | Nhân viên trả xe |
| `outPhotoId` | chuỗi | | Ảnh lúc ra (bắt buộc khi đã trả) |
| `fee` | số nguyên (đồng) | | Số tiền đã thu: giá thường hoặc phí mất phiếu |
| `priceAtIn` | số nguyên (đồng) | ✔ | Giá áp dụng lúc gửi (để đổi giá giữa ngày không ảnh hưởng) |
| `status` | xem mục trạng thái | ✔ | |
| `note` | chuỗi | | Bắt buộc khi `lost`, `provisional`, `cancelled`; khi `noTicket` và không có biển số |
| `conflict` | chuỗi | | Lý do xung đột đồng bộ (trùng số, trả 2 lần) — quản lý xử lý |
| `rev` | số nguyên | ✔ | Phiên bản thay đổi cuối (dùng cho `pull`) |

**Trạng thái và chuyển trạng thái**:

```text
                ┌──────────── undo (≤10 giây) ───────────┐
                │                                         ▼
  (tạo) ──► in_lot ──── checkout ────► returned        cancelled
                │                                         ▲
                ├──── lost_checkout ──► lost             │
                ├──── provisional_checkout ─► provisional ──(ghép khi đồng bộ)──► returned
                └──── manager_cancel ───────────────────────┘
```

- `in_lot` → `returned`: quét/gõ số + "Trả xe" (cần `outPhotoId`, `fee = priceAtIn`).
- `in_lot` → `lost`: quy trình mất phiếu (cần `note`, `fee = lostFee`).
- `provisional`: máy cổng ra chưa có dữ liệu lượt gửi; tạo lượt "trả tạm" kèm ảnh ra, máy chủ ghép
  với lượt gửi thật khi đồng bộ.
- `cancelled`: hoàn tác trong 10 giây (bởi chính nhân viên) hoặc quản lý hủy (cần `note`).
- Không có chuyển trạng thái nào xóa dòng (Nguyên tắc IV).

**Quy tắc kiểm tra**:

- Không được có 2 lượt `in_lot` cùng (`ticketDate`, `ticketNo`).
- Phiếu đã dùng (`returned`, `lost`) không dùng lại để gửi xe.
- Chỉ phiếu có `ticketDate` = hôm nay được dùng để **gửi**; phiếu ngày bất kỳ được dùng để **trả**.
- `ticketNo` ≤ số lớn nhất đã tạo trong `TicketBatches` của ngày đó (trừ khi `noTicket`).

---

## 2. TicketBatch — Bộ phiếu ngày (sheet `TicketBatches`)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `date` | `YYYYMMDD` | Ngày của phiếu |
| `fromNo` | số nguyên | Ví dụ 1 |
| `toNo` | số nguyên | Ví dụ 200 |
| `createdBy` | staffId | Phải là quản lý |
| `createdAt` | thời điểm ISO | |

- Tạo thêm phiếu: `fromNo` = `toNo` lớn nhất của ngày + 1.
- **Phiếu không được lưu từng tờ**; trạng thái từng phiếu được suy ra:
  - có lượt `in_lot` → "đang gửi xe"; có lượt `returned` → "đã trả"; có lượt `lost` → "báo mất";
  - nhỏ hơn số đã dùng lớn nhất mà chưa có lượt nào → "bị bỏ qua";
  - còn lại → "chưa dùng".

---

## 3. Photo — Ảnh xe (sheet `Photos`; file ảnh nằm ở Google Drive)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID | Máy tạo |
| `sessionId` | UUID | Lượt gửi |
| `kind` | `in` \| `out` | Ảnh lúc vào / lúc ra |
| `takenAt` | thời điểm ISO | |
| `deviceId` | chuỗi | |
| `driveFileId` | chuỗi | Rỗng cho tới khi lên Drive |
| `uploadedAt` | thời điểm ISO | |
| `analysisStatus` | `pending` \| `done` \| `unclear` \| `failed` \| `manual` | Trạng thái phân tích AI |
| `plate` | chuỗi | Biển số đọc từ ảnh này |
| `color` | chuỗi | Nhóm màu chính (đỏ, xanh dương, đen, trắng, xám/bạc...) |
| `vehicleTypeSeen` | chuỗi | Loại xe AI nhìn thấy |
| `helmetsOnVehicle` | số nguyên | Mũ treo/để trên xe |
| `helmetsWorn` | số nguyên | Mũ đội trên đầu người trong ảnh |
| `otherItems` | danh sách chuỗi | Áo mưa, túi... |
| `confidence` | JSON | `{ plate, color, helmets }` từ 0 đến 1 |
| `analyzedAt` | thời điểm ISO | |

**Trên điện thoại** (IndexedDB, store `photos`) lưu thêm: `blob` (ảnh JPEG đã nén), `uploadState`
(`pending` \| `uploading` \| `done` \| `failed`), `attempts`. Ảnh `done` cũ hơn 7 ngày có thể bị app dọn
khỏi máy; ảnh khác `done` **không bao giờ** bị dọn (FR-025).

**Trên Drive**: thư mục `GoMay-GiuXe/Anh/YYYY-MM-DD/`, tên file `<ticketNo>_<kind>_<id>.jpg`.

---

## 3b. Alert — Cảnh báo không khớp (sheet `Alerts`)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID | |
| `sessionId` | UUID | Lượt gửi bị cảnh báo |
| `kind` | `color_mismatch` \| `plate_mismatch` \| `helmet_missing` | |
| `level` | `high` \| `medium` | Khác màu/biển số = cao; thiếu mũ = trung bình |
| `message` | chuỗi | Ví dụ "Phiếu 037: lúc vào 2 mũ, lúc ra 1 mũ" |
| `inValue` / `outValue` | chuỗi | Giá trị lúc vào / lúc ra |
| `createdAt` | thời điểm ISO | |
| `notifyStaffId` | chuỗi | Nhân viên vừa trả xe (nhận rung/âm báo) |
| `status` | `new` \| `resolved` | |
| `resolution` | `ok_customer_wearing` \| `false_alarm` \| `real_issue` | |
| `resolvedBy` / `resolvedAt` / `note` | | |

**Quy tắc**: chỉ tạo khi cả ảnh vào và ảnh ra có `analysisStatus = done` và độ chắc chắn ≥ ngưỡng
(`Config.alertThreshold`, mặc định 0,7). Mỗi lượt mỗi `kind` tối đa 1 cảnh báo. Không xóa, chỉ đổi
`status`.

---

## 4. PriceRule — Bảng giá (sheet `Prices`)

| Trường | Kiểu | Mặc định |
|---|---|---|
| `effectiveFrom` | thời điểm ISO | ngày cài đặt |
| `motorbike` | đồng | 5000 |
| `ebike` | đồng | 5000 |
| `bicycle` | đồng | 5000 |
| `lostFee` | đồng | 10000 |
| `setBy` | staffId | quản lý |

Giá dùng cho một lượt = dòng có `effectiveFrom` mới nhất ≤ `inAt`.

---

## 5. Staff — Nhân viên (sheet `Staff`)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | chuỗi | |
| `name` | chuỗi | Hiển thị trên báo cáo |
| `role` | `staff` \| `manager` | |
| `pinHash` | chuỗi | Mã PIN đã băm (không lưu PIN gốc) |
| `active` | true/false | Nghỉ việc thì tắt, không xóa |

Token đăng nhập lưu ở sheet `Tokens` (`token`, `staffId`, `deviceId`, `createdAt`, `revoked`).

---

## 6. Shift — Ca làm việc (sheet `Shifts`)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID | |
| `staffId` | chuỗi | |
| `deviceId` | chuỗi | |
| `startAt` / `endAt` | thời điểm ISO | `endAt` ghi khi "Chốt ca" |
| `summary` | JSON | Kết quả chốt ca: số lượt, tiền theo loại xe, lượt mất phiếu, trả tạm, xe còn tồn, phiếu đã dùng |

Lượt gửi thuộc ca theo `inStaffId`/`outStaffId` và thời gian; tiền tính vào ca **trả xe**.

---

## 7. AuditEntry — Nhật ký (sheet `Audit`)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `at` | thời điểm ISO | |
| `staffId` | chuỗi | |
| `deviceId` | chuỗi | |
| `action` | `create` \| `checkout` \| `lost` \| `provisional` \| `undo` \| `cancel` \| `reassign` \| `set_plate` \| `set_analysis` \| `resolve_alert` \| `set_price` \| `create_batch` \| `staff_change` | |
| `sessionId` | UUID | nếu liên quan |
| `detail` | JSON | giá trị cũ → mới, lý do |

Chỉ thêm, không sửa, không xóa.

---

## 8. Trên điện thoại: Outbox — Hàng đợi chờ gửi (chỉ IndexedDB)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `opId` | UUID | Máy chủ bỏ qua nếu đã nhận `opId` này (gửi lại an toàn) |
| `type` | tên thao tác (xem [contracts/api.md](./contracts/api.md)) | |
| `payload` | JSON | |
| `createdAt` | thời điểm ISO | |
| `attempts` | số nguyên | |

Máy cũng lưu `nextTicketNo` (số đề xuất tiếp theo, riêng từng máy, reset về 1 mỗi ngày) và `lastRev`
(phiên bản đã `pull` tới).
