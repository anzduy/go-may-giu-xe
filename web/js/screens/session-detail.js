// CHI TIẾT LƯỢT GỬI: ảnh lúc vào và lúc ra đặt cạnh nhau (chạm để phóng to), giờ, nhân viên, tiền, diễn biến.
import * as db from '../db.js';
import * as sync from '../sync.js';
import { h, timeVN, dateVN, asyncPhoto, toast, uuid } from '../ui.js';
import { hashParams } from '../ctx.js';
import { formatNo } from '../../shared/ticket.js';
import { VEHICLE_TYPES, formatMoney } from '../../shared/pricing.js';

const STATUS_VN = { in_lot: 'Đang trong bãi', returned: 'Đã trả xe', lost: 'Mất phiếu — đã trả', provisional: 'Trả xe tạm (chờ ghép)', cancelled: 'Đã hủy' };

export async function render(root, ctx) {
  const { id } = hashParams();
  const s = id && (await db.getSession(id));
  if (!s) { root.replaceChildren(h('div', { class: 'banner danger' }, 'Không tìm thấy lượt gửi này trên máy')); return; }
  const names = await db.getMeta('staffNames', {});
  const who = (sid) => names[sid] || sid || '';

  const timeline = [
    s.inAt ? `Gửi xe ${timeVN(s.inAt)} ngày ${dateVN(s.ticketDate)} — ${who(s.inStaffId)}` : null,
    s.outAt ? `${s.status === 'lost' ? 'Trả xe (mất phiếu)' : s.status === 'provisional' ? 'Trả xe tạm' : 'Trả xe'} ${timeVN(s.outAt)} — ${who(s.outStaffId)}` : null,
    s.status === 'cancelled' ? `Đã hủy${s.note ? `: ${s.note}` : ''}` : null,
    s.note && s.status !== 'cancelled' ? `Ghi chú: ${s.note}` : null,
    s.conflict ? `⚠ Xung đột đồng bộ: ${s.conflict}` : null,
    s.mergedInto ? `Đã ghép vào lượt ${s.mergedInto}` : null,
  ].filter(Boolean);

  root.replaceChildren(
    h('div', { class: 'info-line' }, `Phiếu ${formatNo(s.ticketNo)}${s.noTicket ? ' (không phiếu)' : ''}${s.plate ? ` · ${s.plate}` : ''}`),
    h('div', { class: 'muted' }, `${VEHICLE_TYPES[s.vehicleType] || ''} · ${STATUS_VN[s.status] || s.status}${s.fee != null ? ` · Đã thu ${formatMoney(s.fee)}` : ''}`),
    h('div', { class: 'side-by-side', id: 'photo-pair', style: 'margin-top:10px' },
      h('figure', {}, asyncPhoto(s.inPhotoId, 'Ảnh lúc vào', db.getPhotoBlob), h('figcaption', {}, `Lúc vào ${timeVN(s.inAt)}`)),
      h('figure', {}, s.outPhotoId ? asyncPhoto(s.outPhotoId, 'Ảnh lúc ra', db.getPhotoBlob) : h('div', { class: 'photo-missing' }, 'Chưa trả xe'),
        h('figcaption', {}, s.outAt ? `Lúc ra ${timeVN(s.outAt)}` : ''))),
    plateEditor(s, ctx),
    s.inSummary ? h('div', { class: 'warn-text', id: 'detail-summary' }, `AI: ${s.inSummary}`) : null,
    h('div', { class: 'card', style: 'margin-top:10px' }, h('b', {}, 'Diễn biến'), h('ul', { class: 'timeline' }, timeline.map((t) => h('li', {}, t)))),
    h('button', { type: 'button', style: 'width:100%', onclick: () => history.back() }, '← Quay lại'),
  );
}

const PLATE_VN = { pending: 'đang chờ AI đọc', read: 'AI đọc', unreadable: 'AI không đọc được', manual: 'nhập tay' };

/** Ô sửa biển số (nhân viên/quản lý) → thao tác setPlate, đồng bộ ngầm. */
function plateEditor(s, ctx) {
  const input = h('input', { id: 'plate-input', value: s.plate || '', placeholder: 'Ví dụ 59X1-123.45', autocomplete: 'off' });
  const save = h('button', { type: 'button', id: 'plate-save', class: 'small' }, 'Lưu biển số');
  const status = h('div', { class: 'muted', id: 'plate-status' }, `Biển số: ${PLATE_VN[s.plateStatus] || '—'}`);
  save.addEventListener('click', async () => {
    const plate = input.value.trim();
    if (!plate) return;
    const createdAt = ctx.nowIso();
    const updated = { ...s, plate: plate.toUpperCase(), plateStatus: 'manual' };
    await db.commit({ sessions: [updated], ops: [{ opId: uuid(), type: 'setPlate', createdAt, payload: { sessionId: s.id, plate } }] });
    Object.assign(s, updated);
    status.textContent = `Biển số: ${PLATE_VN.manual}`;
    sync.kick();
    toast(`Đã lưu biển số ${updated.plate}`);
  });
  return h('div', { class: 'card', style: 'margin-top:10px' }, h('label', { for: 'plate-input' }, 'Biển số'),
    h('div', { class: 'keypad-row' }, input, save), status);
}
