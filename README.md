# Giữ Xe Gò Mây Arena

App giữ xe cho sân bóng Gò Mây Arena. Chạy trên **Android và iPhone** (mở link, "Thêm vào màn hình chính"),
dữ liệu lưu ở **Google Sheets**, máy chủ là **Google Apps Script** — chi phí ~0đ/tháng.

- **In phiếu**: mỗi ngày in sẵn ~200 phiếu (số to + mã QR) trên giấy A4, 12 phiếu/trang (phiếu cỡ lớn ~97 × 47 mm).
- **Gửi xe = 1 chạm**: app tự hiện số phiếu tiếp theo, nhân viên chỉ bấm CHỤP (ảnh xe) và đưa phiếu.
  Phiếu lệch số thì chạm vào số để sửa; lượt sau tự nhảy tiếp.
- **Trả xe**: quét QR hoặc gõ số → xem ảnh lúc vào → bấm TRẢ XE (app tự chụp ảnh lúc ra).
- **Mất mạng vẫn chạy**: mọi thứ lưu trên máy trước, có mạng thì tự đồng bộ giữa 2–3 máy.

Tài liệu thiết kế (Spec Kit): [`specs/001-giu-xe-go-may/`](specs/001-giu-xe-go-may/) — spec, plan, tasks.

## Trạng thái

✅ **Bản MVP** (giai đoạn 1–5 trong `tasks.md`): in phiếu, gửi xe, trả xe, trả xe tạm, xe trong bãi, chi tiết lượt.

✅ **US6 — chạy ngầm**: ảnh lưu trên máy trước rồi tự **sao lưu lên Google Drive** (ảnh lúc ra được ưu tiên);
máy khác / máy mới **tự tải ảnh từ Drive**; **điện thoại tự đọc biển số + màu xe** (miễn phí, chạy cả khi mất mạng —
xem mục 1b) hiện ở màn hình trả xe; tìm xe theo vài số cuối biển số; sửa tay biển số; dọn ảnh cũ trên máy (chỉ ảnh đã sao lưu > 7 ngày)
và dọn Drive hằng đêm (ảnh > 30 ngày; dữ liệu > 90 ngày dời sang file lưu trữ).

✅ **US4 — mất phiếu**: chọn xe trong lưới ảnh → trả xe mất phiếu (ghi chú bắt buộc, thu phí mất phiếu, chụp ảnh ra);
gán lại số phiếu khi lúc gửi đưa nhầm phiếu.

✅ **Trả xe 1 chạm**: so xe với ảnh lúc vào → **CHO XE RA** → thẻ xanh **"ĐÃ CHO XE RA — Phiếu …"**; quét lại phiếu
đã dùng hiện thẻ đỏ "xe ĐÃ RA lúc …". Ảnh lúc ra **không bắt buộc** (nút chụp riêng; có ảnh thì so biển số / màu và
cảnh báo); mất phiếu và trả xe tạm vẫn bắt buộc chụp ảnh. Phiếu in **cỡ lớn 12 phiếu/trang** A4.

✅ **Thanh toán linh động**: mặc định **thu lúc gửi xe**; khách muốn thì **trả lúc lấy xe**; mỗi lần thu chọn
**tiền mặt** hoặc **chuyển khoản**. Chốt ca tách **tiền mặt cần nộp** và **chuyển khoản** (đối chiếu tài khoản).
Mất phiếu: phí 10.000đ là tổng, đã trả lúc gửi thì chỉ thu phần còn thiếu. Hoàn tác / hủy lượt đã thu → không tính tiền.

✅ **US5 — chốt ca & quản lý**: nhân viên **chốt ca** thấy ngay tiền cần nộp (chạy cả khi mất mạng, máy chủ xác nhận
sau); chủ sân vào **Quản lý**: báo cáo theo ngày/ca (hôm nay, 7 ngày, tháng này), **đổi giá**, **thêm/khóa nhân viên,
đổi PIN**, xem lượt có xung đột và **hủy lượt** (bắt buộc lý do, không xóa dữ liệu).

✅ **US7 — cảnh báo**: so ảnh lúc ra với ảnh lúc vào; **khác biển số / khác màu xe** (cảnh báo cao; **thiếu mũ** chỉ
có khi bật thêm AI trên mạng, xem 1b) → thẻ cảnh báo trên máy nhân viên vừa trả xe (rung; iPhone thì nháy đỏ) + âm báo, có 2 ảnh cạnh nhau,
không chặn lượt trả xe sau. Khách đội mũ khi dắt xe ra vẫn tính đủ mũ. Đóng cảnh báo bằng "Đúng xe / đội mũ",
"Báo sai" hoặc "Có vấn đề thật". Quản lý chỉnh **độ nhạy**, xem danh sách cảnh báo, sửa tay kết quả AI.

✅ **Hoàn thiện**: app tự nhận bản mới (hiện nút "Cập nhật ngay", không tự tải lại giữa lúc trả xe); rà soát bảo mật;
đăng xuất từ xa mọi máy của một nhân viên.

⏳ **Còn lại**: đo độ chính xác AI trên ~50 ảnh thật ở bãi (`node scripts/eval-vision.mjs` — xem
`tests/fixtures/vision/labels.example.json`), phần hoàn thiện, chạy thử thực tế 1 buổi tối.

## Cài đặt (chủ sân làm một lần)

### 1. Máy chủ: Google Apps Script (dán 1 file)

1. Vào **script.google.com** → **Dự án mới** (hoặc từ một Google Sheets: **Tiện ích mở rộng → Apps Script**).
2. Mở file [`gas-bundle/GoMay-GiuXe.gs`](gas-bundle/GoMay-GiuXe.gs) trên GitHub → bấm **Raw** → **Ctrl+A, Ctrl+C**.
3. Trong Apps Script: xóa hết nội dung file `Mã.gs`/`Code.gs` có sẵn → **dán** → **Ctrl+S** để lưu.
4. **⚙️ Cài đặt dự án** → tick **Hiển thị tệp kê khai "appsscript.json" trong trình chỉnh sửa** → quay lại trình
   chỉnh sửa, mở `appsscript.json`, thay bằng nội dung [`gas-bundle/appsscript.json`](gas-bundle/appsscript.json) → lưu.
5. Trên thanh công cụ chọn hàm **`setup`** → **Chạy** → **cấp quyền** (Google cảnh báo "chưa xác minh" thì bấm
   **Nâng cao → Đi tới … (không an toàn)** — đây là mã của chính bạn).
6. Mở **Nhật ký thực thi**: có dòng `Tài khoản đầu tiên: tên "Quản lý", mã PIN ......` — **ghi lại mã PIN**.
   Nếu dự án tạo ở script.google.com, app tự tạo bảng tính **GoMay-GiuXe** trong Google Drive (có link trong nhật ký).
7. **Triển khai → Triển khai mới** → ⚙️ chọn **Ứng dụng web**: *Thực thi với tư cách*: **Tôi**; *Ai có quyền truy cập*:
   **Bất kỳ ai** → **Triển khai** → chép **URL kết thúc bằng `/exec`**.

> Đã dán 11 file riêng lẻ từ thư mục `gas/` cũng chạy được như nhau — không cần dán lại. Đừng dùng cả hai cách trong
> cùng một dự án (bị trùng tên hàm).

> Cập nhật mã về sau: dán lại `gas-bundle/GoMay-GiuXe.gs` → lưu → **Triển khai → Quản lý triển khai → ✏️ sửa →
> Phiên bản: Phiên bản mới → Triển khai** (URL `/exec` giữ nguyên).
> Sau khi cập nhật mã mới, chạy lại **`setup`** một lần (an toàn, không mất dữ liệu) để thêm cột mới nếu có.

### 1b. Đọc biển số + màu xe: điện thoại tự làm, MIỄN PHÍ

Không cần khóa API, không tốn tiền, chạy cả khi mất mạng. Điện thoại dùng 2 mô hình mã nguồn mở (giấy phép MIT):
[open-image-models](https://github.com/ankandrew/open-image-models) tìm biển số trong ảnh và
[fast-plate-ocr](https://github.com/ankandrew/fast-plate-ocr) đọc chữ (đọc được biển xe máy 2 dòng của Việt Nam),
chạy bằng [onnxruntime-web](https://github.com/microsoft/onnxruntime). Màu xe lấy từ vùng thân xe phía trên biển số.

- **Lần đầu** mở app, mỗi điện thoại tải bộ đọc khoảng **25 MB** (nên dùng Wi-Fi), sau đó giữ lại trong máy — cập
  nhật app không phải tải lại. Mỗi ảnh đọc mất khoảng 0,2–1 giây.
- Biển số đọc được hiện ngay trên máy (tìm xe bằng vài số cuối), rồi gửi kèm ảnh lên máy chủ để máy khác cùng thấy và
  để so sánh lúc trả xe. Xe gửi từ trước khi có bản này: app tự tải ảnh về đọc dần (2 xe mỗi lượt đồng bộ).
- **Không đếm mũ bảo hiểm** (chưa có mô hình mở đủ tin cậy) → không có cảnh báo "thiếu mũ". Màu xe chỉ cảnh báo khi
  chắc chắn (màu chiếm phần lớn thân xe); xe tối màu sát tường có thể không đủ chắc nên chỉ hiện, không cảnh báo.

**Muốn tắt hẳn AI trên mạng (Gemini):** Apps Script → **Cài đặt dự án → Thuộc tính tập lệnh** → xóa dòng
`VISION_API_KEY` (có thể xóa cả `VISION_MODEL_AUTO`, `VISION_PROVIDER`, `VISION_MODEL`). **Không** xóa
`PHOTO_FOLDER_ID`, `QR_SECRET`, `REV`, `SHEET_ID`.

<details><summary>(Không bắt buộc) Vẫn muốn AI trên mạng đếm mũ</summary>

Giữ `VISION_API_KEY` thì ảnh nào điện thoại **không** gửi kèm kết quả (máy quá cũ) sẽ được Gemini / Claude đọc như trước:

| Thuộc tính | Giá trị |
|---|---|
| `VISION_API_KEY` | Khóa API — mặc định **Google Gemini** (Google AI Studio; gói miễn phí giới hạn lượt/ngày) |
| `VISION_PROVIDER` | `gemini` (mặc định) hoặc `claude` (Claude Haiku 5.5, trả phí theo lượt) |
| `VISION_MODEL` | (nên bỏ trống) Gemini: app tự dùng bản *flash* mới nhất. Claude: mặc định `claude-haiku-5-5` |

Hàm **`docLaiAnhAI`** đọc lại ảnh 3 ngày gần nhất. Gói miễn phí của Gemini có thể dùng ảnh gửi lên để cải thiện dịch vụ.
</details>

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
Bảo mật (nên đọc): [`docs/bao-mat.md`](docs/bao-mat.md).

## Phát triển

```bash
npm install
npm test            # 155 unit test: logic phiếu, giá, đồng bộ, đọc biển số (chạy model thật nếu có ảnh mẫu), Apps Script giả lập
npm run test:e2e    # 36 test đầu-cuối trên Chromium với camera giả (2 máy, mất mạng, sao lưu ảnh)
npm run serve       # chạy thử tại http://localhost:5173
npm run build:gas   # sinh gas/Shared.js và file gộp gas-bundle/GoMay-GiuXe.gs (chạy sau khi sửa web/shared/ hoặc gas/)
node scripts/eval-vision.mjs   # đo độ chính xác AI trên ảnh thật (cần khóa API)
```

Cấu trúc: `web/` (trang PWA, không cần build) · `web/shared/` (logic dùng chung web + Apps Script + test) ·
`gas/` (Apps Script) · `tests/` (Vitest + Playwright).
