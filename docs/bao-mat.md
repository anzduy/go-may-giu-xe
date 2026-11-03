# Bảo mật — App Giữ Xe Gò Mây Arena

Kết quả rà soát (tasks.md T079, 2026-11-03). Các điểm có ✅ đều có test tự động trong `tests/unit/gas-smoke.test.js`.

## Đã có

| Điểm | Cách làm |
|---|---|
| ✅ Phân quyền | 11 lệnh chỉ quản lý (tạo/in phiếu, báo cáo, giá, nhân viên, cảnh báo, độ nhạy, sửa kết quả AI, đăng xuất từ xa) đều từ chối token nhân viên. Hủy lượt chỉ quản lý. Máy chủ kiểm tra, không chỉ ẩn nút trên app. |
| ✅ Mã PIN | Không lưu PIN gốc — chỉ lưu `pinHash` (SHA-256 kèm mã nhân viên). |
| ✅ Đoán PIN | Sai 5 lần → khóa đăng nhập tên đó 15 phút. |
| ✅ Mất điện thoại / nghỉ việc | Quản lý → Nhân viên → **Đăng xuất máy** (thu hồi mọi token ngay), hoặc **Khóa** (tự đăng xuất mọi máy). Đổi PIN cũng đăng xuất các máy cũ. |
| ✅ Khóa AI (`VISION_API_KEY`) | Chỉ nằm trong Script Properties của Apps Script; không bao giờ gửi về điện thoại, không có trong mã nguồn. |
| ✅ Mã bí mật phiếu (`QR_SECRET`) | Nằm trong Script Properties; chỉ gửi cho máy **sau khi đăng nhập** (để kiểm tra phiếu cả khi mất mạng). Không có trong dữ liệu đồng bộ. |
| ✅ Không xóa dữ liệu | Không có lệnh xóa lượt gửi; hủy lượt phải ghi lý do; mọi thao tác ghi vào trang tính `Audit` (chỉ thêm). |
| ✅ Chèn mã độc vào giao diện | Mọi chữ (ghi chú, tên, biển số) hiển thị dạng văn bản thuần; chỉ hình QR (thư viện tự vẽ) dùng HTML. |
| ✅ Ảnh khách hàng | Ảnh nằm trong Google Drive của chủ sân; bộ ảnh đo AI (`tests/fixtures/vision/anh/`) không đưa lên GitHub. |

## Chủ sân cần biết

- **Ai giữ file Google Sheets/Drive là giữ toàn bộ dữ liệu.** Không chia sẻ file `GoMay-GiuXe` cho người khác (nhân viên không cần quyền vào file — họ dùng app).
- **URL `/exec`** ai cũng gọi được, nhưng không có token đăng nhập thì chỉ thử đăng nhập được (và bị khóa sau 5 lần sai).
- **PIN 4–6 số** đủ cho app nội bộ, nhưng nếu ai lấy được trang tính `Staff` thì có thể dò ra PIN — vì vậy giữ file Sheets riêng tư.
- **Gemini gói miễn phí** có thể dùng ảnh gửi lên để cải thiện dịch vụ (ảnh xe trong bãi). Không muốn vậy thì dùng gói trả phí hoặc `VISION_PROVIDER = claude`.
- Mỗi lần đổi nhân viên trực: nhân viên **Thoát** cuối ca; máy dùng chung thì không lưu mật khẩu trình duyệt.
