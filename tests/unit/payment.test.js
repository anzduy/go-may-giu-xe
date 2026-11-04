import { describe, it, expect } from 'vitest';
import { applyPush, newState } from '../../web/shared/server-ops.js';
import { summarize } from '../../web/shared/report.js';
import { outAmount, dueAtOut, checkinPayment } from '../../web/shared/payment.js';

const today = '20261103';
const at = (sec) => new Date(Date.UTC(2026, 10, 3, 3, 0, sec)).toISOString(); // 10:00 giờ VN
const mk = (opId, type, payload, staffId = 'st1') => ({ opId, type, payload, staffId, deviceId: 'dA', createdAt: payload.inAt || payload.outAt || at(0) });
const create = (opId, id, no, payIn, sec = 0) =>
  mk(opId, 'createSession', { id, ticketDate: today, ticketNo: no, noTicket: false, vehicleType: 'motorbike', inAt: at(sec), inPhotoId: `ph-${id}`, payIn });
const out = (opId, id, payMethod, sec = 30, staffId = 'st2') => mk(opId, 'checkout', { sessionId: id, outAt: at(sec), outPhotoId: `out-${id}`, payMethod }, staffId);

function state() {
  const st = newState();
  st.batches.push({ date: today, fromNo: 1, toNo: 200 });
  return st;
}

describe('thanh toán lúc gửi / lúc trả, tiền mặt / chuyển khoản', () => {
  it('thu lúc gửi (tiền mặt, chuyển khoản) → lúc trả không thu nữa; "trả lúc ra" → thu lúc trả', () => {
    const st = state();
    applyPush(st, [create('c1', 's1', 1, 'cash'), create('c2', 's2', 2, 'transfer'), create('c3', 's3', 3, 'later'), create('c4', 's4', 4, undefined)]);
    expect(st.sessions.get('s1')).toMatchObject({ inPaid: 5000, inPayMethod: 'cash' });
    expect(st.sessions.get('s2')).toMatchObject({ inPaid: 5000, inPayMethod: 'transfer' });
    expect(st.sessions.get('s3').inPaid).toBe(0);
    expect(st.sessions.get('s4').inPaid).toBe(0); // bản app cũ không gửi payIn = trả lúc ra như trước

    applyPush(st, [out('o1', 's1', 'cash'), out('o2', 's2'), out('o3', 's3', 'transfer'), out('o4', 's4')]);
    expect(st.sessions.get('s1')).toMatchObject({ status: 'returned', fee: 5000, outPaid: 0, outPayMethod: '' });
    expect(st.sessions.get('s2')).toMatchObject({ fee: 5000, outPaid: 0 });
    expect(st.sessions.get('s3')).toMatchObject({ fee: 5000, outPaid: 5000, outPayMethod: 'transfer' });
    expect(st.sessions.get('s4')).toMatchObject({ fee: 5000, outPaid: 5000, outPayMethod: 'cash' });
  });

  it('chốt ca: tiền thu lúc gửi tính cho người nhận xe, lúc trả tính cho người trả; tách tiền mặt / chuyển khoản', () => {
    const st = state();
    applyPush(st, [create('c1', 's1', 1, 'cash'), create('c2', 's2', 2, 'transfer'), create('c3', 's3', 3, 'later'), create('c4', 's4', 4, 'later')]);
    applyPush(st, [out('o1', 's1'), out('o3', 's3', 'transfer'), out('o4', 's4', 'cash')]);
    const sessions = [...st.sessions.values()];
    const from = at(0); const to = at(59);
    expect(summarize({ sessions, from, to, staffId: 'st1' })).toMatchObject({ revenue: 10000, cash: 5000, transfer: 5000, prepaid: 2, count: 0, checkins: 4 });
    expect(summarize({ sessions, from, to, staffId: 'st2' })).toMatchObject({ revenue: 10000, cash: 5000, transfer: 5000, count: 3 });
    const all = summarize({ sessions, from, to });
    expect(all).toMatchObject({ revenue: 20000, cash: 10000, transfer: 10000 });
    expect(all.byType.motorbike).toEqual({ count: 4, revenue: 20000 }); // mỗi xe tính 1 lần dù thu lúc nào
  });

  it('hoàn tác / hủy lượt đã thu lúc gửi → không tính tiền (trả lại khách)', () => {
    const st = state();
    applyPush(st, [create('c1', 's1', 1, 'cash'), mk('u1', 'undo', { sessionId: 's1' })]);
    expect(st.sessions.get('s1').status).toBe('cancelled');
    expect(summarize({ sessions: [...st.sessions.values()], from: at(0), to: at(59) }).revenue).toBe(0);
  });

  it('mất phiếu: phí mất phiếu là tổng tiền — đã trả lúc gửi thì chỉ thu phần còn thiếu', () => {
    const st = state();
    applyPush(st, [create('c1', 's1', 1, 'cash'), create('c2', 's2', 2, 'later')]);
    const lost = (opId, id, payMethod) => mk(opId, 'lostCheckout', { sessionId: id, outAt: at(40), outPhotoId: `o-${id}`, note: 'đã xem cà vẹt', payMethod }, 'st2');
    applyPush(st, [lost('l1', 's1', 'transfer'), lost('l2', 's2', 'cash')]);
    expect(st.sessions.get('s1')).toMatchObject({ status: 'lost', fee: 10000, outPaid: 5000, outPayMethod: 'transfer' });
    expect(st.sessions.get('s2')).toMatchObject({ status: 'lost', fee: 10000, outPaid: 10000, outPayMethod: 'cash' });
  });

  it('trả xe tạm rồi ghép: đã trả lúc gửi → không thu thêm; chưa trả → thu theo cách đã chọn lúc trả tạm', () => {
    const st = state();
    const prov = (opId, id, no, payMethod) => mk(opId, 'provisionalCheckout', { id, ticketDate: today, ticketNo: no, outAt: at(20), outPhotoId: `o-${id}`, note: 'máy cổng vào mất mạng', payMethod }, 'st2');
    applyPush(st, [prov('p1', 'v1', 7, 'transfer'), prov('p2', 'v2', 8, 'transfer')]);
    applyPush(st, [create('c1', 's1', 7, 'cash', 5), create('c2', 's2', 8, 'later', 5)]);
    expect(st.sessions.get('s1')).toMatchObject({ status: 'returned', inPaid: 5000, outPaid: 0, fee: 5000 });
    expect(st.sessions.get('s2')).toMatchObject({ status: 'returned', inPaid: 0, outPaid: 5000, outPayMethod: 'transfer', fee: 5000 });
  });

  it('lượt cũ (trước khi có thanh toán linh động): toàn bộ phí là tiền mặt lúc trả', () => {
    const old = { id: 'x', status: 'returned', fee: 5000, outAt: at(10), outStaffId: 'st2', vehicleType: 'motorbike' };
    expect(outAmount(old)).toBe(5000);
    expect(summarize({ sessions: [old], from: at(0), to: at(59) })).toMatchObject({ revenue: 5000, cash: 5000, transfer: 0 });
    expect(dueAtOut(5000, {})).toBe(5000);
    expect(checkinPayment('later', 5000)).toEqual({ inPaid: 0 });
  });
});
