import { describe, it, expect } from 'vitest';
import { summarize, dayRange, reportRows } from '../../web/shared/report.js';

const day = '20261103';
const [from, to] = dayRange(day);
const t = (h, m = 0) => new Date(Date.UTC(2026, 10, 3, h - 7, m)).toISOString(); // giờ VN
const base = (i, extra) => ({ id: `s${i}`, ticketDate: day, ticketNo: i, vehicleType: 'motorbike', priceAtIn: 5000, inAt: t(17, i), inStaffId: 'a', ...extra });

const sessions = [
  ...Array.from({ length: 9 }, (_, i) => base(i + 1, { status: 'returned', outAt: t(19, i), outStaffId: 'b', fee: 5000 })),
  base(10, { status: 'lost', outAt: t(20), outStaffId: 'b', fee: 10000, note: 'mất phiếu' }),
  base(11, { status: 'in_lot', vehicleType: 'bicycle' }),
  base(13, { status: 'in_lot', conflict: 'duplicate_ticket' }),
  base(14, { status: 'cancelled' }),
  { id: 'old', ticketDate: '20261102', ticketNo: 50, status: 'in_lot', inAt: '2026-11-02T12:00:00.000Z', vehicleType: 'ebike', priceAtIn: 5000 },
  { id: 'pv', ticketDate: day, ticketNo: 20, status: 'provisional', outAt: t(21), outStaffId: 'b', note: 'x', fee: null },
];
const batches = [{ date: day, fromNo: 1, toNo: 200 }];
const alerts = [{ createdAt: t(19), status: 'new' }, { createdAt: t(19, 5), status: 'resolved' }];

describe('báo cáo / chốt ca', () => {
  it('ngày VN: 00:00–23:59 giờ Việt Nam', () => {
    expect(from).toBe('2026-11-02T17:00:00.000Z');
    expect(to).toBe('2026-11-03T16:59:59.999Z');
  });
  it('9 lượt × 5.000đ + 1 mất phiếu × 10.000đ = 55.000đ', () => {
    const r = summarize({ sessions, batches, alerts, from, to });
    expect(r).toMatchObject({ count: 10, revenue: 55000, lost: 1, provisional: 1, conflicts: 1, alerts: 2, alertsOpen: 1 });
    expect(r.byType.motorbike).toEqual({ count: 10, revenue: 55000 });
  });
  it('xe còn trong bãi và tồn qua đêm', () => {
    const r = summarize({ sessions, batches, from, to });
    expect(r.inLot).toBe(3);
    expect(r.overnight).toBe(1);
  });
  it('phiếu đã in / đã dùng / bị bỏ qua', () => {
    const r = summarize({ sessions, batches, from, to });
    expect(r.ticketsPrinted).toBe(200);
    expect(r.ticketsUsed).toBe(13); // 1–11, 13, 20 (lượt đã hủy không tính)
    expect(r.skipped).toEqual([12, 14, 15, 16, 17, 18, 19]);
  });
  it('lọc theo nhân viên: tiền tính cho người trả xe, lượt gửi tính cho người nhận', () => {
    expect(summarize({ sessions, batches, from, to, staffId: 'b' })).toMatchObject({ count: 10, revenue: 55000, checkins: 0 });
    expect(summarize({ sessions, batches, from, to, staffId: 'a' })).toMatchObject({ count: 0, revenue: 0, checkins: 12 });
  });
  it('báo cáo theo ngày', () => {
    const rows = reportRows({ sessions, batches, alerts, from: '20261102', to: '20261103', groupBy: 'day' });
    expect(rows.map((r) => r.key)).toEqual(['20261102', '20261103']);
    expect(rows[1].revenue).toBe(55000);
    expect(rows[0].revenue).toBe(0);
  });
  it('báo cáo theo ca', () => {
    const shifts = [{ id: 'sh1', staffId: 'b', startAt: t(18), endAt: t(22), summary: { revenue: 55000 } }];
    const rows = reportRows({ sessions, shifts, from: '20261103', to: '20261103', groupBy: 'shift', staffNames: { b: 'Hùng' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'sh1', label: expect.stringContaining('Hùng'), revenue: 55000, count: 10 });
  });
});
