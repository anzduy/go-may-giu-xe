# Mô hình đọc biển số (chạy trên điện thoại)

| File | Nguồn | Giấy phép |
|---|---|---|
| `plate-detector.onnx` | [open-image-models](https://github.com/ankandrew/open-image-models) — `yolo-v9-t-384-license-plate-end2end` | MIT (`LICENSE-open-image-models.txt`) |
| `plate-ocr.onnx`, `plate-ocr-config.yaml` | [fast-plate-ocr](https://github.com/ankandrew/fast-plate-ocr) — `cct-xs-v2-global-model` | MIT (`LICENSE-fast-plate-ocr.txt`) |

Thư viện chạy model: `web/vendor/ort/` — [onnxruntime-web](https://github.com/microsoft/onnxruntime) 1.30.0 (MIT).

Không tải sẵn lúc cài app; Service Worker giữ trong bộ nhớ đệm riêng `gomay-models-v1` (xem `web/sw.js`).
Đổi model → tăng số phiên bản đó. Cách dùng model: `web/shared/plate-core.js`.
