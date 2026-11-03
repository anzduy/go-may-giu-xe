// Xử lý các thao tác `push` gửi từ máy lên. Logic thuần, dùng chung cho Apps Script (gas/Sessions.js)
// và máy chủ giả trong test (tests/e2e/fixtures/mock-api.js), để test kiểm tra đúng logic thật.
import { validateForCheckin, maxTicketNo, dateKey } from './ticket.js';
import { priceFor, lostFee } from './pricing.js';
import { summarize } from './report.js';
import { applyOp, createProvisional, STATUS, PLATE_STATUS } from './sessions.js';

/** Trạng thái máy chủ dùng cho applyPush. sessions: Map id → lượt gửi. */
export function newState() {
  return { sessions: new Map(), batches: [], prices: [], shifts: new Map(), appliedOpIds: new Set() };
}

function findOpen(state, date, no, status) {
  for (const s of state.sessions.values()) {
    if (s.ticketDate === date && Number(s.ticketNo) === Number(no) && s.status === status && !s.mergedInto) return s;
  }
  return null;
}

function opCreateSession(state, op) {
  const p = op.payload || {};
  if (!p.id || !p.ticketDate || !(Number(p.ticketNo) > 0) || !p.inAt || !p.inPhotoId) return { status: 'rejected', error: 'BAD_REQUEST' };
  if (state.sessions.has(p.id)) return { status: 'duplicate', session: state.sessions.get(p.id) };

  const others = [...state.sessions.values()].filter((s) => s.id !== p.id);
  const check = validateForCheckin(
    { ticketDate: p.ticketDate, ticketNo: p.ticketNo, noTicket: !!p.noTicket },
    { today: dateKey(p.inAt), sessions: others, batches: state.batches },
  );
  let conflict;
  if (!check.ok) {
    conflict = { TICKET_IN_USE: 'duplicate_ticket', TICKET_USED: 'ticket_used', TICKET_WRONG_DATE: 'wrong_date' }[check.error] || 'invalid';
  } else if (!p.noTicket && Number(p.ticketNo) > maxTicketNo(state.batches, p.ticketDate)) {
    conflict = 'out_of_range';
  }
  // Ngoại lệ: lượt "trả xe tạm" đang chờ ghép không tính là trùng số.
  const provisional = findOpen(state, p.ticketDate, p.ticketNo, STATUS.PROVISIONAL);
  if (provisional && conflict === 'ticket_used') conflict = undefined;

  const vehicleType = ['motorbike', 'ebike', 'bicycle'].includes(p.vehicleType) ? p.vehicleType : 'motorbike';
  let session = {
    id: p.id, ticketDate: p.ticketDate, ticketNo: Number(p.ticketNo), noTicket: !!p.noTicket, vehicleType,
    plate: p.plate || '', plateStatus: PLATE_STATUS.PENDING, inAt: p.inAt, inStaffId: op.staffId,
    inDeviceId: op.deviceId, inPhotoId: p.inPhotoId, priceAtIn: priceFor(state.prices, vehicleType, p.inAt),
    status: STATUS.IN_LOT, note: p.note || '',
  };
  if (conflict) session.conflict = conflict;

  const changed = [];
  let action = 'create';
  if (provisional && !conflict) {
    session = { ...session, status: STATUS.RETURNED, outAt: provisional.outAt, outStaffId: provisional.outStaffId,
      outPhotoId: provisional.outPhotoId, fee: session.priceAtIn, note: provisional.note };
    const merged = { ...provisional, status: STATUS.CANCELLED, mergedInto: session.id };
    state.sessions.set(merged.id, merged);
    changed.push(merged);
    action = 'merge_provisional';
  }
  state.sessions.set(session.id, session);
  changed.unshift(session);
  return { status: conflict ? 'conflict' : 'applied', error: conflict, session, changed, action };
}

function opTransition(state, op, action) {
  const p = op.payload || {};
  const current = state.sessions.get(p.sessionId);
  if (!current) return { status: 'rejected', error: 'SESSION_NOT_FOUND' };
  const r = applyOp(current, op);
  if (r.error) {
    if (op.type === 'checkout' && r.error === 'TICKET_USED') {
      const flagged = { ...current, conflict: 'double_checkout' };
      state.sessions.set(flagged.id, flagged);
      return { status: 'conflict', error: 'double_checkout', session: flagged, changed: [flagged], action: 'conflict' };
    }
    return { status: 'rejected', error: r.error, session: current };
  }
  state.sessions.set(r.session.id, r.session);
  return { status: 'applied', session: r.session, changed: [r.session], action };
}

function opProvisional(state, op) {
  const p = op.payload || {};
  if (state.sessions.has(p.id)) return { status: 'duplicate', session: state.sessions.get(p.id) };
  const open = findOpen(state, p.ticketDate, p.ticketNo, STATUS.IN_LOT);
  if (open) {
    // Máy chủ đã có lượt gửi → trả luôn lượt đó.
    return opTransition(state, { ...op, type: 'checkout', payload: { sessionId: open.id, outAt: p.outAt, outPhotoId: p.outPhotoId } }, 'checkout');
  }
  const r = createProvisional(p, op.staffId);
  if (r.error) return { status: 'rejected', error: r.error };
  state.sessions.set(r.session.id, r.session);
  return { status: 'applied', session: r.session, changed: [r.session], action: 'provisional' };
}

function opLost(state, op) {
  const p = op.payload || {};
  const current = state.sessions.get(p.sessionId);
  if (!current) return { status: 'rejected', error: 'SESSION_NOT_FOUND' };
  const withFee = { ...op, payload: { ...p, fee: lostFee(state.prices, p.outAt || op.createdAt) } };
  return opTransition(state, withFee, 'lost');
}

function opReassign(state, op) {
  const p = op.payload || {};
  const current = state.sessions.get(p.sessionId);
  if (!current) return { status: 'rejected', error: 'SESSION_NOT_FOUND' };
  if (!(typeof p.note === 'string' && p.note.trim())) return { status: 'rejected', error: 'NOTE_REQUIRED' };
  const no = Number(p.ticketNo);
  if (!(no > 0) || current.status === STATUS.CANCELLED) return { status: 'rejected', error: 'BAD_REQUEST' };
  const clash = [...state.sessions.values()].find((s) => s.id !== current.id && s.status === STATUS.IN_LOT
    && s.ticketDate === current.ticketDate && Number(s.ticketNo) === no);
  if (clash) return { status: 'rejected', error: 'TICKET_IN_USE' };
  const updated = { ...current, ticketNo: no, note: [current.note, `Gán lại số ${current.ticketNo}→${no}: ${p.note.trim()}`].filter(Boolean).join(' | ') };
  if (updated.conflict === 'duplicate_ticket' || updated.conflict === 'out_of_range') delete updated.conflict;
  state.sessions.set(updated.id, updated);
  return { status: 'applied', session: updated, changed: [updated], action: 'reassign', detail: { from: Number(current.ticketNo), to: no } };
}

function opCancel(state, op) {
  if (op.role !== 'manager') return { status: 'rejected', error: 'FORBIDDEN' };
  return opTransition(state, op, 'cancel');
}

function opCloseShift(state, op) {
  const p = op.payload || {};
  if (!p.shiftId || !p.startAt || !p.endAt) return { status: 'rejected', error: 'BAD_REQUEST' };
  const summary = summarize({ sessions: [...state.sessions.values()], batches: state.batches, from: p.startAt, to: p.endAt, staffId: op.staffId });
  const shift = { id: p.shiftId, staffId: op.staffId, deviceId: op.deviceId, startAt: p.startAt, endAt: p.endAt, summary };
  state.shifts.set(shift.id, shift);
  return { status: 'applied', shift, shiftChanged: shift, action: 'close_shift', detail: { revenue: summary.revenue, count: summary.count } };
}

const HANDLERS = {
  createSession: opCreateSession,
  checkout: (st, op) => opTransition(st, op, 'checkout'),
  undo: (st, op) => opTransition(st, op, 'undo'),
  provisionalCheckout: opProvisional,
  setPlate: (st, op) => opTransition(st, op, 'set_plate'),
  lostCheckout: opLost,
  reassignTicket: opReassign,
  cancel: opCancel,
  closeShift: opCloseShift,
};

/**
 * Áp danh sách thao tác. Sửa trực tiếp `state` (sessions, appliedOpIds).
 * Mỗi op: { opId, type, payload, createdAt, staffId, deviceId } — staffId/deviceId do máy chủ gắn từ token.
 * @returns {{results:object[], changed:object[], audits:object[]}}
 */
export function applyPush(state, ops) {
  const results = [];
  const changed = new Map();
  const shifts = [];
  const audits = [];
  for (const op of ops || []) {
    if (!op || !op.opId) { results.push({ opId: op && op.opId, status: 'rejected', error: 'BAD_REQUEST' }); continue; }
    if (state.appliedOpIds.has(op.opId)) { results.push({ opId: op.opId, status: 'duplicate' }); continue; }
    const handler = HANDLERS[op.type];
    const r = handler ? handler(state, op) : { status: 'rejected', error: 'BAD_REQUEST' };
    state.appliedOpIds.add(op.opId);
    for (const s of r.changed || []) changed.set(s.id, s);
    if (r.shiftChanged) shifts.push(r.shiftChanged);
    if (r.action) {
      audits.push({ at: op.createdAt, staffId: op.staffId, deviceId: op.deviceId, action: r.action,
        sessionId: r.session && r.session.id, detail: { opId: op.opId, type: op.type, conflict: r.error || null, ...(r.detail || {}) } });
    }
    results.push({ opId: op.opId, status: r.status, ...(r.error ? { error: r.error } : {}), ...(r.session ? { session: r.session } : {}),
      ...(r.shift ? { shift: r.shift } : {}) });
  }
  return { results, changed: [...changed.values()], shifts, audits };
}
