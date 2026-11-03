import { describe, it, expect } from 'vitest';
import { applyOp, normalizePlate, createProvisional, STATUS } from '../../web/shared/sessions.js';

const base = {
  id: 'a', ticketDate: '20261103', ticketNo: 5, status: 'in_lot', priceAtIn: 5000,
  inAt: '2026-11-03T10:00:00.000Z', inStaffId: 'st1',
};
const op = (type, payload, extra = {}) => ({ type, payload, staffId: 'st1', createdAt: '2026-11-03T10:00:05.000Z', ...extra });

describe('chuyển trạng thái lượt gửi', () => {
  it('trả xe cần ảnh lúc ra, thu đúng giá lúc gửi', () => {
    expect(applyOp(base, op('checkout', { sessionId: 'a', outAt: 'x' })).error).toBe('BAD_REQUEST');
    const r = applyOp(base, op('checkout', { sessionId: 'a', outAt: '2026-11-03T11:00:00.000Z', outPhotoId: 'p2' }));
    expect(r.session).toMatchObject({ status: 'returned', fee: 5000, outPhotoId: 'p2', outStaffId: 'st1' });
    expect(base.status).toBe('in_lot'); // không sửa object gốc
  });
  it('không trả xe hai lần', () => {
    const returned = { ...base, status: 'returned' };
    expect(applyOp(returned, op('checkout', { sessionId: 'a', outAt: 'x', outPhotoId: 'p' })).error).toBe('TICKET_USED');
  });
  it('mất phiếu bắt buộc ghi chú', () => {
    expect(applyOp(base, op('lostCheckout', { sessionId: 'a', outAt: 'x', outPhotoId: 'p', fee: 10000 })).error).toBe('NOTE_REQUIRED');
    const r = applyOp(base, op('lostCheckout', { sessionId: 'a', outAt: 'x', outPhotoId: 'p', fee: 10000, note: 'đã xem cà vẹt' }));
    expect(r.session).toMatchObject({ status: 'lost', fee: 10000, note: 'đã xem cà vẹt' });
  });
  it('hoàn tác chỉ trong 10 giây, cùng nhân viên', () => {
    expect(applyOp(base, op('undo', { sessionId: 'a' })).session.status).toBe('cancelled');
    expect(applyOp(base, op('undo', { sessionId: 'a' }, { createdAt: '2026-11-03T10:00:11.000Z' })).error).toBe('UNDO_EXPIRED');
    expect(applyOp(base, op('undo', { sessionId: 'a' }, { staffId: 'st2' })).error).toBe('UNDO_EXPIRED');
  });
  it('trả xe tạm bắt buộc ghi chú', () => {
    expect(createProvisional({ id: 'p', ticketDate: '20261103', ticketNo: 5, outAt: 'x', outPhotoId: 'p' }, 'st1').error).toBe('NOTE_REQUIRED');
    expect(createProvisional({ id: 'p', ticketDate: '20261103', ticketNo: 5, outAt: 'x', outPhotoId: 'p', note: 'máy cổng vào mất mạng' }, 'st1').session.status).toBe('provisional');
  });
  it('không có trạng thái nào là xóa', () => {
    expect(Object.values(STATUS)).not.toContain('deleted');
  });
  it('chuẩn hóa biển số', () => {
    expect(normalizePlate('59X1-123.45')).toBe('59X112345');
    expect(normalizePlate(' 59x1 123 45 ')).toBe('59X112345');
  });
});

import { findPlateDuplicate } from '../../web/shared/sessions.js';
describe('biển số trùng trong bãi', () => {
  const mk = (id, no, plate, inAt, status = 'in_lot') => ({ id, ticketNo: no, plate, inAt, status, inDeviceId: 'dA' });
  it('báo khi xe vừa gửi trùng biển với xe khác đang trong bãi', () => {
    const list = [mk('a', 12, '59X1-123.45', '2026-11-03T08:00:00Z'), mk('b', 30, '59x1 12345', '2026-11-03T10:00:00Z')];
    expect(findPlateDuplicate(list, 'dA', '2026-11-03T09:55:00Z')).toMatchObject({ session: { id: 'b' }, other: { id: 'a', ticketNo: 12 } });
  });
  it('không báo khi xe kia đã trả, hoặc lượt gửi đã cũ', () => {
    expect(findPlateDuplicate([mk('a', 12, '59X112345', 'x', 'returned'), mk('b', 30, '59X112345', '2026-11-03T10:00:00Z')], 'dA', '2026-11-03T09:55:00Z')).toBeNull();
    expect(findPlateDuplicate([mk('a', 12, '59X112345', '2026-11-03T08:00:00Z'), mk('b', 30, '59X112345', '2026-11-03T09:00:00Z')], 'dA', '2026-11-03T09:55:00Z')).toBeNull();
  });
});
