import { describe, it, expect } from 'vitest';
import {
  formatNo, parseTypedNumber, encodeQr, parseQr, hmacSha256Hex, suggestNext,
  validateForCheckin, validateForCheckout, computeSkipped, remainingTickets, dateKey,
} from '../../web/shared/ticket.js';

const SECRET = 'bi-mat-thu-nghiem';
const today = '20261103';
const batches = [{ date: today, fromNo: 1, toNo: 200 }];
const s = (no, status, extra = {}) => ({ id: `s${no}-${status}`, ticketDate: today, ticketNo: no, status, ...extra });

describe('số phiếu', () => {
  it('formatNo luôn 3 chữ số', () => {
    expect(formatNo(7)).toBe('007');
    expect(formatNo(37)).toBe('037');
    expect(formatNo(201)).toBe('201');
  });
  it('parseTypedNumber bỏ số 0 ở đầu', () => {
    expect(parseTypedNumber('037')).toBe(37);
    expect(parseTypedNumber('37')).toBe(37);
    expect(parseTypedNumber('abc')).toBeNull();
    expect(parseTypedNumber('0')).toBeNull();
  });
  it('dateKey theo giờ Việt Nam (UTC+7)', () => {
    expect(dateKey(Date.UTC(2026, 10, 2, 17, 30))).toBe('20261103'); // 00:30 ngày 3/11 ở VN
    expect(dateKey(Date.UTC(2026, 10, 3, 16, 59))).toBe('20261103');
  });
});

describe('mã QR', () => {
  it('HMAC-SHA256 đúng chuẩn (RFC 4231 test case 2)', () => {
    expect(hmacSha256Hex('Jefe', 'what do ya want for nothing?'))
      .toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });
  it('mã kiểm tra = 6 ký tự đầu HMAC của "ngày|số 3 chữ số"', () => {
    const qr = encodeQr(today, 37, SECRET);
    const ck = hmacSha256Hex(SECRET, '20261103|037').slice(0, 6);
    expect(qr).toBe(`GM1|20261103|037|${ck}`);
  });
  it('quét lại được', () => {
    expect(parseQr(encodeQr(today, 37, SECRET), SECRET)).toEqual({ ok: true, date: today, no: 37 });
  });
  it('mã bị sửa → TICKET_INVALID', () => {
    const qr = encodeQr(today, 37, SECRET).replace('|037|', '|038|');
    expect(parseQr(qr, SECRET)).toEqual({ ok: false, error: 'TICKET_INVALID' });
    expect(parseQr('https://example.com', SECRET).error).toBe('TICKET_INVALID');
  });
});

describe('suggestNext', () => {
  it('số vừa dùng + 1', () => expect(suggestNext(5, new Set())).toBe(6));
  it('bỏ qua số đang có xe', () => expect(suggestNext(5, new Set([6, 7]))).toBe(8));
  it('đầu ngày là 1', () => expect(suggestNext(0, new Set())).toBe(1));
});

describe('validateForCheckin', () => {
  const ctx = (sessions) => ({ today, sessions, batches });
  it('hợp lệ', () => expect(validateForCheckin({ ticketDate: today, ticketNo: 5 }, ctx([]))).toEqual({ ok: true }));
  it('đang có xe → TICKET_IN_USE', () =>
    expect(validateForCheckin({ ticketDate: today, ticketNo: 3 }, ctx([s(3, 'in_lot')])).error).toBe('TICKET_IN_USE'));
  it('đã trả → TICKET_USED', () =>
    expect(validateForCheckin({ ticketDate: today, ticketNo: 3 }, ctx([s(3, 'returned')])).error).toBe('TICKET_USED'));
  it('đã báo mất → TICKET_USED', () =>
    expect(validateForCheckin({ ticketDate: today, ticketNo: 3 }, ctx([s(3, 'lost')])).error).toBe('TICKET_USED'));
  it('lượt đã hủy không chặn số', () =>
    expect(validateForCheckin({ ticketDate: today, ticketNo: 3 }, ctx([s(3, 'cancelled')])).ok).toBe(true));
  it('phiếu ngày khác → TICKET_WRONG_DATE', () =>
    expect(validateForCheckin({ ticketDate: '20261102', ticketNo: 3 }, ctx([])).error).toBe('TICKET_WRONG_DATE'));
  it('vượt bộ phiếu chỉ là cảnh báo, không chặn', () =>
    expect(validateForCheckin({ ticketDate: today, ticketNo: 201 }, ctx([]))).toEqual({ ok: true, warning: 'TICKET_OUT_OF_RANGE' }));
  it('gửi xe không phiếu không cảnh báo vượt số', () =>
    expect(validateForCheckin({ ticketDate: today, ticketNo: 201, noTicket: true }, ctx([]))).toEqual({ ok: true }));
});

describe('validateForCheckout', () => {
  it('tìm theo số (không ngày) ra mọi xe đang trong bãi cùng số', () => {
    const y = { ...s(37, 'in_lot'), id: 'y', ticketDate: '20261102' };
    const r = validateForCheckout([s(37, 'in_lot'), y], { ticketNo: 37 });
    expect(r.ok).toBe(true);
    expect(r.matches.map((m) => m.id).sort()).toEqual(['s37-in_lot', 'y']);
  });
  it('tìm theo QR (có ngày) chỉ ra đúng ngày', () => {
    const y = { ...s(37, 'in_lot'), id: 'y', ticketDate: '20261102' };
    expect(validateForCheckout([s(37, 'in_lot'), y], { ticketDate: '20261102', ticketNo: 37 }).matches.map((m) => m.id)).toEqual(['y']);
  });
  it('phiếu đã trả → TICKET_USED kèm giờ trả', () => {
    const r = validateForCheckout([s(37, 'returned', { outAt: '2026-11-03T12:42:00.000Z' })], { ticketNo: 37 });
    expect(r).toMatchObject({ ok: false, error: 'TICKET_USED', session: { outAt: '2026-11-03T12:42:00.000Z' } });
  });
  it('phiếu báo mất → TICKET_LOST', () =>
    expect(validateForCheckout([s(37, 'lost')], { ticketNo: 37 }).error).toBe('TICKET_LOST'));
  it('chưa gửi xe nào → SESSION_NOT_FOUND', () =>
    expect(validateForCheckout([], { ticketNo: 37 }).error).toBe('SESSION_NOT_FOUND'));
});

describe('phiếu bỏ qua và còn lại', () => {
  const sessions = [1, 2, 3, 4, 5, 9].map((n) => s(n, 'in_lot')).concat([s(7, 'cancelled')]);
  it('computeSkipped liệt kê số chưa dùng dưới số lớn nhất', () =>
    expect(computeSkipped(sessions, today)).toEqual([6, 7, 8]));
  it('remainingTickets = số lớn nhất đã tạo − số lớn nhất đã dùng', () =>
    expect(remainingTickets(batches, sessions, today)).toBe(191));
  it('không âm', () => expect(remainingTickets(batches, [s(250, 'in_lot')], today)).toBe(0));
});
