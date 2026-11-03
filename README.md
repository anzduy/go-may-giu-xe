# Giữ Xe Gò Mây Arena

App giữ xe cho sân bóng Gò Mây Arena. Chạy trên **Android và iPhone** (mở link, "Thêm vào màn hình chính"),
dữ liệu lưu ở **Google Sheets**, máy chủ là **Google Apps Script** — chi phí ~0đ/tháng.

- **In phiếu**: mỗi ngày in sẵn ~200 phiếu (số to + mã QR) trên giấy A4, 24 phiếu/trang.
- **Gửi xe = 1 chạm**: app tự hiện số phiếu tiếp theo, nhân viên chỉ bấm CHỤP (ảnh xe) và đưa phiếu.
  Phiếu lệch số thì chạm vào số để sửa; lượt sau tự nhảy tiếp.
- **Trả xe**: quét QR hoặc gõ số → xem ảnh lúc vào → bấm TRẢ XE (app tự chụp ảnh lúc ra).
- **Mất mạng vẫn chạy**: mọi thứ lưu trên máy trước, có mạng thì tự đồng bộ giữa 2–3 máy.

Tài liệu thiết kế (Spec Kit): [`specs/001-giu-xe-go-may/`](specs/001-giu-xe-go-may/) — spec, plan, tasks.

## Trạng thái

✅ **Bản MVP** (giai đoạn 1–5 trong `tasks.md`): in phiếu, gửi xe, trả xe, trả xe tạm, xe trong bãi, chi tiết lượt.

⏳ **Chưa có** (bản sau): trả xe mất phiếu (US4), chốt ca/báo cáo (US5), **sao lưu ảnh lên Drive + đọc biển số**
(US6 — trước khi có, ảnh chỉ nằm trên máy đã chụp), cảnh báo AI màu xe/mũ bảo hiểm (US7).

## Cài đặt (chủ sân làm một lần)

### 1. Máy chủ: Google Sheets + Apps Script

1. Tạo file Google Sheets mới tên **GoMay-GiuXe**.
2. **Tiện ích mở rộng → Apps Script**. Xóa nội dung `Code.gs` mặc định.
3. Tạo các file trong thư mục [`gas/`](gas/) với đúng tên và nội dung (`Shared.js`, `Db.js`, `Main.js`, `Auth.js`,
   `Sessions.js`, `Admin.js`, `Setup.js`, `Cleanup.js`, `Vision.js`); bật **Cài đặt dự án → Hiển thị tệp
   "appsscript.json"** và dán nội dung [`gas/appsscript.json`](gas/appsscript.json).
   *(Hoặc dùng `clasp`: chép `.clasp.json.example` thành `.clasp.json`, điền scriptId, chạy `npm run push:gas`.)*
4. Chọn hàm **`setup`** → **Chạy** → cấp quyền. Mở **Nhật ký thực thi**: có dòng
   `Tài khoản đầu tiên: tên "Quản lý", mã PIN ......` — ghi lại mã PIN này.
5. **Triển khai → Triển khai mới → Ứng dụng web**: *Thực thi với tư cách*: **Tôi**; *Ai có quyền truy cập*:
   **Bất kỳ ai**. Bấm Triển khai, chép **URL kết thúc bằng `/exec`**.

> Sửa mã Apps Script về sau: **Triển khai → Quản lý triển khai → sửa → Phiên bản mới** (URL giữ nguyên).

### 2. Trang web: GitHub Pages

1. Gộp nhánh vào `main`. Vào **Settings → Pages → Source: GitHub Actions**.
2. Workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) tự đưa thư mục `web/` lên mỗi lần đẩy
   vào `main`. Link có dạng `https://anzduy.github.io/go-may-giu-xe/`.

### 3. Trên điện thoại

1. Mở link → lần đầu dán **URL `/exec`** vào ô "Địa chỉ máy chủ" → đăng nhập **Quản lý** + mã PIN ở bước 1.4.
2. **Thêm vào màn hình chính** (iPhone: Safari → Chia sẻ → Thêm vào MH chính; Android: Chrome → ⋮ → Cài đặt
   ứng dụng). Cho phép **Camera**.
3. Tạo tài khoản nhân viên (màn hình quản lý nhân viên có ở bản sau): trong Apps Script mở `Setup.js`, sửa
   tên / mã PIN trong hàm **`themNhanVien`** → chọn hàm đó → **Chạy**. Lặp lại cho từng người.

Hướng dẫn cho nhân viên: [`docs/huong-dan-nhan-vien.md`](docs/huong-dan-nhan-vien.md).

## Phát triển

```bash
npm install
npm test            # 63 unit test: logic phiếu, giá, đồng bộ, Apps Script chạy giả lập
npm run test:e2e    # 13 test đầu-cuối trên Chromium với camera giả
npm run serve       # chạy thử tại http://localhost:5173
npm run build:gas   # sinh gas/Shared.js từ web/shared/ (chạy sau khi sửa web/shared/)
```

Cấu trúc: `web/` (trang PWA, không cần build) · `web/shared/` (logic dùng chung web + Apps Script + test) ·
`gas/` (Apps Script) · `tests/` (Vitest + Playwright).
