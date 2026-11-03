// Vòng đời một lượt gửi xe. Không có thao tác nào xóa lượt (constitution, Nguyên tắc IV).

export const STATUS = {
  IN_LOT: 'in_lot', RETURNED: 'returned', LOST: 'lost', PROVISIONAL: 'provisional', CANCELLED: 'cancelled',
};
export const PLATE_STATUS = { PENDING: 'pending', READ: 'read', UNREADABLE: 'unreadable', MANUAL: 'manual' };
export const UNDO_WINDOW_MS = 10 * 1000;

export function normalizePlate(plate) {
  return String(plate || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
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
      if (!p.outAt || !p.outPhotoId) return { error: 'BAD_REQUEST' };
      const lost = op.type === 'lostCheckout';
      if (lost && !hasNote(p)) return { error: 'NOTE_REQUIRED' };
      const fee = lost ? Number(p.fee != null ? p.fee : ctx.lostFee) : Number(session.priceAtIn);
      return {
        session: {
          ...session,
          status: lost ? STATUS.LOST : STATUS.RETURNED,
          outAt: p.outAt, outStaffId: op.staffId, outPhotoId: p.outPhotoId, fee,
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
      return { session: { ...session, plate: normalizePlate(p.plate), plateStatus: PLATE_STATUS.MANUAL } };
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
      note: p.note.trim(), fee: null, plateStatus: PLATE_STATUS.PENDING,
    },
  };
}
