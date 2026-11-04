// Đọc biển số + màu xe TRÊN ĐIỆN THOẠI bằng onnxruntime-web (WebAssembly) — miễn phí, chạy cả khi mất mạng.
// Logic xử lý ảnh ở web/shared/plate-core.js. Model + thư viện (~25 MB) chỉ tải MỘT LẦN rồi Service Worker giữ lại.
import { analyzeImageData } from '../shared/plate-core.js';
import { parseVisionResponse } from '../shared/vision.js';

const BASE = new URL('../', import.meta.url); // thư mục web/
let loading = null;
let queue = Promise.resolve();

/** Máy có chạy được không (cần WebAssembly). */
export function supported() {
  return typeof WebAssembly === 'object' && typeof createImageBitmap === 'function';
}

async function load() {
  if (!loading) {
    loading = (async () => {
      const ort = await import(new URL('vendor/ort/ort.wasm.bundle.min.mjs', BASE).href);
      ort.env.wasm.wasmPaths = new URL('vendor/ort/', BASE).href;
      ort.env.wasm.numThreads = 1; // GitHub Pages không bật cross-origin isolation → chạy 1 luồng
      ort.env.wasm.proxy = false;
      const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
      const [det, ocr] = await Promise.all([
        ort.InferenceSession.create(new URL('models/plate-detector.onnx', BASE).href, opts),
        ort.InferenceSession.create(new URL('models/plate-ocr.onnx', BASE).href, opts),
      ]);
      return {
        runDetector: async (t) => (await det.run({ images: new ort.Tensor('float32', t, [1, 3, 384, 384]) })).output0.data,
        runOcr: async (u8) => {
          const r = await ocr.run({ input: new ort.Tensor('uint8', u8, [1, 64, 128, 3]) });
          return { plate: r.plate.data, region: r.region.data };
        },
      };
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}

/** Tải sẵn model (gọi lúc rảnh sau khi đăng nhập) để lần đọc đầu không phải chờ. */
export function warmUp() {
  if (supported() && !window.__gomayAnalyzer) load().catch(() => {});
}

async function blobToImageData(blob, maxSide = 1280) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  return g.getImageData(0, 0, w, h);
}

/**
 * Phân tích một ảnh JPEG → kết quả cùng khuôn với AI cũ ({ plate, color, confidence, status, … }) hoặc null nếu lỗi.
 * Chạy lần lượt từng ảnh (không chạy song song cho đỡ nóng máy).
 */
export function analyzeBlob(blob) {
  const job = queue.then(async () => {
    if (window.__gomayAnalyzer) return window.__gomayAnalyzer(blob); // dùng cho kiểm thử tự động
    if (!supported() || !blob) return null;
    const runners = await load();
    const img = await blobToImageData(blob);
    const raw = await analyzeImageData(img, runners);
    const parsed = parseVisionResponse(JSON.stringify(raw));
    return parsed.ok ? { ...parsed.analysis, source: 'device', region: raw.region } : null;
  }).catch((e) => { console.warn('Đọc biển số lỗi', e); return null; });
  queue = job;
  return job;
}
