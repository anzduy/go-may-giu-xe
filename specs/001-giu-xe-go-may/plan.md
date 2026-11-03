# Implementation Plan: App Giữ Xe Gò Mây Arena

**Branch**: `001-giu-xe-go-may` | **Date**: 2026-11-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-giu-xe-go-may/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

App giữ xe cho Gò Mây Arena: mỗi ngày in sẵn ~200 phiếu (số + QR); **gửi xe** = app tự đề xuất số
phiếu tiếp theo, nhân viên chỉ chụp 1 ảnh xe; **trả xe** = quét QR hoặc gõ số, xem ảnh lúc vào, bấm
"Trả xe" (app tự chụp ảnh lúc ra). Chạy ngầm: sao lưu ảnh, AI phân tích ảnh (biển số, màu xe, số mũ
bảo hiểm) và **cảnh báo khi ảnh ra không khớp ảnh vào** (khác màu, khác biển, thiếu mũ).

Cách làm kỹ thuật (xem [research.md](./research.md)): **trang web PWA** (HTML/JS thuần, host GitHub
Pages — là "cái link" nhân viên mở, chạy cả Android và iPhone) lưu mọi thứ trên máy trước bằng
IndexedDB; **Google Apps Script** làm máy chủ, dữ liệu ở **Google Sheets**, ảnh ở **Google Drive** của
chủ sân; dịch vụ AI đọc ảnh gọi từ Apps Script trả về biển số/màu/số mũ, so sánh bằng luật trong
`shared/compare.js`.

## Technical Context

**Language/Version**: JavaScript ES2020 (trình duyệt + Apps Script V8 runtime)

**Primary Dependencies**: Không framework. Thư viện nhỏ nhúng sẵn: `jsQR` (quét QR trên iOS),
`qrcode-generator` (in phiếu), `idb` (bọc IndexedDB). Apps Script: SpreadsheetApp, DriveApp,
LockService, UrlFetchApp, Utilities (HMAC).

**Storage**: Trên máy: IndexedDB (lượt gửi, ảnh, hàng đợi). Máy chủ: Google Sheets (dữ liệu) +
Google Drive (ảnh JPEG).

**Testing**: Vitest (logic dùng chung), Playwright với camera giả của Chromium (đầu-cuối), kiểm thử
tay theo [quickstart.md](./quickstart.md).

**Target Platform**: Chrome Android 100+ và Safari iOS 16.4+ (đã "Thêm vào màn hình chính"); trang
quản lý chạy được cả trên máy tính.

**Project Type**: Web app (PWA tĩnh) + backend Apps Script

**Performance Goals**: Gửi xe < 5 giây (1 chạm), trả xe < 8 giây, 90 xe/15 phút/1 nhân viên; đồng bộ
giữa máy ≤ 5 giây; ảnh lên cloud 95% trong 5 phút.

**Constraints**: Chạy hoàn toàn offline cho gửi/trả/tra cứu; không thao tác nào ở cổng chờ mạng; chi
phí ~0đ/tháng (gói miễn phí Google + GitHub + Gemini); ảnh nén ~100–150KB.

**Scale/Scope**: 1 bãi, 2–3 máy đồng thời, ~200–400 lượt/ngày, ~400 ảnh/ngày (mỗi ảnh 1 lần gọi AI), 3–10 nhân viên; khoảng
7 màn hình (Đăng nhập, Gửi xe, Trả xe, Xe trong bãi, Chốt ca, In phiếu, Quản lý/Báo cáo).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Nguyên tắc | Đáp ứng bằng | Kết quả |
|---|---|---|
| **I. Nhanh tại cổng** | Gửi xe 1 chạm (số tự nhảy, camera mở sẵn, chụp từ khung video); trả xe quét/gõ + 1 chạm (tự chụp ảnh ra); màn hình mặc định là Gửi xe/Trả xe | ✅ Đạt |
| **II. Offline-first, lưu máy trước** | Service Worker + IndexedDB + outbox; đọc biển số và sao lưu chạy sau, không chặn thao tác | ✅ Đạt (giới hạn iOS: chỉ chạy ngầm khi app đang mở — chấp nhận được vì nhân viên mở app suốt ca, xem research R3) |
| **III. Không mất xe, không nhầm xe** | Không 2 lượt `in_lot` cùng số; ảnh vào bắt buộc, ảnh ra tự chụp; QR có mã kiểm tra; "Không khớp" → quy trình kiểm tra; xung đột được đánh dấu cho quản lý; AI so sánh vào/ra và cảnh báo khác màu/biển/thiếu mũ (chỉ cảnh báo, không chặn) | ✅ Đạt |
| **IV. Minh bạch tiền** | Không xóa dòng, chỉ đổi trạng thái; sheet `Audit` chỉ thêm; giá lưu theo lượt (`priceAtIn`); báo cáo chốt ca | ✅ Đạt |
| **V. Đơn giản** | Không framework, không build; tiếng Việt, nút to; đăng nhập tên + PIN; dữ liệu xem thẳng trên Google Sheets | ✅ Đạt |
| **Ràng buộc vận hành** | Điện thoại phổ thông, máy in văn phòng có sẵn, chi phí ~0đ, giữ dữ liệu 90 ngày / ảnh 30 ngày, chỉ quản lý xem doanh thu | ✅ Đạt |
| **Quy trình phát triển** | Vitest + Playwright cho luồng gửi/trả và đồng bộ offline; chạy thử 1 buổi tối (quickstart E) | ✅ Đạt |

**Re-check sau Phase 1 (thiết kế)**: data model không có thao tác xóa; API `push` idempotent theo
`opId`; `uploadPhoto` tách khỏi luồng gửi/trả. Không có vi phạm → bỏ trống Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-giu-xe-go-may/
├── spec.md
├── plan.md              # File này
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── api.md           # Phase 1 — API Apps Script
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — chưa tạo)
```

### Source Code (repository root)

```text
web/                         # Trang PWA — host GitHub Pages
├── index.html               # Khung app, điều hướng giữa các màn hình
├── manifest.webmanifest     # Tên, biểu tượng để "Thêm vào màn hình chính"
├── sw.js                    # Service Worker: cache giao diện, chạy offline
├── config.js                # URL Apps Script
├── css/app.css              # Chữ to, nút to, dùng một tay
├── js/
│   ├── app.js               # Khởi động, đăng nhập, điều hướng
│   ├── screens/
│   │   ├── checkin.js       # Gửi xe: số đề xuất + camera + chụp
│   │   ├── checkout.js      # Trả xe: quét/gõ số, ảnh vào, tự chụp ảnh ra
│   │   ├── lot.js           # Xe trong bãi (lưới ảnh), mất phiếu
│   │   ├── shift.js         # Chốt ca
│   │   ├── print.js         # Tạo + in phiếu A4 (quản lý)
│   │   ├── alerts.js        # Thẻ cảnh báo (rung, âm báo, 2 ảnh), danh sách cảnh báo
│   │   └── admin.js         # Báo cáo, giá, nhân viên, xung đột, độ nhạy cảnh báo (quản lý)
│   ├── camera.js            # getUserMedia, chụp khung hình, nén JPEG, đèn flash
│   ├── scanner.js           # BarcodeDetector hoặc jsQR
│   ├── db.js                # IndexedDB: sessions, photos, outbox, meta
│   ├── sync.js              # Vòng push/pull, tải ảnh lên, thử lại
│   └── api.js               # Gọi Apps Script (text/plain POST)
├── shared/                  # Logic thuần, dùng chung web + gas + test
│   ├── ticket.js            # Nhảy số, kiểm tra số, mã QR + mã kiểm tra
│   ├── pricing.js           # Tính tiền theo giá lúc gửi, phí mất phiếu
│   ├── sessions.js          # Chuyển trạng thái, quy tắc hợp lệ
│   ├── report.js            # Tổng hợp chốt ca / báo cáo
│   └── compare.js           # So sánh phân tích ảnh vào/ra → cảnh báo
└── vendor/                  # jsqr.js, qrcode-generator.js, idb.js

gas/                         # Google Apps Script (đẩy bằng clasp)
├── appsscript.json
├── Main.js                  # doPost: định tuyến action, kiểm tra token/quyền
├── Setup.js                 # setup(): tạo sheet, thư mục, quản lý đầu tiên, trigger
├── Sessions.js              # push ops, pull theo rev, LockService
├── Photos.js                # uploadPhoto/getPhoto, lưu Drive
├── Vision.js                # Gọi AI phân tích ảnh (biển số, màu, mũ), thử lại khi lỗi
├── Alerts.js                # So sánh vào/ra, tạo/đóng cảnh báo
├── Admin.js                 # createBatch, report, setPrices, staff
├── Cleanup.js               # Trigger hằng đêm: xóa ảnh > 30 ngày, lưu trữ > 90 ngày
└── Shared.js                # Bản sao của web/shared/* (tạo bằng script build nhỏ)

tests/
├── unit/                    # Vitest cho web/shared/*
└── e2e/                     # Playwright: checkin, checkout, offline-sync, lost-ticket, alerts

package.json                 # Vitest, Playwright, clasp, script copy shared → gas
```

**Structure Decision**: Web app 2 phần — `web/` (PWA tĩnh, không build) và `gas/` (Apps Script).
Logic quan trọng nằm ở `web/shared/` để kiểm thử một lần và dùng chung cho cả máy và máy chủ (máy chủ
là nơi quyết định cuối cùng khi có xung đột).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Không có vi phạm.
