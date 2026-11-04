// Đọc biển số + màu xe NGAY TRÊN ĐIỆN THOẠI (miễn phí, chạy cả khi mất mạng) — thay cho AI Gemini.
// Dùng 2 model mã nguồn mở (giấy phép MIT) chạy bằng onnxruntime:
//   - Tìm biển số: open-image-models "yolo-v9-t-384-license-plate-end2end"  (web/models/plate-detector.onnx)
//   - Đọc chữ:     fast-plate-ocr "cct-xs-v2-global-model" (có huấn luyện biển Việt Nam) (web/models/plate-ocr.onnx)
// File này là logic THUẦN (không dùng API trình duyệt) — chép đúng các bước xử lý ảnh của thư viện Python gốc,
// để chạy được cả trên trình duyệt (web/js/plate-reader.js) lẫn trong test.
// Ảnh đầu vào luôn là { data: Uint8ClampedArray RGBA, width, height } (như ImageData của canvas).

export const DETECTOR_SIZE = 384;
export const DETECTOR_THRESHOLD = 0.4;
export const OCR_W = 128;
export const OCR_H = 64;
export const OCR_SLOTS = 10;
export const OCR_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_';
export const OCR_PAD = '_';
export const OCR_REGIONS = ['Albania', 'Andorra', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahrain',
  'Belarus', 'Belgium', 'Bosnia and Herzegovina', 'Brazil', 'Bulgaria', 'Cambodia', 'Canada', 'Croatia',
  'Cyprus', 'Czech Republic', 'Denmark', 'Estonia', 'Finland', 'France', 'Georgia', 'Germany',
  'Gibraltar', 'Greece', 'Guernsey', 'Hungary', 'Iceland', 'Indonesia', 'Ireland', 'Israel', 'Italy',
  'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malaysia', 'Malta', 'Mexico', 'Moldova',
  'Monaco', 'Montenegro', 'Netherlands', 'New Zealand', 'North Macedonia', 'Norway', 'Poland',
  'Portugal', 'Qatar', 'Romania', 'San Marino', 'Serbia', 'Singapore', 'Slovakia', 'Slovenia', 'Spain',
  'Sweden', 'Switzerland', 'Thailand', 'Turkey', 'United States', 'Ukraine', 'United Kingdom', 'Vietnam',
  'Unknown'];

/** Lấy mẫu song tuyến (bilinear) một kênh tại tọa độ thực (giống cv2.INTER_LINEAR, căn tâm điểm ảnh). */
function sample(img, x, y, c) {
  const { data, width: w, height: h } = img;
  const fx = Math.min(Math.max(x, 0), w - 1);
  const fy = Math.min(Math.max(y, 0), h - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const ax = fx - x0, ay = fy - y0;
  const p = (xx, yy) => data[(yy * w + xx) * 4 + c];
  return (p(x0, y0) * (1 - ax) + p(x1, y0) * ax) * (1 - ay) + (p(x0, y1) * (1 - ax) + p(x1, y1) * ax) * ay;
}

/**
 * Letterbox như YOLOv9 gốc: giữ tỉ lệ, co về `size`×`size`, phần thừa tô xám (114).
 * @returns {{ tensor: Float32Array (1×3×size×size, RGB, 0..1), ratio:number, dw:number, dh:number }}
 */
export function letterbox(img, size = DETECTOR_SIZE) {
  const r = Math.min(size / img.height, size / img.width);
  const nw = Math.round(img.width * r), nh = Math.round(img.height * r);
  const dw = (size - nw) / 2, dh = (size - nh) / 2;
  const left = Math.round(dw - 0.1), top = Math.round(dh - 0.1);
  const plane = size * size;
  const t = new Float32Array(3 * plane).fill(114 / 255);
  const sx = img.width / nw, sy = img.height / nh;
  for (let y = 0; y < nh; y++) {
    const srcY = (y + 0.5) * sy - 0.5;
    for (let x = 0; x < nw; x++) {
      const srcX = (x + 0.5) * sx - 0.5;
      const o = (y + top) * size + (x + left);
      t[o] = sample(img, srcX, srcY, 0) / 255;
      t[plane + o] = sample(img, srcX, srcY, 1) / 255;
      t[2 * plane + o] = sample(img, srcX, srcY, 2) / 255;
    }
  }
  return { tensor: t, ratio: r, dw, dh };
}

/**
 * Đầu ra YOLOv9 end2end: N dòng × 7 số [batch, x1, y1, x2, y2, lớp, điểm] (tọa độ trên ảnh letterbox).
 * @returns các khung biển số trên ẢNH GỐC, điểm cao nhất trước.
 */
export function parseDetections(out, ratio, dw, dh, width, height, threshold = DETECTOR_THRESHOLD) {
  const boxes = [];
  for (let i = 0; i + 7 <= out.length; i += 7) {
    const score = out[i + 6];
    if (!(score >= threshold)) continue;
    const x1 = Math.max(0, Math.round((out[i + 1] - dw) / ratio));
    const y1 = Math.max(0, Math.round((out[i + 2] - dh) / ratio));
    const x2 = Math.min(width, Math.round((out[i + 3] - dw) / ratio));
    const y2 = Math.min(height, Math.round((out[i + 4] - dh) / ratio));
    if (x2 - x1 >= 4 && y2 - y1 >= 4) boxes.push({ x1, y1, x2, y2, score });
  }
  return boxes.sort((a, b) => b.score - a.score);
}

/** Cắt vùng biển số và co về 128×64 (không giữ tỉ lệ, như cấu hình model) → Uint8Array NHWC RGB. */
export function cropForOcr(img, box, w = OCR_W, h = OCR_H) {
  const out = new Uint8Array(w * h * 3);
  const bw = box.x2 - box.x1, bh = box.y2 - box.y1;
  const sx = bw / w, sy = bh / h;
  for (let y = 0; y < h; y++) {
    const srcY = box.y1 + (y + 0.5) * sy - 0.5;
    for (let x = 0; x < w; x++) {
      const srcX = box.x1 + (x + 0.5) * sx - 0.5;
      const o = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) out[o + c] = Math.round(sample(img, srcX, srcY, c));
    }
  }
  return out;
}

/**
 * Giải mã đầu ra OCR: plate (10 ô × 37 ký tự, xác suất) + region (66 nước).
 * @returns {{ text:string, confidence:number, charProbs:number[], region:string, regionProb:number }}
 *   confidence = xác suất THẤP NHẤT trong các ký tự (khắt khe: một ký tự mờ là cả biển không chắc).
 */
export function decodeOcr(plate, region) {
  const n = OCR_ALPHABET.length;
  let text = '';
  const probs = [];
  for (let s = 0; s < OCR_SLOTS; s++) {
    let best = 0, bi = 0;
    for (let k = 0; k < n; k++) { const v = plate[s * n + k]; if (v > best) { best = v; bi = k; } }
    text += OCR_ALPHABET[bi];
    probs.push(best);
  }
  const trimmed = text.replace(/_+$/, '');
  const used = probs.slice(0, Math.max(1, trimmed.length));
  let ri = 0;
  if (region) for (let k = 1; k < region.length; k++) if (region[k] > region[ri]) ri = k;
  return {
    text: trimmed.replace(/_/g, ''),
    confidence: Math.min(...used),
    charProbs: probs,
    region: region ? OCR_REGIONS[ri] || 'Unknown' : '',
    regionProb: region ? region[ri] : 0,
  };
}

/**
 * "77C139997" → "77-C1 399.97" (xe máy); "51A12345" → "51A-123.45" (ô tô); không khớp mẫu thì giữ nguyên.
 */
export function formatVnPlate(raw) {
  const t = String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  // Phần số cuối là 5 số (mới) hoặc 4 số (cũ); ưu tiên 5 nếu phần đầu vẫn đúng mẫu "tỉnh + seri".
  for (const n of [5, 4]) {
    if (t.length <= n) continue;
    const head = /^(\d{2})([A-Z]{1,2})(\d?)$/.exec(t.slice(0, -n));
    if (!head) continue;
    const num = t.slice(-n);
    const tail = n === 5 ? `${num.slice(0, 3)}.${num.slice(3)}` : num;
    const [, prov, letters, sub] = head;
    return sub ? `${prov}-${letters}${sub} ${tail}` : `${prov}${letters}-${tail}`;
  }
  return t;
}

// ---------- Màu xe ----------

/** Một điểm ảnh RGB → nhóm màu của app (khớp COLOR_GROUPS trong vision.js). */
export function pixelColorGroup(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;
  if (v < 0.22) return 'đen';
  if (s < 0.2) return v > 0.78 ? 'trắng' : v < 0.4 ? 'đen' : 'xám/bạc';
  let hue;
  const d = max - min;
  if (max === r) hue = 60 * (((g - b) / d) % 6);
  else if (max === g) hue = 60 * ((b - r) / d + 2);
  else hue = 60 * ((r - g) / d + 4);
  if (hue < 0) hue += 360;
  if (hue < 15 || hue >= 340) return 'đỏ';
  if (hue < 40) return v < 0.55 ? 'nâu' : 'cam';
  if (hue < 70) return 'vàng';
  if (hue < 165) return 'xanh lá';
  if (hue < 260) return 'xanh dương';
  return 'hồng/tím';
}

/**
 * Vùng thân xe dùng để đoán màu: ngay PHÍA TRÊN biển số (chắn bùn / đèn hậu / đuôi xe), rộng ~2,4 lần biển.
 * Không thấy biển số thì lấy vùng giữa khung hình (nhân viên được hướng dẫn chĩa camera vào xe).
 */
export function colorRegion(img, plateBox) {
  if (plateBox) {
    const pw = plateBox.x2 - plateBox.x1, ph = plateBox.y2 - plateBox.y1;
    const cx = (plateBox.x1 + plateBox.x2) / 2;
    return {
      x1: Math.max(0, Math.round(cx - 1.2 * pw)), x2: Math.min(img.width, Math.round(cx + 1.2 * pw)),
      y1: Math.max(0, Math.round(plateBox.y1 - 2.6 * ph)), y2: Math.max(0, Math.round(plateBox.y1 - 0.15 * ph)),
    };
  }
  return { x1: Math.round(img.width * 0.3), x2: Math.round(img.width * 0.7), y1: Math.round(img.height * 0.25), y2: Math.round(img.height * 0.65) };
}

/**
 * Màu chính trong vùng: đếm nhóm màu từng điểm ảnh (lấy mẫu thưa), nhóm nhiều nhất thắng.
 * confidence = tỉ lệ điểm ảnh thuộc nhóm thắng (vùng lẫn nền tường / bóng râm → thấp → không dùng để cảnh báo).
 */
export function dominantColor(img, region) {
  const w = region.x2 - region.x1, h = region.y2 - region.y1;
  if (w < 4 || h < 4) return { color: 'không rõ', confidence: 0 };
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 4000)));
  const counts = {};
  let total = 0;
  for (let y = region.y1; y < region.y2; y += step) {
    for (let x = region.x1; x < region.x2; x += step) {
      const i = (y * img.width + x) * 4;
      const g = pixelColorGroup(img.data[i], img.data[i + 1], img.data[i + 2]);
      counts[g] = (counts[g] || 0) + 1;
      total++;
    }
  }
  let best = 'không rõ', n = 0;
  for (const [k, c] of Object.entries(counts)) if (c > n) { best = k; n = c; }
  return { color: total ? best : 'không rõ', confidence: total ? Math.round((n / total) * 100) / 100 : 0 };
}

/**
 * Cả quy trình trên một ảnh. `runDetector(tensor)` và `runOcr(uint8)` do nơi gọi cung cấp
 * (onnxruntime-web trên điện thoại, onnxruntime-node trong test).
 * @returns kết quả theo đúng khuôn của AI cũ (vision.js) — đưa qua parseVisionResponse để kiểm tra/chuẩn hóa.
 *   Không đếm được mũ bảo hiểm: confidence.helmets = 0 → app không bao giờ cảnh báo thiếu mũ.
 */
export async function analyzeImageData(img, { runDetector, runOcr }) {
  const lb = letterbox(img, DETECTOR_SIZE);
  const det = await runDetector(lb.tensor);
  const boxes = parseDetections(det, lb.ratio, lb.dw, lb.dh, img.width, img.height);
  let plate = '', plateConf = 0, region = '', box = null;
  if (boxes.length) {
    box = boxes[0];
    const { plate: p, region: rg } = await runOcr(cropForOcr(img, box));
    const ocr = decodeOcr(p, rg);
    region = ocr.region;
    plate = formatVnPlate(ocr.text);
    // Nhân thêm độ chắc chắn của bước tìm biển số; biển không phải mẫu Việt Nam thì hạ điểm
    plateConf = ocr.confidence * Math.min(1, box.score + 0.1) * (ocr.region === 'Vietnam' ? 1 : 0.8);
  }
  const col = dominantColor(img, colorRegion(img, box));
  return {
    plate, color: col.color, vehicleType: 'motorbike', helmetsOnVehicle: 0, helmetsWorn: 0, otherItems: [],
    confidence: { plate: Math.round(plateConf * 100) / 100, color: col.confidence, helmets: 0 },
    source: 'device', region, plateBox: box,
  };
}
