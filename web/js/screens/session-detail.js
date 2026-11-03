// CHI TIẾT LƯỢT GỬI: ảnh lúc vào và lúc ra đặt cạnh nhau (chạm để phóng to), giờ, nhân viên, tiền, diễn biến.
import * as db from '../db.js';
import { h, timeVN, dateVN, photoEl } from '../ui.js';
import { hashParams } from '../ctx.js';
import { formatNo } from '../../shared/ticket.js';
import { VEHICLE_TYPES, formatMoney } from '../../shared/pricing.js';

const STATUS_VN = { in_lot: 'Đang trong bãi', returned: 'Đã trả xe', lost: 'Mất phiếu — đã trả', provisional: 'Trả xe tạm (chờ ghép)', cancelled: 'Đã hủy' };

export async function render(root) {
  const { id } = hashParams();
  const s = id && (await db.getSession(id));
  if (!s) { root.replaceChildren(h('div', { class: 'banner danger' }, 'Không tìm thấy lượt gửi này trên máy')); return; }
  const names = await db.getMeta('staffNames', {});
  const who = (sid) => names[sid] || sid || '';
  const pin = await db.getPhoto(s.inPhotoId);
  const pout = await db.getPhoto(s.outPhotoId);

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
      h('figure', {}, photoEl(pin && pin.blob, 'Ảnh lúc vào'), h('figcaption', {}, `Lúc vào ${timeVN(s.inAt)}`)),
      h('figure', {}, s.outPhotoId ? photoEl(pout && pout.blob, 'Ảnh lúc ra') : h('div', { class: 'photo-missing' }, 'Chưa trả xe'),
        h('figcaption', {}, s.outAt ? `Lúc ra ${timeVN(s.outAt)}` : ''))),
    h('div', { class: 'card', style: 'margin-top:10px' }, h('b', {}, 'Diễn biến'), h('ul', { class: 'timeline' }, timeline.map((t) => h('li', {}, t)))),
    h('button', { type: 'button', style: 'width:100%', onclick: () => history.back() }, '← Quay lại'),
  );
}
