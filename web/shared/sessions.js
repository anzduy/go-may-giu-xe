// Vòng đời một lượt gửi xe. Không có thao tác nào xóa lượt (constitution, Nguyên tắc IV).
import { checkoutPayment, payMethod } from './payment.js';

export const STATUS = {
  IN_LOT: 'in_lot', RETURNED: 'returned', LOST: 'lost', PROVISIONAL: 'provisional', CANCELLED: 'cancelled',
};
export const PLATE_STATUS = { PENDING: 'pending', READ: 'read', UNREADABLE: 'unreadable', MANUAL: 'manual' };
export const UNDO_WINDOW_MS = 10 * 1000;

export function normalizePlate(plate) {
  return String(plate || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Biển số để hiển thị: viết hoa, gọn khoảng trắng ("59x1 123.45" → "59X1 123.45"). So sánh dùng normalizePlate. */
export function displayPlate(plate) {
  return String(plate || '').toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 20);
}

/**
 * Xe vừa gửi (bởi máy này, sau mốc `sinceIso`) có biển số trùng một xe khác đang trong bãi?
 * Dùng để hiện cảnh báo nhẹ, KHÔNG chặn thao tác.
 * @returns {{session:object, other:object} | null}
 */
export function findPlateDuplicate(sessions, deviceId, sinceIso) {
  const inLot = sessions.filter((s) => s.status === STATUS.IN_LOT && normalizePlate(s.plate).length >= 6);
  const recent = inLot.filter((s) => s.inDeviceId === deviceId && String(s.inAt) >= String(sinceIso))
    .sort((a, b) => String(b.inAt).localeCompare(String(a.inAt)));
  for (const s of recent) {
    const other = inLot.find((o) => o.id !== s.id && normalizePlate(o.plate) === normalizePlate(s.plate));
    if (other) return { session: s, other };
  }
  return null;
}

function hasNote(p) {
  return typeof p.note === 'string' && p.note.trim().length > 0;
}

/**
 * Áp một thao tác lên một lượt gửi (không sửa object gốc).
 * @returns {{session:object} | {error:string}}
 */
export function applyOp(session, op, ctx = {}) {
  const p = op.payload || {};
  if (!session) return { error: 'SESSION_NOT_FOUND' };
  switch (op.type) {
    case 'checkout':
    case 'lostCheckout': {
      if (session.status !== STATUS.IN_LOT) return { error: session.status === STATUS.LOST ? 'TICKET_LOST' : 'TICKET_USED' };
      const lost = op.type === 'lostCheckout';
      // Trả xe thường: ảnh lúc ra KHÔNG bắt buộc (nhân viên tự chụp thêm khi cần). Mất phiếu: bắt buộc có ảnh.
      if (!p.outAt || (lost && !p.outPhotoId)) return { error: 'BAD_REQUEST' };
      if (lost && !hasNote(p)) return { error: 'NOTE_REQUIRED' };
      // Phí mất phiếu là TỔNG tiền (không cộng giá thường); đã trả lúc vào thì chỉ thu phần còn thiếu.
      const total = lost ? Number(p.fee != null ? p.fee : ctx.lostFee) : Number(session.priceAtIn);
      return {
        session: {
          ...session,
          status: lost ? STATUS.LOST : STATUS.RETURNED,
          outAt: p.outAt, outStaffId: op.staffId, ...(p.outPhotoId ? { outPhotoId: p.outPhotoId } : {}), ...checkoutPayment(session, total, p.payMethod),
          ...(lost ? { note: p.note.trim() } : {}),
        },
      };
    }
    case 'undo': {
      if (session.status !== STATUS.IN_LOT) return { error: 'UNDO_EXPIRED' };
      const elapsed = Date.parse(op.createdAt) - Date.parse(session.inAt);
      if (op.staffId !== session.inStaffId || !(elapsed >= 0 && elapsed <= UNDO_WINDOW_MS)) return { error: 'UNDO_EXPIRED' };
      return { session: { ...session, status: STATUS.CANCELLED, note: 'Hoàn tác' } };
    }
    case 'cancel': {
      if (!hasNote(p)) return { error: 'NOTE_REQUIRED' };
      return { session: { ...session, status: STATUS.CANCELLED, note: p.note.trim() } };
    }
    case 'setPlate':
      return { session: { ...session, plate: displayPlate(p.plate), plateStatus: PLATE_STATUS.MANUAL } };
    default:
      return { error: 'BAD_REQUEST' };
  }
}

/** Tạo lượt "trả xe tạm" khi máy cổng ra chưa có dữ liệu lượt gửi. */
export function createProvisional(p, staffId) {
  if (!hasNote(p)) return { error: 'NOTE_REQUIRED' };
  if (!p.id || !p.ticketDate || !(Number(p.ticketNo) > 0) || !p.outAt || !p.outPhotoId) return { error: 'BAD_REQUEST' };
  return {
    session: {
      id: p.id, ticketDate: p.ticketDate, ticketNo: Number(p.ticketNo), noTicket: false,
      status: STATUS.PROVISIONAL, outAt: p.outAt, outStaffId: staffId, outPhotoId: p.outPhotoId,
      note: p.note.trim(), fee: null, outPayMethod: payMethod(p.payMethod), plateStatus: PLATE_STATUS.PENDING,
    },
  };
}
