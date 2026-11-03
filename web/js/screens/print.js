// IN PHIẾU (chỉ quản lý): tạo bộ phiếu cho một ngày, in A4 24 phiếu/trang bằng máy in thường.
import { call } from '../api.js';
import * as db from '../db.js';
import * as sync from '../sync.js';
import { h, toast, dateVN, timeVN } from '../ui.js';
import { paginate } from '../print-layout.js';
import { formatNo, dateKey } from '../../shared/ticket.js';
import { lostFee, formatMoney } from '../../shared/pricing.js';

function qrSvg(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

function ticketEl(date, t, feeText) {
  return h('div', { class: 'ticket' },
    h('div', { class: 'qr', html: qrSvg(t.qr) }),
    h('div', { class: 'ticket-text' },
      h('div', { class: 'brand' }, 'Gò Mây Arena'),
      h('div', { class: 'no' }, formatNo(t.no)),
      h('div', { class: 'date' }, dateVN(date)),
      h('div', { class: 'hint' }, `Giữ phiếu để lấy xe · Mất phiếu ${feeText}`)));
}

export async function render(root, ctx) {
  if (!ctx.isManager()) { root.replaceChildren(h('div', { class: 'banner danger' }, 'Chỉ quản lý mới in phiếu được')); return; }
  const prices = await db.getMeta('prices', []);
  const feeText = formatMoney(lostFee(prices, ctx.nowIso()));
  const dateInput = h('input', { id: 'batch-date', type: 'date', value: (() => { const k = dateKey(ctx.now() + 86400000); return `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`; })() });
  const count = h('input', { id: 'batch-count', type: 'number', min: '1', max: '500', value: '200', inputmode: 'numeric' });
  const createBtn = h('button', { type: 'button', class: 'primary', id: 'create-batch' }, 'Tạo phiếu');
  const msg = h('div', { class: 'muted', id: 'batch-msg' });
  const list = h('div', { class: 'list', id: 'batch-list' });
  const area = h('div', { class: 'print-area', id: 'print-area' });
  const printBtn = h('button', { type: 'button', class: 'primary hidden', id: 'print-btn', onclick: () => window.print() }, '🖨 In');

  root.replaceChildren(
    h('div', { class: 'card no-print' },
      h('b', {}, 'Tạo bộ phiếu QR'),
      h('label', { for: 'batch-date' }, 'Ngày dùng phiếu'), dateInput,
      h('label', { for: 'batch-count' }, 'Số lượng phiếu'), count,
      h('p', { class: 'muted' }, 'Đã có phiếu cho ngày đó thì app tạo thêm, số nối tiếp (ví dụ 201–250).'),
      h('div', { class: 'row' }, createBtn, printBtn), msg),
    h('div', { class: 'card no-print' }, h('b', {}, 'Bộ phiếu gần đây'), list),
    area,
  );

  function showTickets(data) {
    const pages = paginate(data.tickets);
    area.replaceChildren(...pages.map((p) => h('div', { class: 'print-page' }, p.map((t) => ticketEl(data.date, t, feeText)))));
    msg.textContent = `Phiếu ${formatNo(data.fromNo)}–${formatNo(data.toNo)} ngày ${dateVN(data.date)} · ${pages.length} trang A4. Bấm "In" (hoặc lưu PDF).`;
    printBtn.classList.remove('hidden');
  }

  async function loadBatches() {
    const r = await call('listBatches', {});
    if (!r.ok) { list.replaceChildren(h('div', { class: 'muted' }, 'Cần có mạng để xem danh sách')); return; }
    list.replaceChildren(...r.data.batches.map((b) => {
      const again = h('button', { type: 'button', class: 'small' }, 'In lại');
      again.addEventListener('click', async () => {
        const rr = await call('reprintBatch', { date: b.date, fromNo: b.fromNo, toNo: b.toNo });
        if (rr.ok) showTickets(rr.data); else toast(rr.error.message || 'Không in lại được', { error: true });
      });
      return h('div', { class: 'item' },
        h('div', { style: 'flex:1' }, h('b', {}, `${dateVN(b.date)}: ${formatNo(b.fromNo)}–${formatNo(b.toNo)}`),
          h('div', { class: 'muted' }, `${b.createdByName || ''} · tạo lúc ${timeVN(b.createdAt)} ${dateVN(dateKey(b.createdAt))}`)),
        again);
    }));
  }

  createBtn.addEventListener('click', async () => {
    const date = dateInput.value.replace(/-/g, '');
    const n = Number(count.value);
    if (!/^\d{8}$/.test(date) || !(n >= 1 && n <= 500)) { msg.textContent = 'Chọn ngày và số lượng 1–500'; return; }
    createBtn.disabled = true;
    msg.textContent = 'Đang tạo phiếu…';
    const r = await call('createBatch', { date, count: n });
    createBtn.disabled = false;
    if (!r.ok) { msg.textContent = r.error.code === 'OFFLINE' ? 'Tạo phiếu cần có mạng' : (r.error.message || 'Lỗi'); return; }
    showTickets(r.data);
    loadBatches();
    sync.syncNow();
  });

  loadBatches();
}
