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

✅ **US6 — chạy ngầm**: ảnh lưu trên máy trước rồi tự **sao lưu lên Google Drive** (ảnh lúc ra được ưu tiên);
máy khác / máy mới **tự tải ảnh từ Drive**; **AI đọc biển số, màu xe, số mũ** ("Xe máy màu đỏ · 2 mũ") hiện ở màn
hình trả xe; tìm xe theo vài số cuối biển số; sửa tay biển số; dọn ảnh cũ trên máy (chỉ ảnh đã sao lưu > 7 ngày)
và dọn Drive hằng đêm (ảnh > 30 ngày; dữ liệu > 90 ngày dời sang file lưu trữ).

✅ **US4 — mất phiếu**: chọn xe trong lưới ảnh → trả xe mất phiếu (ghi chú bắt buộc, thu phí mất phiếu, chụp ảnh ra);
gán lại số phiếu khi lúc gửi đưa nhầm phiếu.

✅ **US5 — chốt ca & quản lý**: nhân viên **chốt ca** thấy ngay tiền cần nộp (chạy cả khi mất mạng, máy chủ xác nhận
sau); chủ sân vào **Quản lý**: báo cáo theo ngày/ca (hôm nay, 7 ngày, tháng này), **đổi giá**, **thêm/khóa nhân viên,
đổi PIN**, xem lượt có xung đột và **hủy lượt** (bắt buộc lý do, không xóa dữ liệu).

⏳ **Chưa có** (bản sau): cảnh báo AI khi ảnh ra khác ảnh vào — thiếu mũ, khác màu xe (US7).

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
> Sau khi cập nhật mã mới, chạy lại **`setup`** một lần (an toàn, không mất dữ liệu) để thêm cột mới nếu có.

### 1b. (Tùy chọn) Bật AI đọc biển số, màu xe, số mũ

Không bật thì app vẫn chạy đủ, chỉ không tự đọc biển số. Để bật, trong Apps Script vào **Cài đặt dự án →
Thuộc tính tập lệnh (Script Properties)** và thêm:

| Thuộc tính | Giá trị |
|---|---|
| `VISION_API_KEY` | Khóa API — mặc định **Google Gemini** (lấy miễn phí tại Google AI Studio) |
| `VISION_PROVIDER` | `gemini` (mặc định, gói miễn phí) hoặc `claude` (Claude Haiku 5.5, trả phí theo lượt) |
| `VISION_MODEL` | (không bắt buộc) mặc định `gemini-2.5-flash` hoặc `claude-haiku-5-5` |

> Lưu ý: gói miễn phí của Gemini có thể dùng dữ liệu gửi lên để cải thiện dịch vụ (ảnh xe trong bãi). Không muốn
> vậy thì dùng gói trả phí. AI lỗi hoặc hết lượt miễn phí: gửi/trả xe vẫn bình thường, ảnh được phân tích lại sau
> (trigger 5 phút).

### 2. Trang web: GitHub Pages

1. Gộp nhánh vào `main`. Vào **Settings → Pages → Source: GitHub Actions**.
2. Workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) tự đưa thư mục `web/` lên mỗi lần đẩy
   vào `main`. Link có dạng `https://anzduy.github.io/go-may-giu-xe/`.

### 3. Trên điện thoại

1. Mở link → lần đầu dán **URL `/exec`** vào ô "Địa chỉ máy chủ" → đăng nhập **Quản lý** + mã PIN ở bước 1.4.
2. **Thêm vào màn hình chính** (iPhone: Safari → Chia sẻ → Thêm vào MH chính; Android: Chrome → ⋮ → Cài đặt
   ứng dụng). Cho phép **Camera**.
3. Đổi mã PIN của chính mình và tạo tài khoản nhân viên ngay trên app: **Quản lý → Nhân viên**.
   (Dự phòng: hàm **`themNhanVien`** trong `Setup.js` của Apps Script.)

Hướng dẫn cho nhân viên: [`docs/huong-dan-nhan-vien.md`](docs/huong-dan-nhan-vien.md).

## Phát triển

```bash
npm install
npm test            # 111 unit test: logic phiếu, giá, đồng bộ, AI đọc ảnh, Apps Script chạy giả lập
npm run test:e2e    # 23 test đầu-cuối trên Chromium với camera giả (2 máy, mất mạng, sao lưu ảnh)
npm run serve       # chạy thử tại http://localhost:5173
npm run build:gas   # sinh gas/Shared.js từ web/shared/ (chạy sau khi sửa web/shared/)
```

Cấu trúc: `web/` (trang PWA, không cần build) · `web/shared/` (logic dùng chung web + Apps Script + test) ·
`gas/` (Apps Script) · `tests/` (Vitest + Playwright).
