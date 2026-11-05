// Màn hình TRẢ XE: quét QR hoặc gõ số → so xe với ảnh lúc vào → bấm "CHO XE RA" → hiện thẻ xanh "ĐÃ CHO XE RA".
// Ảnh lúc ra KHÔNG bắt buộc: nút "Chụp ảnh xe ra" riêng khi muốn lưu thêm bằng chứng (có ảnh thì app so biển số / màu
// với lúc vào và cảnh báo nếu khác). Mất phiếu và trả xe tạm vẫn BẮT BUỘC chụp ảnh.
import * as db from '../db.js';
import * as sync from '../sync.js';
import { managedCamera, captureJpeg, captureViaInput } from '../camera.js';
import { startScan } from '../scanner.js';
import { h, toast, uuid, timeVN, dateVN, asyncPhoto, fill } from '../ui.js';
import { formatNo, parseTypedNumber, parseQr, validateForCheckout, ticketMessage, maxTicketNo, dateKey as dateKeyOf } from '../../shared/ticket.js';
import { VEHICLE_TYPES, formatMoney } from '../../shared/pricing.js';
import { ensureLocalAnalysis } from '../analysis.js';
import { checkoutPayment, dueAtOut, PAY_METHODS, inMethod } from '../../shared/payment.js';
import { methodPicker } from '../pay-ui.js';

export async function render(root, ctx) {
  const today = ctx.today();
  let cam = null;
  let stopScan = null;
  let busy = false;

  const video = h('video', { id: 'cam', autoplay: true, muted: true, playsinline: true });
  const sleepCover = h('button', { type: 'button', class: 'cam-sleep hidden', id: 'cam-sleep' }, '📷 Camera đang nghỉ cho đỡ nóng máy — chạm để bật');
  const frameLabel = h('span', {}, 'Đưa mã QR trên phiếu vào khung');
  const camBox = h('div', { class: 'camera' }, video, sleepCover, h('div', { class: 'frame' }, frameLabel));
  let lastDone = null; // xe vừa cho ra → thẻ xanh ở đầu màn hình cho tới khi xử lý xe khác
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

  function doneCard(d) {
    return h('div', { class: 'done-card', id: 'checkout-done', role: 'status' },
      h('div', { class: 'done-big' }, `✔ ĐÃ CHO XE RA — Phiếu ${formatNo(d.no)}`),
      h('div', {}, [timeVN(d.at), d.plate, d.money, d.photo ? 'có ảnh lúc ra' : ''].filter(Boolean).join(' · ')));
  }

  function lookup() {
    bottom.classList.add('hidden');
    frameLabel.textContent = 'Đưa mã QR trên phiếu vào khung';
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
      lastDone ? doneCard(lastDone) : null,
      h('div', { class: 'ticket-label' }, lastDone ? 'Xe tiếp theo: quét mã QR — hoặc gõ số phiếu' : 'Quét mã QR trên phiếu — hoặc gõ số phiếu'),
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
      const names = await db.getMeta('staffNames', {});
      const who = names[s.outStaffId] ? ` (${names[s.outStaffId]} trả)` : '';
      showMessage('', h('div', { class: 'banner danger', id: 'already-out' },
        s.status === 'provisional' ? `⛔ Phiếu ${formatNo(no)} đã trả xe tạm lúc ${timeVN(s.outAt)}${who}`
          : `⛔ Phiếu ${formatNo(no)}: xe ĐÃ RA lúc ${timeVN(s.outAt)} ngày ${dateVN(dateKeyOf(s.outAt))}${who} — KHÔNG trả xe lần nữa`));
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

  // ---------- bước 2: so xe với ảnh lúc vào → cho xe ra ----------
  async function confirm(session) {
    scanning(false);
    lastDone = null;
    const picker = methodPicker();
    const staffNames = await db.getMeta('staffNames', {});
    const otherDay = session.ticketDate !== today ? ` · phiếu ngày ${dateVN(session.ticketDate)}` : '';
    let outBlob = null; // ảnh lúc ra (không bắt buộc)
    const photoBox = h('div', { id: 'out-photo-box', style: 'margin-top:8px' });
    const paintPhoto = () => {
      if (outBlob) {
        const img = h('img', { class: 'photo', id: 'out-photo-preview', alt: 'Ảnh lúc ra', src: URL.createObjectURL(outBlob) });
        fill(photoBox, h('div', { class: 'ticket-label' }, '✔ Đã chụp ảnh lúc ra'), img,
          h('div', { class: 'row', style: 'margin-top:6px' },
            h('button', { type: 'button', class: 'small', onclick: openCamera }, '📷 Chụp lại'),
            h('button', { type: 'button', class: 'small ghost', id: 'out-photo-remove', onclick: () => { outBlob = null; paintPhoto(); } }, 'Bỏ ảnh')));
      } else {
        fill(photoBox, h('button', { type: 'button', class: 'small', id: 'out-photo-btn', style: 'width:100%', onclick: openCamera }, '📷 Chụp ảnh xe ra (không bắt buộc)'));
      }
    };
    function openCamera() {
      frameLabel.textContent = 'Chụp xe + biển số';
      const shoot = h('button', { type: 'button', class: 'primary', id: 'out-photo-shoot' }, '📸 Chụp');
      shoot.addEventListener('click', async () => {
        shoot.disabled = true;
        try { const b = await takePhoto(); if (b) outBlob = b; } finally { paintPhoto(); }
      });
      fill(photoBox, camBox, h('div', { class: 'row', style: 'margin-top:6px' },
        h('button', { type: 'button', class: 'small ghost', onclick: paintPhoto }, 'Hủy'), shoot));
      camCtl.ensure();
    }
    paintPhoto();
    fill(view, 
      h('div', { class: 'split' },
        h('div', {}, h('div', { class: 'ticket-label' }, 'Ảnh lúc vào — so với xe khách dắt ra'), asyncPhoto(session.inPhotoId, 'Ảnh xe lúc vào', db.getPhotoResult)),
        h('div', { class: 'card', id: 'confirm-info' },
          h('div', { class: 'info-line' }, `Phiếu ${formatNo(session.ticketNo)}${session.plate ? ` · ${session.plate}` : ''}`),
          session.inSummary ? h('div', { class: 'warn-text', id: 'in-summary' }, session.inSummary) : null,
          h('div', { class: 'muted' }, `${VEHICLE_TYPES[session.vehicleType] || 'Xe'} · vào ${timeVN(session.inAt)}${otherDay}`
            + `${staffNames[session.inStaffId] ? ` · ${staffNames[session.inStaffId]} nhận` : ''}`),
          ...feeBlock(session, picker),
          session.conflict ? h('div', { class: 'error-text' }, `Lưu ý: lượt này có xung đột (${session.conflict}) — quản lý sẽ kiểm tra`) : null,
          photoBox)),
    );
    const doneBtn = h('button', { type: 'button', id: 'checkout-btn', class: 'primary' }, '✔ CHO XE RA');
    const mismatch = h('button', { type: 'button', id: 'mismatch-btn', class: 'danger' }, 'Không khớp');
    const back = h('button', { type: 'button', class: 'back', 'aria-label': 'Quay lại' }, '←');
    back.addEventListener('click', lookup);
    mismatch.addEventListener('click', () => {
      toast('Không trả xe. Kiểm tra giấy tờ xe và tìm đúng xe trong bãi.', { ms: 5000, error: true });
      ctx.navigate(`#lot?mode=lost&session=${encodeURIComponent(session.id)}`);
    });
    doneBtn.addEventListener('click', async () => {
      doneBtn.disabled = true; // chống bấm 2 lần
      try { await checkout(session, picker.value, outBlob); } finally { doneBtn.disabled = false; }
    });
    fill(bottom, back, mismatch, doneBtn);
    bottom.classList.remove('hidden');
  }

  /** Đã thu lúc gửi → báo "không thu nữa"; chưa thu → số tiền + chọn tiền mặt / chuyển khoản. */
  function feeBlock(session, picker) {
    const due = dueAtOut(session.priceAtIn, session);
    if (!due) {
      return [h('div', { class: 'fee prepaid', id: 'fee-due' }, `✔ Đã trả lúc gửi (${PAY_METHODS[inMethod(session)].toLowerCase()}) — không thu nữa`)];
    }
    return [h('div', { class: 'fee', id: 'fee-due' }, `Thu ${formatMoney(due)}`), picker.el];
  }

  async function checkout(session, method, blob) {
    if (busy) return;
    busy = true;
    try {
      const fresh = await db.getSession(session.id); // máy khác vừa trả xe này (đồng bộ ngầm) → không trả lần nữa
      if (!fresh || fresh.status !== 'in_lot') { lookup(); find({ ticketDate: session.ticketDate, ticketNo: session.ticketNo }, true); return; }
      const outAt = ctx.nowIso();
      const photoId = blob ? uuid() : null;
      const updated = { ...fresh, status: 'returned', outAt, outStaffId: ctx.staff.id, ...(photoId ? { outPhotoId: photoId } : {}),
        ...checkoutPayment(fresh, fresh.priceAtIn, method) };
      await db.commit({
        sessions: [updated],
        photos: photoId ? [{ id: photoId, sessionId: session.id, kind: 'out', takenAt: outAt, deviceId: ctx.deviceId, blob, uploadState: 'pending', attempts: 0 }] : [],
        ops: [{ opId: uuid(), type: 'checkout', createdAt: outAt, payload: { sessionId: session.id, outAt, ...(photoId ? { outPhotoId: photoId } : {}), payMethod: method } }],
      });
      if (photoId) ensureLocalAnalysis(photoId);
      sync.kick();
      ctx.changed();
      if (navigator.vibrate) navigator.vibrate(80);
      lastDone = { no: session.ticketNo, at: outAt, plate: session.plate || '', photo: !!photoId,
        money: updated.outPaid ? `đã thu ${formatMoney(updated.outPaid)}${method === 'transfer' ? ' chuyển khoản' : ' tiền mặt'}` : 'đã trả lúc gửi' };
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
    const picker = methodPicker('pay-provisional');
    const err = h('div', { class: 'error-text' });
    go.addEventListener('click', async () => {
      if (!note.value.trim()) { err.textContent = 'Bắt buộc ghi chú lý do'; return; }
      const blob = await takePhoto();
      if (!blob) return;
      const outAt = ctx.nowIso();
      const id = uuid();
      const photoId = uuid();
      const s = { id, ticketDate, ticketNo: no, noTicket: false, status: 'provisional', outAt, outStaffId: ctx.staff.id, outPhotoId: photoId, note: note.value.trim(), fee: null, outPayMethod: picker.value };
      await db.commit({
        sessions: [s],
        photos: [{ id: photoId, sessionId: id, kind: 'out', takenAt: outAt, deviceId: ctx.deviceId, blob, uploadState: 'pending', attempts: 0 }],
        ops: [{ opId: uuid(), type: 'provisionalCheckout', createdAt: outAt, payload: { id, ticketDate, ticketNo: no, outAt, outPhotoId: photoId, note: s.note, payMethod: picker.value } }],
      });
      ensureLocalAnalysis(photoId);
      sync.kick();
      ctx.changed();
      toast(`Đã trả xe tạm phiếu ${formatNo(no)} — sẽ tự ghép khi đồng bộ`, { ms: 4000 });
      lookup();
    });
    fill(view, 
      h('div', { class: 'banner warn' }, `Trả xe tạm — phiếu ${formatNo(no)} (ngày ${dateVN(ticketDate)})`),
      h('p', {}, 'Kiểm tra giấy tờ xe trước. App sẽ chụp ảnh xe lúc ra và tự ghép với lượt gửi khi máy cổng vào đồng bộ. Khách nói đã trả lúc gửi thì không thu (app tự đối chiếu khi ghép).'),
      camBox, h('label', {}, 'Nếu thu tiền: khách trả bằng'), picker.el, h('label', { for: 'provisional-note' }, 'Ghi chú (bắt buộc)'), note, err,
      h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { type: 'button', onclick: lookup }, '← Quay lại'), go),
    );
  }

  lookup();
  return () => {
    if (stopScan) stopScan();
    camCtl.close();
  };
}
