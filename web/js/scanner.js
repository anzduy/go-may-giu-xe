// Quét QR từ video: BarcodeDetector (Chrome Android) hoặc jsQR (Safari iOS).
// Cũng nhận sự kiện `gomay:scan` (detail = nội dung QR) — dùng cho kiểm thử tự động.

export function startScan(video, onText) {
  let stopped = false;
  let last = { text: '', at: 0 };
  const deliver = (text) => {
    const now = Date.now();
    if (!text || (text === last.text && now - last.at < 2000)) return;
    last = { text, at: now };
    onText(text);
  };
  const onEvent = (e) => deliver(String(e.detail || ''));
  document.addEventListener('gomay:scan', onEvent);

  let detector = null;
  if ('BarcodeDetector' in window) {
    try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { detector = null; }
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const tick = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2 && video.videoWidth) {
        if (detector) {
          const codes = await detector.detect(video);
          if (codes[0]) deliver(codes[0].rawValue);
        } else if (window.jsQR) {
          const scale = Math.min(1, 640 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code) deliver(code.data);
        }
      }
    } catch { /* bỏ qua khung hình lỗi */ }
    if (!stopped) setTimeout(tick, 150);
  };
  tick();
  return () => { stopped = true; document.removeEventListener('gomay:scan', onEvent); };
}
