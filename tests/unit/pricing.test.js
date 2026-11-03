import { describe, it, expect } from 'vitest';
import { DEFAULT_PRICES, priceFor, lostFee } from '../../web/shared/pricing.js';

describe('giá giữ xe', () => {
  it('giá mặc định', () => {
    expect(DEFAULT_PRICES).toMatchObject({ motorbike: 5000, ebike: 5000, bicycle: 5000, lostFee: 10000 });
    expect(priceFor([], 'motorbike', '2026-11-03T10:00:00Z')).toBe(5000);
    expect(priceFor([], 'bicycle', '2026-11-03T10:00:00Z')).toBe(5000);
  });
  it('lấy bảng giá mới nhất có hiệu lực trước giờ gửi', () => {
    const rules = [
      { effectiveFrom: '2026-11-01T00:00:00Z', motorbike: 5000, ebike: 5000, bicycle: 5000, lostFee: 10000 },
      { effectiveFrom: '2026-11-03T12:00:00Z', motorbike: 6000, ebike: 6000, bicycle: 4000, lostFee: 15000 },
    ];
    expect(priceFor(rules, 'motorbike', '2026-11-03T11:59:00Z')).toBe(5000);
    expect(priceFor(rules, 'motorbike', '2026-11-03T12:01:00Z')).toBe(6000);
    expect(lostFee(rules, '2026-11-03T13:00:00Z')).toBe(15000);
  });
  it('phí mất phiếu là tổng tiền, không cộng giá thường', () => {
    expect(lostFee([], '2026-11-03T10:00:00Z')).toBe(10000);
  });
});
