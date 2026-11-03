# Quickstart: Cài đặt và kiểm tra App Giữ Xe Gò Mây Arena

**Spec**: [spec.md](./spec.md) · **Data model**: [data-model.md](./data-model.md) · **API**: [contracts/api.md](./contracts/api.md)

## A. Chuẩn bị (một lần, chủ sân làm)

1. Một tài khoản Google của chủ sân (dữ liệu và ảnh sẽ nằm ở Drive của tài khoản này).
2. Một tài khoản GitHub (để host trang web miễn phí qua GitHub Pages).
3. Một khóa API đọc ảnh (mặc định Gemini, gói miễn phí — xem [research.md](./research.md) R6).

## B. Triển khai máy chủ (Apps Script)

1. Mở file Google Sheets mới tên `GoMay-GiuXe` → **Tiện ích mở rộng → Apps Script**.
2. Dán mã trong thư mục `gas/` (hoặc dùng `clasp push`).
3. **Project Settings → Script Properties**: thêm `QR_SECRET` (chuỗi ngẫu nhiên dài), `VISION_PROVIDER`
   (`gemini` hoặc `claude`), `VISION_API_KEY`.
4. Chạy hàm `setup()` một lần: tạo các sheet, thư mục Drive `GoMay-GiuXe/Anh`, tài khoản quản lý đầu
   tiên (PIN tạm), bảng giá mặc định, trigger dọn dẹp hằng đêm.
5. **Triển khai → Triển khai mới → Ứng dụng web**: *Thực thi với tư cách: Tôi*, *Ai có quyền truy cập:
   Bất kỳ ai*. Chép URL `/exec`.

## C. Triển khai giao diện (GitHub Pages)

1. Điền URL `/exec` vào `web/config.js`.
2. Bật GitHub Pages cho repo (nhánh `main`, thư mục `/web` hoặc qua GitHub Actions).
3. Mở link dạng `https://<tên-github>.github.io/go-may-giu-xe/` trên điện thoại.
4. **Bắt buộc**: "Thêm vào màn hình chính" (iPhone: Safari → Chia sẻ → Thêm vào MH chính; Android:
   Chrome → ⋮ → Cài đặt ứng dụng). Cho phép quyền **Camera**.

## D. Chạy kiểm thử tự động (lập trình viên)

```bash
npm install
npm test            # Vitest: nhảy số, tính tiền, kiểm tra QR, gộp đồng bộ, xung đột
npm run test:e2e    # Playwright: gửi/trả xe với camera giả, offline → online
```

Kỳ vọng: tất cả đều qua.

## E. Kịch bản kiểm tra thực tế (theo constitution: chạy thử 1 buổi tối trước khi dùng thật)

| # | Làm | Kỳ vọng | Liên quan |
|---|---|---|---|
| 1 | Quản lý tạo 200 phiếu cho hôm nay, in A4 | 9 trang, phiếu 001–200, QR quét được dưới đèn bãi | US3, SC-003 |
| 2 | Máy A mở màn hình gửi xe, chụp 5 xe | Lượt 001–005, đề xuất hiện **006**; mỗi lượt < 5 giây | US1, SC-001 |
| 3 | Sửa số thành 9, chụp | Lượt 009, đề xuất **010**; báo cáo ghi 006–008 "bỏ qua" | US1, FR-007 |
| 4 | Sửa số thành 3 (đang có xe) | Báo "Phiếu 003 đang có xe trong bãi", không cho lưu | FR-008 |
| 5 | Chụp xong bấm "Hoàn tác" trong 10 giây | Lượt bị hủy, đề xuất quay về số cũ | FR-008b |
| 6 | Máy B (cổng ra) quét phiếu 002 | Trong ≤ 5 giây thấy ảnh xe lúc vào; bấm "Trả xe" → tự chụp ảnh ra | US2, FR-014, FR-009b |
| 7 | Máy B gõ "4" thay vì quét | Ra đúng lượt 004 | FR-009 |
| 8 | Quản lý mở lượt 002 | Ảnh vào và ảnh ra đặt cạnh nhau | FR-009c, SC-011 |
| 9 | Chờ 1 phút, xem lượt 001 | Biển số đã tự điền (nếu ảnh rõ biển) | US6, SC-009 |
| 10 | Bật chế độ máy bay trên máy A, gửi 10 xe | Vẫn gửi được, "Chờ sao lưu: 10" | US6, FR-013 |
| 11 | Tắt chế độ máy bay | "Chờ sao lưu" về 0; ảnh có trong Drive; máy B thấy 10 xe | SC-004, SC-010 |
| 12 | Mở app trên máy C mới đăng nhập | Thấy đủ xe trong bãi và ảnh (tải từ Drive) | FR-024 |
| 13 | Trả xe mất phiếu cho 1 xe (chọn trong lưới ảnh, không ghi chú) | Bắt buộc ghi chú; ghi xong thu 10.000đ | US4, FR-012 |
| 14 | Chốt ca | Số lượt, tiền, xe tồn khớp tính tay | US5, SC-005 |
| 15 | Nhân viên mở trang báo cáo/giá | Bị từ chối | FR-018 |
| 16 | Gửi xe đỏ treo 2 mũ; khi trả, gỡ 1 mũ rồi bấm "Trả xe" | ≤ 15 giây: máy rung, thẻ đỏ "lúc vào 2 mũ, lúc ra 1 mũ" | US7, FR-028, SC-012 |
| 17 | Gửi xe đỏ; khi trả, đưa xe xanh ra trước camera | Cảnh báo mức cao "có thể giao nhầm xe (đỏ → xanh)" | US7, SC-013 |
| 18 | Gửi xe treo 1 mũ; khi trả, người lái đội mũ đó | Không cảnh báo | US7, kịch bản 4 |
| 19 | Quét phiếu xe ở bước 16 lúc trả | Màn hình hiện "Xe máy màu đỏ · 2 mũ" | FR-027 |
| 20 | Đóng cảnh báo bước 16 chọn "có vấn đề thật" | Cảnh báo chuyển "đã xử lý", hiện trong chốt ca | FR-030 |
