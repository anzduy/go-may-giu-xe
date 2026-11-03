import { describe, it, expect } from 'vitest';
import { compareAnalyses, compareNote, plateDistance } from '../../web/shared/compare.js';

const A = (over = {}) => ({ plate: '59X1-123.45', color: 'đỏ', vehicleType: 'motorbike', helmetsOnVehicle: 2, helmetsWorn: 0, otherItems: [],
  confidence: { plate: 0.9, color: 0.9, helmets: 0.9 }, status: 'done', ...over });

describe('so sánh ảnh lúc vào và lúc ra', () => {
  it('cùng xe, không đổi gì → không cảnh báo', () => {
    expect(compareAnalyses(A(), A(), 0.7, 37)).toEqual([]);
  });
  it('khác màu xe (cả hai đủ chắc chắn) → cảnh báo CAO', () => {
    const r = compareAnalyses(A(), A({ color: 'xanh dương', plate: '' , confidence: { plate: 0, color: 0.9, helmets: 0.9 } }), 0.7, 37);
    expect(r).toEqual([{ kind: 'color_mismatch', level: 'high', message: 'Phiếu 037: có thể giao nhầm xe (đỏ → xanh dương)', inValue: 'đỏ', outValue: 'xanh dương' }]);
  });
  it('khác biển số hơn 1 ký tự → cảnh báo CAO; lệch 1 ký tự (AI đọc sai) → bỏ qua', () => {
    expect(compareAnalyses(A(), A({ plate: '59X1-678.90' }), 0.7, 37).map((x) => x.kind)).toEqual(['plate_mismatch']);
    expect(compareAnalyses(A(), A({ plate: '59X1-123.46' }), 0.7, 37)).toEqual([]);
  });
  it('lúc ra ít mũ hơn lúc vào → cảnh báo TRUNG BÌNH', () => {
    const r = compareAnalyses(A(), A({ helmetsOnVehicle: 1 }), 0.7, 37);
    expect(r).toEqual([{ kind: 'helmet_missing', level: 'medium', message: 'Phiếu 037: lúc vào 2 mũ, lúc ra 1 mũ', inValue: '2', outValue: '1' }]);
  });
  it('lúc vào 1 mũ treo xe, lúc ra khách đội mũ đó → KHÔNG cảnh báo', () => {
    expect(compareAnalyses(A({ helmetsOnVehicle: 1 }), A({ helmetsOnVehicle: 0, helmetsWorn: 1 }), 0.7, 37)).toEqual([]);
  });
  it('lúc ra nhiều mũ hơn → không cảnh báo', () => {
    expect(compareAnalyses(A({ helmetsOnVehicle: 1 }), A({ helmetsOnVehicle: 1, helmetsWorn: 2 }), 0.7, 37)).toEqual([]);
  });
  it('AI không đủ chắc chắn → không cảnh báo, ghi "không đủ rõ để so sánh"', () => {
    const dim = A({ color: 'xanh dương', helmetsOnVehicle: 0, plate: '30A-999.99', confidence: { plate: 0.5, color: 0.5, helmets: 0.4 } });
    expect(compareAnalyses(A(), dim, 0.7, 37)).toEqual([]);
    expect(compareNote(A(), dim, 0.7)).toBe('không đủ rõ để so sánh');
    expect(compareNote(A(), A(), 0.7)).toBe('');
  });
  it('màu "không rõ" không bao giờ tính là khác màu', () => {
    expect(compareAnalyses(A(), A({ color: 'không rõ' }), 0.7, 37)).toEqual([]);
  });
  it('độ nhạy cao hơn (ngưỡng 0.95) → ít cảnh báo hơn', () => {
    expect(compareAnalyses(A(), A({ helmetsOnVehicle: 1 }), 0.95, 37)).toEqual([]);
  });
  it('nhiều khác biệt cùng lúc → nhiều cảnh báo, cao trước', () => {
    const r = compareAnalyses(A(), A({ color: 'đen', helmetsOnVehicle: 0, plate: '' }), 0.7, 5);
    expect(r.map((x) => x.kind)).toEqual(['color_mismatch', 'helmet_missing']);
  });
  it('khoảng cách biển số (bỏ dấu, viết hoa)', () => {
    expect(plateDistance('59X1-123.45', '59x1 12345')).toBe(0);
    expect(plateDistance('59X112345', '59X112346')).toBe(1);
  });
});
