import { describe, it, expect } from 'vitest';
import { parseVisionResponse, normalizeColor, summarizeAnalysis, applyInAnalysis, VISION_SCHEMA, visionPrompt } from '../../web/shared/vision.js';

const good = {
  plate: '59X1-123.45', color: 'Đỏ', vehicleType: 'motorbike', helmetsOnVehicle: 2, helmetsWorn: 0,
  otherItems: ['áo mưa'], confidence: { plate: 0.92, color: 0.95, helmets: 0.85 },
};

describe('đọc kết quả AI phân tích ảnh', () => {
  it('JSON hợp lệ → chuẩn hóa', () => {
    const r = parseVisionResponse(JSON.stringify(good));
    expect(r.ok).toBe(true);
    expect(r.analysis).toMatchObject({ plate: '59X1-123.45', color: 'đỏ', helmetsOnVehicle: 2, helmetsWorn: 0, status: 'done' });
  });
  it('chấp nhận JSON bọc trong ```json ... ```', () => {
    expect(parseVisionResponse('```json\n' + JSON.stringify(good) + '\n```').ok).toBe(true);
  });
  it('không phải JSON → lỗi', () => {
    expect(parseVisionResponse('xin lỗi, tôi không thấy').ok).toBe(false);
  });
  it('kẹp số mũ 0–6, độ chắc chắn 0–1, bỏ biển số vô nghĩa', () => {
    const r = parseVisionResponse(JSON.stringify({ ...good, plate: 'ABC', helmetsOnVehicle: 40, helmetsWorn: -2, confidence: { plate: 3, color: -1, helmets: 'x' } }));
    expect(r.analysis).toMatchObject({ plate: '', helmetsOnVehicle: 6, helmetsWorn: 0, confidence: { plate: 0, color: 0, helmets: 0 } }); // biển số vô nghĩa → độ chắc chắn biển số = 0
  });
  it('không trường nào đủ chắc chắn → unclear', () => {
    const r = parseVisionResponse(JSON.stringify({ ...good, confidence: { plate: 0.2, color: 0.3, helmets: 0.1 } }));
    expect(r.analysis.status).toBe('unclear');
  });
  it('schema gửi cho AI không cho thêm trường lạ', () => {
    expect(VISION_SCHEMA.additionalProperties).toBe(false);
    expect(visionPrompt()).toContain('biển số');
  });
});

describe('nhóm màu', () => {
  it.each([['bạc', 'xám/bạc'], ['Xám', 'xám/bạc'], ['xanh dương', 'xanh dương'], ['blue', 'xanh dương'], ['xanh lá', 'xanh lá'],
    ['tím', 'hồng/tím'], ['ĐEN', 'đen'], ['cầu vồng', 'không rõ']])('%s → %s', (a, b) => expect(normalizeColor(a)).toBe(b));
});

describe('tóm tắt và áp vào lượt gửi', () => {
  const a = parseVisionResponse(JSON.stringify(good)).analysis;
  it('tóm tắt "Xe máy màu đỏ · 2 mũ"', () => expect(summarizeAnalysis(a, 'motorbike')).toBe('Xe máy màu đỏ · 2 mũ'));
  it('chỉ nói phần đủ chắc chắn', () => {
    const b = { ...a, confidence: { plate: 0.9, color: 0.2, helmets: 0.9 } };
    expect(summarizeAnalysis(b, 'motorbike')).toBe('Xe máy · 2 mũ');
  });
  it('gắn biển số + tóm tắt vào lượt gửi', () => {
    const s = applyInAnalysis({ id: 's', plate: '', plateStatus: 'pending', vehicleType: 'motorbike' }, a);
    expect(s).toMatchObject({ plate: '59X1-123.45', plateStatus: 'read', inSummary: 'Xe máy màu đỏ · 2 mũ' });
  });
  it('không đọc được biển → unreadable, không báo lỗi', () => {
    const s = applyInAnalysis({ id: 's', plate: '', plateStatus: 'pending', vehicleType: 'bicycle' }, { ...a, plate: '' });
    expect(s.plateStatus).toBe('unreadable');
  });
  it('không ghi đè biển số nhân viên đã sửa tay', () => {
    const s = applyInAnalysis({ id: 's', plate: '59X1-999.99', plateStatus: 'manual', vehicleType: 'motorbike' }, a);
    expect(s).toMatchObject({ plate: '59X1-999.99', plateStatus: 'manual' });
  });
});

import { chooseGeminiModel } from '../../web/shared/vision.js';
describe('tự chọn model Gemini khi model cũ bị khai tử', () => {
  const gen = ['generateContent', 'countTokens'];
  it('chọn bản flash chính thức mới nhất, bỏ preview / lite / tts / embedding', () => {
    const list = [
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: gen },
      { name: 'models/gemini-3.0-flash', supportedGenerationMethods: gen },
      { name: 'models/gemini-3.0-flash-lite', supportedGenerationMethods: gen },
      { name: 'models/gemini-3.5-flash-preview-10-2026', supportedGenerationMethods: gen },
      { name: 'models/gemini-3.0-flash-preview-tts', supportedGenerationMethods: gen },
      { name: 'models/gemini-3.0-pro', supportedGenerationMethods: gen },
      { name: 'models/text-embedding-005', supportedGenerationMethods: ['embedContent'] },
    ];
    expect(chooseGeminiModel(list)).toBe('gemini-3.0-flash');
  });
  it('chỉ có bản preview thì vẫn dùng được', () => {
    expect(chooseGeminiModel([{ name: 'models/gemini-4.0-flash-preview', supportedGenerationMethods: gen }])).toBe('gemini-4.0-flash-preview');
  });
  it('so số phiên bản đúng (3.10 > 3.9)', () => {
    expect(chooseGeminiModel([{ name: 'models/gemini-3.9-flash', supportedGenerationMethods: gen }, { name: 'models/gemini-3.10-flash', supportedGenerationMethods: gen }])).toBe('gemini-3.10-flash');
  });
  it('không có model phù hợp → chuỗi rỗng', () => {
    expect(chooseGeminiModel([{ name: 'models/gemini-3.0-pro', supportedGenerationMethods: gen }])).toBe('');
    expect(chooseGeminiModel(undefined)).toBe('');
  });
});
