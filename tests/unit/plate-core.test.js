import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  letterbox, parseDetections, cropForOcr, decodeOcr, formatVnPlate, pixelColorGroup, dominantColor, colorRegion,
  analyzeImageData, OCR_ALPHABET, OCR_SLOTS, OCR_REGIONS,
} from '../../web/shared/plate-core.js';
import { parseVisionResponse } from '../../web/shared/vision.js';

const solid = (w, h, [r, g, b]) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([r, g, b, 255], i * 4);
  return { data, width: w, height: h };
};

describe('các bước xử lý ảnh (chép từ thư viện Python gốc)', () => {
  it('letterbox: giữ tỉ lệ, phần thừa tô xám 114, RGB 0..1', () => {
    const img = solid(200, 100, [255, 0, 0]);
    const { tensor, ratio, dw, dh } = letterbox(img, 384);
    expect(ratio).toBeCloseTo(1.92);
    expect(dw).toBe(0);
    expect(dh).toBe(96);
    const plane = 384 * 384;
    expect(tensor[0]).toBeCloseTo(114 / 255); // góc trên = viền xám
    const mid = 192 * 384 + 192;
    expect([tensor[mid], tensor[plane + mid], tensor[2 * plane + mid]]).toEqual([1, 0, 0]);
  });
  it('parseDetections: đổi tọa độ về ảnh gốc, bỏ điểm thấp, cao nhất trước', () => {
    const out = new Float32Array([0, 10, 106, 50, 146, 0, 0.3, 0, 100, 136, 200, 186, 0, 0.9]);
    const boxes = parseDetections(out, 1.92, 0, 96, 200, 100);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ x1: 52, y1: 21, x2: 104, y2: 47 });
  });
  it('cropForOcr: 128×64×3', () => {
    expect(cropForOcr(solid(300, 200, [10, 20, 30]), { x1: 10, y1: 10, x2: 110, y2: 60 })).toHaveLength(128 * 64 * 3);
  });
  it('decodeOcr: lấy ký tự xác suất cao nhất, bỏ ký tự đệm, độ chắc chắn = ký tự thấp nhất', () => {
    const n = OCR_ALPHABET.length;
    const plate = new Float32Array(OCR_SLOTS * n);
    const want = '77C139997_';
    [...want].forEach((ch, s) => { plate[s * n + OCR_ALPHABET.indexOf(ch)] = s === 3 ? 0.6 : 0.99; });
    const region = new Float32Array(OCR_REGIONS.length);
    region[OCR_REGIONS.indexOf('Vietnam')] = 0.97;
    const d = decodeOcr(plate, region);
    expect(d).toMatchObject({ text: '77C139997', region: 'Vietnam' });
    expect(d.confidence).toBeCloseTo(0.6);
  });
  it('formatVnPlate: biển xe máy / ô tô Việt Nam', () => {
    expect(formatVnPlate('77C139997')).toBe('77-C1 399.97');
    expect(formatVnPlate('59X212345')).toBe('59-X2 123.45');
    expect(formatVnPlate('51A12345')).toBe('51A-123.45');
    expect(formatVnPlate('30E1234')).toBe('30E-1234');
    expect(formatVnPlate('ABC')).toBe('ABC');
  });
  it('nhóm màu từng điểm ảnh', () => {
    expect(pixelColorGroup(20, 20, 20)).toBe('đen');
    expect(pixelColorGroup(240, 240, 240)).toBe('trắng');
    expect(pixelColorGroup(150, 150, 155)).toBe('xám/bạc');
    expect(pixelColorGroup(200, 30, 30)).toBe('đỏ');
    expect(pixelColorGroup(30, 60, 200)).toBe('xanh dương');
    expect(pixelColorGroup(40, 160, 60)).toBe('xanh lá');
    expect(pixelColorGroup(230, 210, 40)).toBe('vàng');
  });
  it('màu chính + độ chắc chắn theo tỉ lệ điểm ảnh', () => {
    const img = solid(100, 100, [200, 30, 30]);
    expect(dominantColor(img, { x1: 0, y1: 0, x2: 100, y2: 100 })).toEqual({ color: 'đỏ', confidence: 1 });
    expect(colorRegion(img, { x1: 40, y1: 60, x2: 60, y2: 70 })).toMatchObject({ y2: 59 });
  });
});

// ---------- Ảnh xe thật ở bãi (không đưa lên GitHub vì có biển số khách; chỉ chạy khi có ảnh trên máy) ----------
const realPhotos = ['bike_p005', 'bike_p003'].filter((n) => fs.existsSync(`tests/fixtures/vision/anh/${n}.rgba`));

describe.skipIf(!realPhotos.length)('ảnh xe thật — chạy model bằng onnxruntime-node', async () => {
  const ort = await import('onnxruntime-node');
  const det = await ort.InferenceSession.create('web/models/plate-detector.onnx');
  const ocr = await ort.InferenceSession.create('web/models/plate-ocr.onnx');
  const runners = {
    runDetector: async (t) => (await det.run({ images: new ort.Tensor('float32', t, [1, 3, 384, 384]) })).output0.data,
    runOcr: async (u8) => { const r = await ocr.run({ input: new ort.Tensor('uint8', u8, [1, 64, 128, 3]) }); return { plate: r.plate.data, region: r.region.data }; },
  };
  for (const n of realPhotos) {
    it(`${n}: đọc đúng biển 77-C1 399.97 (giống bản Python gốc), màu đen`, async () => {
      const meta = JSON.parse(fs.readFileSync(`tests/fixtures/vision/anh/${n}.json`, 'utf8'));
      const img = { data: new Uint8ClampedArray(fs.readFileSync(`tests/fixtures/vision/anh/${n}.rgba`)), width: meta.width, height: meta.height };
      const t0 = Date.now();
      const a = await analyzeImageData(img, runners);
      console.log(n, a.plate, a.confidence, a.color, a.region, `${Date.now() - t0}ms`);
      expect(a.plate).toBe('77-C1 399.97');
      expect(a.region).toBe('Vietnam');
      expect(a.confidence.plate).toBeGreaterThan(0.8);
      expect(a.color).toBe('đen');
      const parsed = parseVisionResponse(JSON.stringify(a));
      expect(parsed.analysis).toMatchObject({ plate: '77-C1 399.97', status: 'done' });
    });
  }
});
