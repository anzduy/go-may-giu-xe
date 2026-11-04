// XE TRONG BÃI: lưới ảnh các xe đang gửi (mới nhất trước), tìm theo số phiếu hoặc biển số.
// Chạm vào xe → "Trả xe – mất phiếu" (ghi chú bắt buộc, thu phí mất phiếu, chụp ảnh ra) hoặc "Gán lại số phiếu".
import * as db from '../db.js';
import * as sync from '../sync.js';
import { start as startCamera, captureJpeg, captureViaInput } from '../camera.js';
import { h, toast, uuid, timeVN, dateVN, asyncPhoto, fill } from '../ui.js';
import { hashParams } from '../ctx.js';
import { formatNo, parseTypedNumber } from '../../shared/ticket.js';
import { normalizePlate } from '../../shared/sessions.js';
import { lostFee, formatMoney, VEHICLE_TYPES } from '../../shared/pricing.js';

export async function render(root, ctx) {
  const params = hashParams();
  const today = ctx.today();
  const search = h('input', { id: 'lot-search', placeholder: 'Tìm số phiếu hoặc vài số cuối biển số', inputmode: 'search', autocomplete: 'off' });
  const grid = h('div', { class: 'grid', id: 'lot-grid' });
  const count = h('div', { class: 'muted' });
  const panel = h('div', { id: 'lot-panel' });
  let cam = null;
  const top = [];
  if (params.mode === 'lost') {
    top.push(h('div', { class: 'banner warn', id: 'lost-banner' },
      'Không khớp / mất phiếu: tìm đúng xe khách chỉ trong lưới ảnh, kiểm tra giấy tờ xe, rồi chạm vào xe để trả xe mất phiếu.'));
  }
  fill(root, ...top, panel, search, count, grid);

  function closePanel() {
    if (cam) { cam.stop(); cam = null; }
    fill(panel, );
  }

  async function paint() {
    const q = search.value.trim();
    const qPlate = normalizePlate(q);
    let list = (await db.allSessions()).filter((s) => s.status === 'in_lot');
    if (q) list = list.filter((s) => String(s.ticketNo) === String(Number(q)) || formatNo(s.ticketNo).includes(q) || (qPlate && normalizePlate(s.plate).includes(qPlate)));
    list.sort((a, b) => String(b.inAt).localeCompare(String(a.inAt)));
    count.textContent = `${list.length} xe`;
    fill(grid, ...list.map((s) =>
      h('button', { type: 'button', class: 'tile', 'data-id': s.id, onclick: () => select(s.id) },
        asyncPhoto(s.inPhotoId, `Phiếu ${formatNo(s.ticketNo)}`, db.getPhotoResult, { zoom: false }),
        h('div', {}, h('b', {}, `Phiếu ${formatNo(s.ticketNo)}`), ` · ${timeVN(s.inAt)}`,
          s.ticketDate !== today ? h('div', { class: 'warn-text' }, `Tồn từ ${dateVN(s.ticketDate)}`) : null,
          s.plate ? h('div', { class: 'muted' }, s.plate) : null))));
  }

  async function select(id) {
    closePanel();
    const s = await db.getSession(id);
    if (!s || s.status !== 'in_lot') return;
    const lostBtn = h('button', { type: 'button', class: 'danger', id: 'lost-btn' }, 'Trả xe – mất phiếu');
    const reBtn = h('button', { type: 'button', id: 'reassign-btn' }, 'Gán lại số phiếu');
    const detailBtn = h('button', { type: 'button', class: 'ghost small', onclick: () => ctx.navigate(`#session?id=${encodeURIComponent(s.id)}`) }, 'Xem chi tiết');
    fill(panel, h('div', { class: 'card', id: 'lot-selected' },
      h('div', { class: 'info-line' }, `Phiếu ${formatNo(s.ticketNo)}${s.plate ? ` · ${s.plate}` : ''}`),
      h('div', { class: 'muted' }, `${VEHICLE_TYPES[s.vehicleType] || ''} · vào ${timeVN(s.inAt)} ngày ${dateVN(s.ticketDate)}${s.inSummary ? ` · ${s.inSummary}` : ''}`),
      asyncPhoto(s.inPhotoId, 'Ảnh lúc vào', db.getPhotoResult),
      h('div', { class: 'row', style: 'margin-top:10px' }, lostBtn, reBtn),
      h('div', { class: 'row', style: 'margin-top:8px' }, detailBtn, h('button', { type: 'button', class: 'ghost small', onclick: closePanel }, 'Đóng'))));
    lostBtn.addEventListener('click', () => lostFlow(s));
    reBtn.addEventListener('click', () => reassignFlow(s));
    window.scrollTo(0, 0);
  }

  async function lostFlow(s) {
    const prices = await db.getMeta('prices', []);
    const fee = lostFee(prices, ctx.nowIso());
    const video = h('video', { autoplay: true, muted: true, playsinline: true });
    const camBox = h('div', { class: 'camera' }, video, h('div', { class: 'frame' }, h('span', {}, 'Chụp xe + người nhận xe')));
    const note = h('textarea', { id: 'lost-note', rows: '3', placeholder: 'Ví dụ: đã xem cà vẹt, tên Nguyễn Văn A, SĐT …' });
    const err = h('div', { class: 'error-text', id: 'lost-error' });
    const go = h('button', { type: 'button', class: 'primary', id: 'lost-go' }, `Chụp & trả xe · thu ${formatMoney(fee)}`);
    fill(panel, h('div', { class: 'card' },
      h('div', { class: 'banner danger' }, `Trả xe MẤT PHIẾU — phiếu ${formatNo(s.ticketNo)} · thu ${formatMoney(fee)}`),
      h('p', {}, 'Kiểm tra giấy tờ xe (cà vẹt, CCCD) trước khi trả.'),
      h('label', { for: 'lost-note' }, 'Ghi chú (bắt buộc)'), note, err, camBox,
      h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { type: 'button', onclick: closePanel }, 'Hủy'), go)));
    const camReady = startCamera(video).then((c) => { cam = c; }).catch(() => { cam = null; });
    go.addEventListener('click', async () => {
      if (!note.value.trim()) { err.textContent = 'Bắt buộc ghi chú (đã kiểm tra giấy tờ gì)'; return; }
      go.disabled = true;
      try {
        await camReady;
        const blob = cam && video.videoWidth ? await captureJpeg(video) : await captureViaInput();
        if (!blob) return;
        const outAt = ctx.nowIso();
        const photoId = uuid();
        const updated = { ...s, status: 'lost', outAt, outStaffId: ctx.staff.id, outPhotoId: photoId, fee, note: note.value.trim() };
        await db.commit({
          sessions: [updated],
          photos: [{ id: photoId, sessionId: s.id, kind: 'out', takenAt: outAt, deviceId: ctx.deviceId, blob, uploadState: 'pending', attempts: 0 }],
          ops: [{ opId: uuid(), type: 'lostCheckout', createdAt: outAt, payload: { sessionId: s.id, outAt, outPhotoId: photoId, note: updated.note } }],
        });
        sync.kick();
        ctx.changed();
        toast(`✔ Đã trả xe mất phiếu ${formatNo(s.ticketNo)} · thu ${formatMoney(fee)}`, { ms: 4000 });
        closePanel();
        paint();
      } finally {
        go.disabled = false;
      }
    });
  }

  function reassignFlow(s) {
    const no = h('input', { id: 'reassign-no', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4', placeholder: 'Số đúng trên phiếu khách cầm' });
    const note = h('input', { id: 'reassign-note', placeholder: 'Lý do, ví dụ: lúc gửi đưa nhầm phiếu' });
    const err = h('div', { class: 'error-text', id: 'reassign-error' });
    const go = h('button', { type: 'button', class: 'primary', id: 'reassign-go' }, 'Lưu số mới');
    fill(panel, h('div', { class: 'card' },
      h('div', { class: 'info-line' }, `Gán lại số cho xe đang ghi phiếu ${formatNo(s.ticketNo)}`),
      h('label', { for: 'reassign-no' }, 'Số phiếu mới'), no,
      h('label', { for: 'reassign-note' }, 'Ghi chú (bắt buộc)'), note, err,
      h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { type: 'button', onclick: closePanel }, 'Hủy'), go)));
    go.addEventListener('click', async () => {
      const n = parseTypedNumber(no.value);
      if (!n) { err.textContent = 'Gõ số phiếu mới'; return; }
      if (!note.value.trim()) { err.textContent = 'Bắt buộc ghi chú lý do'; return; }
      const all = await db.allSessions();
      const clash = all.find((x) => x.id !== s.id && x.status === 'in_lot' && x.ticketDate === s.ticketDate && Number(x.ticketNo) === n);
      if (clash) { err.textContent = `Phiếu ${formatNo(n)} đang có xe khác trong bãi`; return; }
      const createdAt = ctx.nowIso();
      const updated = { ...s, ticketNo: n, note: [s.note, `Gán lại số ${s.ticketNo}→${n}: ${note.value.trim()}`].filter(Boolean).join(' | ') };
      delete updated.conflict;
      await db.commit({ sessions: [updated], ops: [{ opId: uuid(), type: 'reassignTicket', createdAt, payload: { sessionId: s.id, ticketNo: n, note: note.value.trim() } }] });
      sync.kick();
      ctx.changed();
      toast(`Đã gán lại phiếu ${formatNo(s.ticketNo)} → ${formatNo(n)}`);
      closePanel();
      paint();
    });
  }

  search.addEventListener('input', paint);
  // Đồng bộ ngầm chạy mỗi 3 giây: chỉ vẽ lại lưới khi danh sách xe THẬT SỰ đổi (không thì ảnh đang tải bị vẽ lại mãi).
  let lastSig = '';
  const signature = async () => (await db.allSessions()).filter((s) => s.status === 'in_lot')
    .map((s) => `${s.id}:${s.ticketNo}:${s.plate || ''}:${s.inSummary || ''}`).sort().join('|');
  const onSync = async () => {
    const sig = await signature();
    if (sig !== lastSig) { lastSig = sig; paint(); }
  };
  window.addEventListener('sync:changed', onSync);
  lastSig = await signature();
  await paint();
  return () => { window.removeEventListener('sync:changed', onSync); closePanel(); };
}
