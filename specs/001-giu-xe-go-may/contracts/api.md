# API Contract: Apps Script Web App

**Base URL**: `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`

Mọi lệnh gửi bằng `POST`, header `Content-Type: text/plain;charset=utf-8` (tránh preflight CORS),
body là JSON:

```json
{ "action": "<tên lệnh>", "token": "<token đăng nhập>", "deviceId": "<id máy>", "data": { } }
```

Kết quả luôn là JSON:

```json
{ "ok": true, "data": { } }
{ "ok": false, "error": { "code": "TICKET_IN_USE", "message": "Phiếu 037 đang có xe trong bãi" } }
```

Quyền: 🟢 nhân viên + quản lý · 🔴 chỉ quản lý.

---

## 1. `login` (không cần token)

**data**: `{ "staffName": "Tuấn", "pin": "1234" }`

**→ data**: `{ "token", "staff": { "id", "name", "role" }, "qrSecret", "serverTime" }`

Lỗi: `BAD_LOGIN`, `STAFF_INACTIVE`.

## 2. `push` 🟢 — gửi hàng đợi thao tác

**data**: `{ "ops": [ { "opId", "type", "payload", "createdAt" } ] }` (tối đa 50 thao tác/lần)

**→ data**: `{ "results": [ { "opId", "status": "applied" | "duplicate" | "conflict" | "rejected", "error"?, "session"? } ], "rev" }`

Các `type`:

| type | payload | Quy tắc chính |
|---|---|---|
| `createSession` | `{ id, ticketDate, ticketNo, noTicket, vehicleType, inAt, inPhotoId, plate? }` | Trùng số phiếu đang `in_lot` → `conflict` (lượt đến trước giữ nguyên) |
| `checkout` | `{ sessionId, outAt, outPhotoId }` | Lượt phải `in_lot`; đã trả → `conflict` "trả 2 lần" |
| `provisionalCheckout` | `{ id, ticketDate, ticketNo, outAt, outPhotoId, note }` | Lưu `provisional`; máy chủ tự ghép khi `createSession` tương ứng đến |
| `lostCheckout` | `{ sessionId, outAt, outPhotoId, note }` | `note` bắt buộc; `fee = lostFee` |
| `undo` | `{ sessionId }` | Chỉ khi `inAt` cách thời điểm thao tác ≤ 10 giây và cùng nhân viên |
| `setPlate` | `{ sessionId, plate }` | `plateStatus = manual` |
| `reassignTicket` | `{ sessionId, ticketNo, note }` | Số mới không được trùng lượt `in_lot` khác |
| `closeShift` | `{ shiftId, startAt, endAt }` | Máy chủ tính `summary` (gồm số cảnh báo, số chưa xử lý) và trả về |
| `resolveAlert` | `{ alertId, resolution, note? }` | `resolution`: `ok_customer_wearing` \| `false_alarm` \| `real_issue` |
| `setAnalysis` 🔴 | `{ photoId, color?, helmetsOnVehicle?, helmetsWorn?, plate? }` | `analysisStatus = manual`; chạy lại so sánh |
| `cancel` 🔴 | `{ sessionId, note }` | `note` bắt buộc |

Mỗi thao tác được ghi vào `Audit`. Gửi lại cùng `opId` → `duplicate` (không làm lại).

## 3. `pull` 🟢 — lấy thay đổi mới

**data**: `{ "sinceRev": 1234 }`

**→ data**: `{ "rev": 1240, "sessions": [ ... ], "analyses": [ ... ], "alerts": [ ... ], "prices": { ... }, "batches": [ ... ], "full": false }`

- `alerts` chỉ gồm cảnh báo `new`; máy rung/kêu khi nhận cảnh báo mới có `notifyStaffId` = mình.

- Lần đầu (`sinceRev = 0`) hoặc quá cũ: trả `full: true` gồm **tất cả lượt `in_lot`** + lượt của hôm nay.
- Máy gọi mỗi 4 giây khi app đang mở và có mạng.

## 4. `uploadPhoto` 🟢

**data**: `{ "photoId", "sessionId", "kind": "in" | "out", "takenAt", "jpegBase64" }`

**→ data**: `{ "driveFileId" }`

- Lưu vào `GoMay-GiuXe/Anh/YYYY-MM-DD/`. Gửi lại cùng `photoId` → trả `driveFileId` cũ.
- Sau khi lưu (cả `in` và `out`), máy chủ gọi dịch vụ AI phân tích ảnh (biển số, màu, mũ...), ghi kết
  quả vào `Photos`; với `in` cập nhật `plate`, `plateStatus`, `inSummary` của lượt; với `out` chạy so
  sánh và tạo `Alerts` nếu không khớp (xem [research.md](../research.md) R6). Kết quả tới các máy qua
  `pull`. Lỗi AI **không** làm lỗi lệnh này — ảnh được đánh dấu `failed` và trigger 5 phút/lần phân tích lại.

## 5. `getPhoto` 🟢

**data**: `{ "photoId" }` → **data**: `{ "jpegBase64" }` — dùng khi ảnh không còn trên máy (FR-024).

## 6. `createBatch` 🔴

**data**: `{ "date": "20261108", "count": 200 }`

**→ data**: `{ "date", "fromNo", "toNo", "tickets": [ { "no", "qr" } ] }`

`qr` = `GM1|<date>|<no 3 chữ số>|<ck>`, `ck` = 6 ký tự đầu (hex) của HMAC-SHA256(`qrSecret`, `<date>|<no>`).

## 7. `report` 🔴

**data**: `{ "from": "20261101", "to": "20261107", "groupBy": "day" | "shift" }`

**→ data**: `{ "rows": [ { "key", "count", "revenue", "byType": { ... }, "lost", "provisional", "conflicts", "ticketsPrinted", "ticketsUsed", "skipped" } ] }`

## 8. `setPrices` 🔴 · `listStaff` 🔴 · `saveStaff` 🔴

- `setPrices`: `{ motorbike, ebike, bicycle, lostFee }` → thêm dòng `Prices` mới.
- `setConfig` 🔴: `{ alertThreshold }` (0,5–0,95) → chỉnh độ nhạy cảnh báo.
- `listAlerts` 🔴: `{ from, to, status? }` → danh sách cảnh báo kèm `photoId` vào/ra.
- `saveStaff`: `{ id?, name, role, pin?, active }` → tạo/sửa nhân viên (không xóa).

## Mã lỗi chung

`AUTH_REQUIRED`, `FORBIDDEN`, `BAD_REQUEST`, `TICKET_IN_USE`, `TICKET_USED`, `TICKET_WRONG_DATE`,
`TICKET_OUT_OF_RANGE`, `TICKET_INVALID`, `SESSION_NOT_FOUND`, `NOTE_REQUIRED`, `UNDO_EXPIRED`,
`BUSY` (không lấy được khóa — máy tự thử lại).
