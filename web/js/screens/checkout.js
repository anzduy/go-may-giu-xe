// Màn hình TRẢ XE: quét QR hoặc gõ số → xem ảnh lúc vào → bấm "TRẢ XE" (tự chụp ảnh lúc ra).
import * as db from '../db.js';
import * as sync from '../sync.js';
import { managedCamera, captureJpeg, captureViaInput } from '../camera.js';
import { startScan } from '../scanner.js';
import { h, toast, uuid, timeVN, dateVN, asyncPhoto, fill } from '../ui.js';
import { formatNo, parseTypedNumber, parseQr, validateForCheckout, ticketMessage, maxTicketNo } from '../../shared/ticket.js';
import { VEHICLE_TYPES, formatMoney } from '../../shared/pricing.js';

export async function render(root, ctx) {
  const today = ctx.today();
  let cam = null;
  let stopScan = null;
  let busy = false;

  const video = h('video', { id: 'cam', autoplay: true, muted: true, playsinline: true });
  const sleepCover = h('button', { type: 'button', class: 'cam-sleep hidden', id: 'cam-sleep' }, '📷 Camera đang nghỉ cho đỡ nóng máy — chạm để bật');
  const camBox = h('div', { class: 'camera' }, video, sleepCover, h('div', { class: 'frame' }, h('span', {}, 'Đưa mã QR trên phiếu vào khung')));
  const view = h('div', { id: 'checkout-view' });
  const bottom = h('div', { class: 'bottom-bar hidden' });
  fill(root, view, bottom);

  // Camera tự nghỉ sau 1 phút không thao tác / khi app chạy nền; chạm màn hình hoặc bấm TRẢ XE là bật lại.
  let camFailed = false;
  const camCtl = managedCamera(video, {
    onState(state, c) {
      sleepCover.classList.toggle('hidden', state !== 'sleep');
      cam = state === 'on' ? c : null;
      if (state === 'error') camFailed = true;
    },
  });
  sleepCover.addEventListener('click', () => camCtl.ensure());
  root.addEventListener('pointerdown', () => { if (camCtl.awake) camCtl.bump(); });
  camCtl.ensure();

  async function takePhoto() {
    if (!camFailed) await camCtl.ensure();
    if (cam && video.videoWidth) {
      camBox.classList.remove('flash'); void camBox.offsetWidth; camBox.classList.add('flash');
      return captureJpeg(video);
    }
    return captureViaInput();
  }

  function scanning(on) {
    if (stopScan) { stopScan(); stopScan = null; }
    if (on) {
      stopScan = startScan(video, (text) => {
        const r = parseQr(text, ctx.qrSecret);
        if (!r.ok) { showMessage(ticketMessage('TICKET_INVALID')); return; }
        find({ ticketDate: r.date, ticketNo: r.no }, true);
      });
    }
  }

  // ---------- bước 1: tìm phiếu ----------
  const msg = h('div', { id: 'checkout-msg', class: 'error-text' });
  const extra = h('div', { id: 'checkout-extra' });

  function showMessage(text, node) {
    msg.textContent = text || '';
    fill(extra, ...(node ? [node] : []));
  }

  function lookup() {
    bottom.classList.add('hidden');
    const input = h('input', { id: 'typed-no', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4', placeholder: 'Số phiếu', autocomplete: 'off' });
    const go = h('button', { type: 'button', id: 'find-btn', class: 'primary' }, 'Tìm');
    const submit = () => {
      const n = parseTypedNumber(input.value);
      if (!n) { showMessage('Gõ số in trên phiếu, ví dụ 37'); return; }
      find({ ticketNo: n }, false);
    };
    go.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    fill(view, 
      h('div', { class: 'ticket-label' }, 'Quét mã QR trên phiếu — hoặc gõ số phiếu'),
      camBox,
      h('div', { class: 'keypad-row', style: 'margin-top:10px' }, input, go),
      msg, extra,
    );
    showMessage('');
    scanning(true);
  }

  async function find(q, viaQr) {
    const sessions = await db.allSessions();
    const r = validateForCheckout(sessions, q);
    if (r.ok) {
      if (r.matches.length === 1) confirm(r.matches[0]);
      else choose(r.matches);
      return;
    }
    const no = q.ticketNo;
    if (r.error === 'TICKET_USED') {
      const s = r.session;
      showMessage(s.status === 'provisional' ? `Phiếu ${formatNo(no)} đã trả xe tạm lúc ${timeVN(s.outAt)}` : `Phiếu đã trả xe lúc ${timeVN(s.outAt)}`);
      return;
    }
    if (r.error === 'TICKET_LOST') { showMessage(`Phiếu đã báo mất, xe đã trả lúc ${timeVN(r.session.outAt)}`); return; }
    // Chưa có lượt gửi nào trên máy này.
    const batches = await db.getMeta('batches', []);
    const ticketDate = q.ticketDate || today;
    const plausible = viaQr || no <= maxTicketNo(batches, ticketDate);
    if (!plausible) { showMessage(ticketMessage('SESSION_NOT_FOUND')); return; }
    const retry = h('button', { type: 'button', class: 'small' }, '⟳ Đồng bộ lại');
    const prov = h('button', { type: 'button', class: 'small ghost', id: 'provisional-btn' }, 'Trả xe tạm');
    retry.addEventListener('click', async () => { await sync.syncNow(); find(q, viaQr); });
    prov.addEventListener('click', () => provisional(ticketDate, no));
    showMessage(ticketMessage('SESSION_NOT_FOUND'), h('div', { class: 'card' },
      h('p', {}, 'Nếu xe vừa gửi ở máy khác: chưa có dữ liệu phiếu này, chờ đồng bộ.'),
      h('div', { class: 'row' }, retry, prov)));
  }

  // ---------- nhiều lượt cùng số: chọn ----------
  async function choose(matches) {
    scanning(false);
    const items = await Promise.all(matches.map(async (s) => {
      const btn = h('button', { type: 'button', class: 'item', style: 'width:100%' },
        asyncPhoto(s.inPhotoId, 'Ảnh lúc vào', db.getPhotoResult, { zoom: false }),
        h('div', {}, h('div', { class: 'info-line' }, `Phiếu ${formatNo(s.ticketNo)}`),
          h('div', { class: 'muted' }, `Ngày ${dateVN(s.ticketDate)} · vào ${timeVN(s.inAt)}`)));
      btn.addEventListener('click', () => confirm(s));
      return btn;
    }));
    fill(view, h('div', { class: 'banner warn' }, `Có ${matches.length} xe cùng số phiếu — chọn đúng xe theo ảnh và ngày`),
      h('div', { class: 'list', id: 'choose-list' }, items),
      h('button', { type: 'button', style: 'width:100%;margin-top:10px', onclick: lookup }, '← Quay lại'));
  }

  // ---------- bước 2: xác nhận và trả xe ----------
  async function confirm(session) {
    scanning(false);
    const staffNames = await db.getMeta('staffNames', {});
    const otherDay = session.ticketDate !== today ? ` · phiếu ngày ${dateVN(session.ticketDate)}` : '';
    fill(view, 
      h('div', { class: 'split' },
        h('div', {}, h('div', { class: 'ticket-label' }, 'Ảnh lúc vào'), asyncPhoto(session.inPhotoId, 'Ảnh xe lúc vào', db.getPhotoResult)),
        h('div', { class: 'card', id: 'confirm-info' },
          h('div', { class: 'info-line' }, `Phiếu ${formatNo(session.ticketNo)}${session.plate ? ` · ${session.plate}` : ''}`),
          session.inSummary ? h('div', { class: 'warn-text', id: 'in-summary' }, session.inSummary) : null,
          h('div', { class: 'muted' }, `${VEHICLE_TYPES[session.vehicleType] || 'Xe'} · vào ${timeVN(session.inAt)}${otherDay}`
            + `${staffNames[session.inStaffId] ? ` · ${staffNames[session.inStaffId]} nhận` : ''}`),
          h('div', { class: 'fee' }, `Thu ${formatMoney(session.priceAtIn)}`),
          session.conflict ? h('div', { class: 'error-text' }, `Lưu ý: lượt này có xung đột (${session.conflict}) — quản lý sẽ kiểm tra`) : null),
        h('div', {}, h('div', { class: 'ticket-label' }, 'Camera (tự chụp ảnh lúc ra khi bấm TRẢ XE)'), camBox)),
    );
    const doneBtn = h('button', { type: 'button', id: 'checkout-btn', class: 'primary' }, '✔ TRẢ XE');
    const mismatch = h('button', { type: 'button', id: 'mismatch-btn', class: 'danger' }, 'Không khớp');
    const back = h('button', { type: 'button', class: 'back', 'aria-label': 'Quay lại' }, '←');
    back.addEventListener('click', lookup);
    mismatch.addEventListener('click', () => {
      toast('Không trả xe. Kiểm tra giấy tờ xe và tìm đúng xe trong bãi.', { ms: 5000, error: true });
      ctx.navigate(`#lot?mode=lost&session=${encodeURIComponent(session.id)}`);
    });
    doneBtn.addEventListener('click', () => checkout(session));
    fill(bottom, back, mismatch, doneBtn);
    bottom.classList.remove('hidden');
  }

  async function checkout(session) {
    if (busy) return;
    busy = true;
    try {
      const blob = await takePhoto();
      if (!blob) return;
      const outAt = ctx.nowIso();
      const photoId = uuid();
      const updated = { ...session, status: 'returned', outAt, outStaffId: ctx.staff.id, outPhotoId: photoId, fee: session.priceAtIn };
      await db.commit({
        sessions: [updated],
        photos: [{ id: photoId, sessionId: session.id, kind: 'out', takenAt: outAt, deviceId: ctx.deviceId, blob, uploadState: 'pending', attempts: 0 }],
        ops: [{ opId: uuid(), type: 'checkout', createdAt: outAt, payload: { sessionId: session.id, outAt, outPhotoId: photoId } }],
      });
      sync.kick();
      ctx.changed();
      toast(`✔ Đã trả xe phiếu ${formatNo(session.ticketNo)} · Thu ${formatMoney(updated.fee)}`, { ms: 4000 });
      lookup();
    } finally {
      busy = false;
    }
  }

  // ---------- trả xe tạm (máy chưa có dữ liệu lượt gửi) ----------
  function provisional(ticketDate, no) {
    scanning(false);
    const note = h('textarea', { id: 'provisional-note', rows: '3', placeholder: 'Ví dụ: máy cổng vào mất mạng, đã xem giấy tờ xe' });
    const go = h('button', { type: 'button', class: 'primary', id: 'provisional-go' }, 'Chụp & trả xe tạm');
    const err = h('div', { class: 'error-text' });
    go.addEventListener('click', async () => {
      if (!note.value.trim()) { err.textContent = 'Bắt buộc ghi chú lý do'; return; }
      const blob = await takePhoto();
      if (!blob) return;
      const outAt = ctx.nowIso();
      const id = uuid();
      const photoId = uuid();
      const s = { id, ticketDate, ticketNo: no, noTicket: false, status: 'provisional', outAt, outStaffId: ctx.staff.id, outPhotoId: photoId, note: note.value.trim(), fee: null };
      await db.commit({
        sessions: [s],
        photos: [{ id: photoId, sessionId: id, kind: 'out', takenAt: outAt, deviceId: ctx.deviceId, blob, uploadState: 'pending', attempts: 0 }],
        ops: [{ opId: uuid(), type: 'provisionalCheckout', createdAt: outAt, payload: { id, ticketDate, ticketNo: no, outAt, outPhotoId: photoId, note: s.note } }],
      });
      sync.kick();
      ctx.changed();
      toast(`Đã trả xe tạm phiếu ${formatNo(no)} — sẽ tự ghép khi đồng bộ`, { ms: 4000 });
      lookup();
    });
    fill(view, 
      h('div', { class: 'banner warn' }, `Trả xe tạm — phiếu ${formatNo(no)} (ngày ${dateVN(ticketDate)})`),
      h('p', {}, 'Kiểm tra giấy tờ xe trước. App sẽ chụp ảnh xe lúc ra và tự ghép với lượt gửi khi máy cổng vào đồng bộ.'),
      camBox, h('label', { for: 'provisional-note' }, 'Ghi chú (bắt buộc)'), note, err,
      h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { type: 'button', onclick: lookup }, '← Quay lại'), go),
    );
  }

  lookup();
  return () => {
    if (stopScan) stopScan();
    camCtl.close();
  };
}
