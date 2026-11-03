# Thư viện nhúng sẵn (vendor)

Chép nguyên bản từ npm, không sửa:

| File | Gói | Phiên bản | Nguồn |
|---|---|---|---|
| `jsQR.js` | jsqr | 1.4.0 | https://www.npmjs.com/package/jsqr (`dist/jsQR.js`) — quét QR trên Safari iOS |
| `qrcode-generator.js` | qrcode-generator | 1.4.4 | https://www.npmjs.com/package/qrcode-generator (`qrcode.js`) — tạo QR khi in phiếu |
| `idb.js` | idb | 8.0.0 | https://www.npmjs.com/package/idb (`build/index.js`, ESM) — bọc IndexedDB |

`jsQR.js` và `qrcode-generator.js` nạp bằng thẻ `<script>` thường (tạo biến toàn cục `jsQR`, `qrcode`).
`idb.js` nạp bằng `import`.
