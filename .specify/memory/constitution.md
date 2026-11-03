<!--
Sync Impact Report
- Version change: (template) → 1.0.0 → 1.1.0 → 1.2.0 → 1.3.0
- Modified principles: n/a (initial adoption)
- Added sections: Core Principles I–V, Ràng buộc vận hành, Quy trình phát triển, Governance
- Removed sections: none
- 1.1.0: Ràng buộc vận hành cho phép máy in nhiệt Bluetooth (chủ sân chọn vé giấy in ra)
- 1.2.0: Bỏ máy in Bluetooth; dùng phiếu QR in sẵn mỗi ngày. Nguyên tắc III đối chiếu bằng ảnh xe
  thay cho biển số.
- 1.3.0: Nguyên tắc II thêm "lưu máy trước, đẩy cloud sau, không chờ xử lý nền"; Nguyên tắc III
  thêm ảnh xe lúc ra.
- Follow-up TODOs: none
-->

# Gò Mây Arena – App Giữ Xe Constitution

## Core Principles

### I. Nhanh tại cổng (Gate-Speed First)

- Thao tác gửi xe và trả xe cho một lượt khách bình thường MUST hoàn tất trong tối đa 3 lần chạm
  và dưới 10 giây.
- Màn hình chính MUST là màn hình gửi/trả xe; mọi chức năng khác (báo cáo, cài đặt) nằm sau.
- Mọi tính năng mới MUST KHÔNG làm chậm luồng gửi/trả xe.

**Lý do**: Giờ cao điểm (trước/sau trận, tối và Chủ nhật Kul Tournament) có hàng chục xe vào ra
cùng lúc; chậm ở cổng là kẹt xe và mất khách.

### II. Chạy được khi mạng yếu (Offline-First)

- App MUST cho phép gửi xe, trả xe và tra cứu xe trong bãi khi mất mạng hoàn toàn.
- Dữ liệu ghi khi offline MUST được lưu bền trên thiết bị và tự đồng bộ khi có mạng lại,
  không mất lượt nào.
- Lưu trên máy trước, đẩy lên cloud sau: thao tác ở cổng MUST KHÔNG chờ tải ảnh, đọc biển số hay bất
  kỳ xử lý nền nào. Bản trên cloud là bản sao lưu chính khi dữ liệu trên máy bị xóa hoặc mất máy.

**Lý do**: Sóng di động ở bãi xe sân bóng không ổn định; nhân viên không thể dừng làm việc vì mạng.

### III. Không mất xe, không nhầm xe (Ticket Integrity — NON-NEGOTIABLE)

- Mỗi lượt gửi MUST có một mã vé duy nhất, chưa từng dùng cho xe khác đang trong bãi.
- Mỗi lượt gửi MUST có ảnh chụp xe lúc vào; trả xe MUST hiện ảnh đó để nhân viên đối chiếu và MUST
  lưu ảnh xe lúc ra làm bằng chứng khi có khiếu nại mất đồ.
- Trường hợp mất vé MUST đi qua quy trình riêng có ghi lại lý do và người xử lý.

**Lý do**: Mất xe hoặc giao nhầm xe là thiệt hại tiền bạc và uy tín lớn nhất của bãi giữ xe.

### IV. Minh bạch tiền (Cash Transparency)

- Mọi khoản thu MUST được ghi lại gắn với lượt gửi, nhân viên và thời gian.
- Lượt gửi đã ghi MUST KHÔNG bị xóa; chỉ được hủy/điều chỉnh kèm lý do và lưu vết.
- Cuối ca MUST có báo cáo chốt ca: số lượt, tổng tiền dự kiến, xe còn tồn.

**Lý do**: Chủ sân không có mặt thường xuyên (còn công việc kiến trúc/giám sát công trình) nên
cần số liệu tin được để đối chiếu với tiền mặt nhân viên nộp.

### V. Đơn giản trước (Simplicity / YAGNI)

- Giao diện MUST dùng tiếng Việt, chữ to, nút to, dùng được bằng một tay ngoài trời.
- Nhân viên mới MUST dùng được sau tối đa 5 phút hướng dẫn.
- Chỉ xây tính năng có nhu cầu thật ở Gò Mây Arena; tính năng "để sau này" MUST bị loại khỏi v1.

**Lý do**: Người giữ xe thường không rành công nghệ; app phức tạp sẽ bị bỏ để quay lại ghi sổ tay.

## Ràng buộc vận hành

- Thiết bị chính: điện thoại Android/iPhone phổ thông của nhân viên (có camera). Không cần phần
  cứng đặc biệt ở cổng; phiếu QR được in sẵn mỗi ngày bằng máy in văn phòng có sẵn của chủ sân.
- Chi phí vận hành hàng tháng SHOULD ở mức 0 đồng hoặc rất thấp (dùng dịch vụ miễn phí khi có thể).
- Dữ liệu lượt gửi xe MUST được giữ tối thiểu 90 ngày để đối chiếu khiếu nại.
- Chỉ chủ sân (quản lý) được xem báo cáo doanh thu tổng và chỉnh cài đặt giá vé.

## Quy trình phát triển

- Đi theo quy trình Spec Kit: constitution → specify → (clarify) → plan → tasks → implement.
- Luồng gửi/trả xe và đồng bộ offline MUST có kiểm thử tự động trước khi phát hành.
- Mỗi bản phát hành MUST được chạy thử thực tế tại bãi (ít nhất 1 buổi tối) trước khi dùng chính
  thức.

## Governance

- Constitution này có hiệu lực cao hơn mọi quy ước khác của dự án; spec, plan và tasks MUST tuân thủ.
- Sửa đổi MUST được ghi lại trong file này kèm lý do, và được chủ sân (Duy) duyệt.
- Phiên bản theo semantic versioning: MAJOR khi bỏ/định nghĩa lại nguyên tắc, MINOR khi thêm
  nguyên tắc/mục, PATCH khi sửa câu chữ.
- Bước `/speckit-plan` và `/speckit-analyze` MUST kiểm tra tuân thủ constitution; vi phạm phải
  được giải trình trong mục Complexity Tracking.

**Version**: 1.3.0 | **Ratified**: 2026-11-03 | **Last Amended**: 2026-11-03
