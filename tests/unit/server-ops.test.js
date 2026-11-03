import { describe, it, expect } from 'vitest';
import { applyPush, newState } from '../../web/shared/server-ops.js';

const today = '20261103';
const at = (sec) => new Date(Date.UTC(2026, 10, 3, 3, 0, sec)).toISOString(); // 10:00 giờ VN
const mk = (opId, type, payload, extra = {}) => ({ opId, type, payload, staffId: 'st1', deviceId: 'dA', createdAt: payload.inAt || payload.outAt || at(0), ...extra });
const create = (opId, id, no, sec = 0, extra = {}) =>
  mk(opId, 'createSession', { id, ticketDate: today, ticketNo: no, noTicket: false, vehicleType: 'motorbike', inAt: at(sec), inPhotoId: `ph-${id}`, ...extra });

function state() {
  const st = newState();
  st.batches.push({ date: today, fromNo: 1, toNo: 200 });
  return st;
}

describe('applyPush — chung', () => {
  it('gửi lại cùng opId → duplicate, không làm lại', () => {
    const st = state();
    expect(applyPush(st, [create('o1', 's1', 1)]).results[0].status).toBe('applied');
    const again = applyPush(st, [create('o1', 's1', 1)]);
    expect(again.results[0].status).toBe('duplicate');
    expect(again.changed).toHaveLength(0);
  });
  it('loại thao tác lạ → rejected', () => {
    expect(applyPush(state(), [mk('o1', 'hack', {})]).results[0]).toMatchObject({ status: 'rejected', error: 'BAD_REQUEST' });
  });
  it('mỗi thao tác được ghi nhật ký', () => {
    const r = applyPush(state(), [create('o1', 's1', 1)]);
    expect(r.audits[0]).toMatchObject({ action: 'create', sessionId: 's1', staffId: 'st1', deviceId: 'dA' });
  });
});

describe('createSession', () => {
  it('tạo lượt in_lot với giá lúc gửi', () => {
    const st = state();
    const r = applyPush(st, [create('o1', 's1', 5)]);
    expect(r.results[0].session).toMatchObject({ status: 'in_lot', priceAtIn: 5000, plateStatus: 'pending', inStaffId: 'st1', inDeviceId: 'dA' });
  });
  it('trùng số đang trong bãi → giữ lượt trước, lượt sau vẫn lưu nhưng đánh dấu xung đột', () => {
    const st = state();
    applyPush(st, [create('o1', 's1', 5)]);
    const r = applyPush(st, [create('o2', 's2', 5, 3, {}), ]);
    expect(r.results[0].status).toBe('conflict');
    expect(st.sessions.get('s1').conflict).toBeUndefined();
    expect(st.sessions.get('s2')).toMatchObject({ status: 'in_lot', conflict: 'duplicate_ticket' });
  });
  it('vượt mọi bộ phiếu → nhận nhưng đánh dấu out_of_range', () => {
    const st = state();
    const r = applyPush(st, [create('o1', 's1', 230)]);
    expect(r.results[0].status).toBe('conflict');
    expect(st.sessions.get('s1')).toMatchObject({ status: 'in_lot', conflict: 'out_of_range' });
  });
  it('gửi xe không phiếu không bị out_of_range', () => {
    const st = state();
    expect(applyPush(st, [create('o1', 's1', 230, 0, { noTicket: true })]).results[0].status).toBe('applied');
  });
});

describe('undo', () => {
  it('hoàn tác trong 10 giây', () => {
    const st = state();
    applyPush(st, [create('o1', 's1', 5, 0)]);
    const r = applyPush(st, [mk('o2', 'undo', { sessionId: 's1' }, { createdAt: at(6) })]);
    expect(r.results[0].status).toBe('applied');
    expect(st.sessions.get('s1').status).toBe('cancelled');
    expect(r.audits[0].action).toBe('undo');
  });
  it('quá 10 giây → rejected UNDO_EXPIRED', () => {
    const st = state();
    applyPush(st, [create('o1', 's1', 5, 0)]);
    expect(applyPush(st, [mk('o2', 'undo', { sessionId: 's1' }, { createdAt: at(15) })]).results[0])
      .toMatchObject({ status: 'rejected', error: 'UNDO_EXPIRED' });
  });
});

describe('checkout và trả xe tạm', () => {
  it('trả xe → returned, thu 5.000đ', () => {
    const st = state();
    applyPush(st, [create('o1', 's1', 5)]);
    const r = applyPush(st, [mk('o2', 'checkout', { sessionId: 's1', outAt: at(60), outPhotoId: 'out1' })]);
    expect(r.results[0].session).toMatchObject({ status: 'returned', fee: 5000, outPhotoId: 'out1' });
    expect(r.audits[0].action).toBe('checkout');
  });
  it('trả hai lần → conflict double_checkout, giữ lần đầu', () => {
    const st = state();
    applyPush(st, [create('o1', 's1', 5), mk('o2', 'checkout', { sessionId: 's1', outAt: at(60), outPhotoId: 'out1' })]);
    const r = applyPush(st, [mk('o3', 'checkout', { sessionId: 's1', outAt: at(70), outPhotoId: 'out2' }, { deviceId: 'dB' })]);
    expect(r.results[0]).toMatchObject({ status: 'conflict', error: 'double_checkout' });
    expect(st.sessions.get('s1')).toMatchObject({ outPhotoId: 'out1', conflict: 'double_checkout' });
  });
  it('trả xe tạm rồi lượt gửi đến sau → ghép thành returned', () => {
    const st = state();
    const p = mk('o1', 'provisionalCheckout', { id: 'pv1', ticketDate: today, ticketNo: 5, outAt: at(60), outPhotoId: 'out1', note: 'cổng vào mất mạng' }, { deviceId: 'dB', staffId: 'st2' });
    expect(applyPush(st, [p]).results[0].session.status).toBe('provisional');
    const r = applyPush(st, [create('o2', 's1', 5, 0)]);
    expect(r.results[0].status).toBe('applied');
    expect(st.sessions.get('s1')).toMatchObject({ status: 'returned', outPhotoId: 'out1', outStaffId: 'st2', fee: 5000 });
    expect(st.sessions.get('pv1')).toMatchObject({ status: 'cancelled', mergedInto: 's1' });
  });
  it('trả xe tạm khi máy chủ đã có lượt gửi → trả luôn lượt đó', () => {
    const st = state();
    applyPush(st, [create('o1', 's1', 5)]);
    const r = applyPush(st, [mk('o2', 'provisionalCheckout', { id: 'pv1', ticketDate: today, ticketNo: 5, outAt: at(60), outPhotoId: 'out1', note: 'x' })]);
    expect(r.results[0].session).toMatchObject({ id: 's1', status: 'returned' });
    expect(st.sessions.has('pv1')).toBe(false);
  });
});

describe('setPlate', () => {
  it('nhân viên sửa tay biển số → manual, có nhật ký', () => {
    const st = state();
    applyPush(st, [create('o1', 's1', 5)]);
    const r = applyPush(st, [mk('o2', 'setPlate', { sessionId: 's1', plate: '59X1-123.45' })]);
    expect(r.results[0].session).toMatchObject({ plate: '59X1-123.45', plateStatus: 'manual' });
    expect(r.audits[0].action).toBe('set_plate');
  });
});

describe('US4: trả xe mất phiếu, gán lại số', () => {
  it('mất phiếu: bắt buộc ghi chú, thu phí mất phiếu theo bảng giá, có nhật ký', () => {
    const st = state();
    applyPush(st, [create('o1', 's1', 5)]);
    const noNote = applyPush(st, [mk('o2', 'lostCheckout', { sessionId: 's1', outAt: at(60), outPhotoId: 'out1', note: ' ' })]);
    expect(noNote.results[0]).toMatchObject({ status: 'rejected', error: 'NOTE_REQUIRED' });
    const r = applyPush(st, [mk('o3', 'lostCheckout', { sessionId: 's1', outAt: at(60), outPhotoId: 'out1', note: 'đã xem cà vẹt' })]);
    expect(r.results[0].session).toMatchObject({ status: 'lost', fee: 10000, note: 'đã xem cà vẹt', outPhotoId: 'out1' });
    expect(r.audits[0].action).toBe('lost');
  });
  it('phí mất phiếu theo bảng giá quản lý đặt', () => {
    const st = state();
    st.prices.push({ effectiveFrom: '2000-01-01T00:00:00Z', motorbike: 5000, ebike: 5000, bicycle: 5000, lostFee: 15000 });
    applyPush(st, [create('o1', 's1', 5)]);
    const r = applyPush(st, [mk('o2', 'lostCheckout', { sessionId: 's1', outAt: at(60), outPhotoId: 'o', note: 'x' })]);
    expect(r.results[0].session.fee).toBe(15000);
  });
  it('gán lại số phiếu: cần ghi chú, không trùng xe khác trong bãi, gỡ cờ trùng số', () => {
    const st = state();
    applyPush(st, [create('o1', 's1', 5), create('o2', 's2', 5, 3), create('o3', 's3', 8, 4)]);
    expect(st.sessions.get('s2').conflict).toBe('duplicate_ticket');
    expect(applyPush(st, [mk('o4', 'reassignTicket', { sessionId: 's2', ticketNo: 6 })]).results[0].error).toBe('NOTE_REQUIRED');
    expect(applyPush(st, [mk('o5', 'reassignTicket', { sessionId: 's2', ticketNo: 8, note: 'x' })]).results[0].error).toBe('TICKET_IN_USE');
    const r = applyPush(st, [mk('o6', 'reassignTicket', { sessionId: 's2', ticketNo: 6, note: 'khách cầm phiếu 006' })]);
    expect(r.results[0].session).toMatchObject({ ticketNo: 6, status: 'in_lot' });
    expect(r.results[0].session.conflict).toBeUndefined();
    expect(r.audits[0]).toMatchObject({ action: 'reassign', detail: { from: 5, to: 6 } });
  });
});

describe('US5: hủy lượt, chốt ca', () => {
  it('chỉ quản lý được hủy lượt, bắt buộc ghi chú', () => {
    const st = state();
    applyPush(st, [create('o1', 's1', 5)]);
    expect(applyPush(st, [mk('o2', 'cancel', { sessionId: 's1', note: 'nhập nhầm' }, { role: 'staff' })]).results[0].error).toBe('FORBIDDEN');
    expect(applyPush(st, [mk('o3', 'cancel', { sessionId: 's1' }, { role: 'manager' })]).results[0].error).toBe('NOTE_REQUIRED');
    const r = applyPush(st, [mk('o4', 'cancel', { sessionId: 's1', note: 'nhập nhầm' }, { role: 'manager' })]);
    expect(r.results[0].session).toMatchObject({ status: 'cancelled', note: 'nhập nhầm' });
    expect(st.sessions.has('s1')).toBe(true); // không xóa
  });
  it('chốt ca: máy chủ tính tổng ca của nhân viên đó', () => {
    const st = state();
    applyPush(st, [create('o1', 's1', 1, 0), create('o2', 's2', 2, 1),
      mk('o3', 'checkout', { sessionId: 's1', outAt: at(30), outPhotoId: 'x' })]);
    const r = applyPush(st, [mk('o4', 'closeShift', { shiftId: 'sh1', startAt: at(0), endAt: at(59) }, { createdAt: at(59) })]);
    expect(r.results[0].status).toBe('applied');
    expect(r.shifts[0]).toMatchObject({ id: 'sh1', staffId: 'st1', summary: { checkins: 2, count: 1, revenue: 5000, inLot: 1 } });
    expect(r.audits[0].action).toBe('close_shift');
  });
});
