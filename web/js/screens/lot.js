// XE TRONG BÃI: lưới ảnh các xe đang gửi, tìm theo số phiếu hoặc biển số, chạm để xem chi tiết.
// (Trả xe mất phiếu và gán lại số phiếu: User Story 4 — bản tiếp theo.)
import * as db from '../db.js';
import { h, timeVN, dateVN, photoEl } from '../ui.js';
import { hashParams } from '../ctx.js';
import { formatNo } from '../../shared/ticket.js';
import { normalizePlate } from '../../shared/sessions.js';

export async function render(root, ctx) {
  const params = hashParams();
  const today = ctx.today();
  const search = h('input', { id: 'lot-search', placeholder: 'Tìm số phiếu hoặc vài số cuối biển số', inputmode: 'search' });
  const grid = h('div', { class: 'grid', id: 'lot-grid' });
  const count = h('div', { class: 'muted' });
  const top = [];
  if (params.mode === 'lost') {
    top.push(h('div', { class: 'banner warn' },
      'Không khớp / mất phiếu: tìm đúng xe trong lưới ảnh, kiểm tra giấy tờ xe rồi báo quản lý. ',
      '(Chức năng "Trả xe – mất phiếu" có ở bản tiếp theo.)'));
  }
  root.replaceChildren(...top, search, count, grid);

  async function paint() {
    const q = search.value.trim();
    const qPlate = normalizePlate(q);
    let list = (await db.allSessions()).filter((s) => s.status === 'in_lot');
    if (q) list = list.filter((s) => String(s.ticketNo) === String(Number(q)) || formatNo(s.ticketNo).includes(q) || (qPlate && normalizePlate(s.plate).includes(qPlate)));
    list.sort((a, b) => String(b.inAt).localeCompare(String(a.inAt)));
    count.textContent = `${list.length} xe`;
    const tiles = await Promise.all(list.map(async (s) => {
      const p = await db.getPhoto(s.inPhotoId);
      return h('button', { type: 'button', class: 'tile', onclick: () => ctx.navigate(`#session?id=${encodeURIComponent(s.id)}`) },
        p && p.blob ? photoEl(p.blob, `Phiếu ${formatNo(s.ticketNo)}`) : h('div', { class: 'thumb' }),
        h('div', {}, h('b', {}, `Phiếu ${formatNo(s.ticketNo)}`), ` · ${timeVN(s.inAt)}`,
          s.ticketDate !== today ? h('div', { class: 'warn-text' }, `Tồn từ ${dateVN(s.ticketDate)}`) : null,
          s.plate ? h('div', { class: 'muted' }, s.plate) : null));
    }));
    grid.replaceChildren(...tiles);
  }
  search.addEventListener('input', paint);
  window.addEventListener('sync:changed', paint);
  await paint();
  return () => window.removeEventListener('sync:changed', paint);
}
