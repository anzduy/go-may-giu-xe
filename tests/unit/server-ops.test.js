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
