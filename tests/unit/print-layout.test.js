import { describe, it, expect } from 'vitest';
import { paginate } from '../../web/js/print-layout.js';

const tickets = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({ no: from + i }));

describe('chia trang in phiếu', () => {
  it('200 phiếu → 9 trang, trang cuối 8 phiếu', () => {
    const pages = paginate(tickets(1, 200), 24);
    expect(pages).toHaveLength(9);
    expect(pages[8]).toHaveLength(8);
  });
  it('mỗi trang là số liên tiếp', () => {
    const pages = paginate(tickets(1, 200), 24);
    expect(pages[0].map((t) => t.no)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(pages[1][0].no).toBe(25);
  });
  it('tạo thêm 50 phiếu sau 200 bắt đầu từ 201', () => {
    const more = paginate(tickets(201, 250), 24);
    expect(more[0][0].no).toBe(201);
    expect(more.flat()).toHaveLength(50);
  });
});
