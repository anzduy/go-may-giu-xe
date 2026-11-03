// Màn hình GỬI XE: số phiếu tự nhảy + camera mở sẵn → chỉ cần bấm CHỤP (1 chạm).
// Không bao giờ chờ mạng: mọi thứ ghi vào máy trước, đồng bộ chạy ngầm.
import * as db from '../db.js';
import * as sync from '../sync.js';
import { managedCamera, captureJpeg, captureViaInput } from '../camera.js';
import { startScan } from '../scanner.js';
import { h, toast, uuid } from '../ui.js';
import {
  formatNo, parseTypedNumber, parseQr, suggestNext, blockedNumbers, validateForCheckin,
  maxTicketNo, remainingTickets, ticketMessage,
} from '../../shared/ticket.js';
import { findPlateDuplicate } from '../../shared/sessions.js';
import { VEHICLE_TYPES, priceFor } from '../../shared/pricing.js';

const UNDO_MS = 10000;

export async function render(root, ctx) {
  const today = ctx.today();
  let sessions = await db.allSessions();
  let batches = await db.getMeta('batches', []);
  const prices = await db.getMeta('prices', []);
  let lastNo = await db.getMeta(`lastNo:${today}`, 0);
  let current = suggestNext(lastNo, blockedNumbers(sessions, today));
  let edited = false;
  let noTicket = false;
  let vehicleType = 'motorbike';
  let cam = null;
  let stopScan = null;
  let busy = false;

  // ---------- giao diện ----------
  const banner = h('div', { id: 'stock-banner', class: 'banner' });
  const label = h('div', { class: 'ticket-label', id: 'ticket-label' }, 'Phiếu tiếp theo (chạm để sửa)');
  const numberInput = h('input', {
    id: 'ticket-no', class: 'ticket-no', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4',
    'aria-label': 'Số phiếu', autocomplete: 'off',
  });
  const error = h('div', { id: 'checkin-error', class: 'error-text' });
  const warn = h('div', { id: 'checkin-warn', class: 'warn-text' });
  const plateDup = h('div', { id: 'plate-dup', class: 'banner warn hidden' });
  const video = h('video', { id: 'cam', autoplay: true, muted: true, playsinline: true });
  const camMsg = h('div', { class: 'photo-missing hidden', id: 'cam-msg' });
  const torchBtn = h('button', { type: 'button', class: 'hidden', title: 'Đèn' }, '🔦');
  const scanBtn = h('button', { type: 'button', id: 'scan-btn', title: 'Quét phiếu để lấy số' }, '▦ Quét phiếu');
  const sleepCover = h('button', { type: 'button', class: 'cam-sleep hidden', id: 'cam-sleep' }, '📷 Camera đang nghỉ cho đỡ nóng máy — chạm để bật');
  const camBox = h('div', { class: 'camera' }, video, sleepCover,
    h('div', { class: 'frame' }, h('span', {}, 'Biển số + chỗ treo mũ')),
    h('div', { class: 'cam-tools' }, scanBtn, torchBtn));
  const typeBtns = Object.entries(VEHICLE_TYPES).map(([k, name]) =>
    h('button', { type: 'button', 'data-type': k, onclick: () => { vehicleType = k; paint(); } }, name));
  const noTicketBtn = h('button', { type: 'button', id: 'no-ticket-btn', class: 'ghost small', style: 'width:100%' }, 'Gửi xe không phiếu (hết phiếu)');
  const captureBtn = h('button', { type: 'button', id: 'capture', class: 'primary' }, '📷 CHỤP — GỬI XE');

  root.replaceChildren(
    banner, plateDup, label, numberInput, error, warn,
    h('div', { class: 'segmented' }, typeBtns),
    camBox, camMsg,
    h('div', { style: 'margin-top:10px' }, noTicketBtn),
    h('div', { class: 'bottom-bar' }, captureBtn),
  );

  // ---------- trạng thái & kiểm tra ----------
  function validation() {
    return validateForCheckin({ ticketDate: today, ticketNo: current, noTicket }, { today, sessions, batches });
  }

  function paint() {
    const maxNo = maxTicketNo(batches, today);
    const remaining = remainingTickets(batches, sessions, today);
    if (!maxNo) {
      banner.className = 'banner info';
      banner.textContent = 'Chưa có bộ phiếu cho hôm nay — quản lý vào mục "In phiếu" (vẫn gửi xe được)';
    } else if (current > maxNo && !noTicket) {
      banner.className = 'banner danger';
      banner.textContent = 'Đã hết phiếu hôm nay — quản lý tạo thêm phiếu ở mục "In phiếu", hoặc dùng "Gửi xe không phiếu"';
    } else {
      banner.className = remaining < 20 ? 'banner warn' : 'banner';
      banner.textContent = `Còn ${remaining} phiếu`;
    }
    if (document.activeElement !== numberInput) numberInput.value = formatNo(current);
    numberInput.classList.toggle('huge', noTicket);
    label.textContent = noTicket ? 'GỬI XE KHÔNG PHIẾU — ghi số này lên giấy cho khách' : 'Phiếu tiếp theo (chạm để sửa)';
    noTicketBtn.textContent = noTicket ? 'Hủy — quay lại dùng phiếu in sẵn' : 'Gửi xe không phiếu (hết phiếu)';
    typeBtns.forEach((b) => b.classList.toggle('on', b.dataset.type === vehicleType));
    scanBtn.classList.toggle('on', !!stopScan);
    const v = validation();
    error.textContent = v.ok ? '' : ticketMessage(v.error, current);
    warn.textContent = v.ok && v.warning ? `⚠ ${ticketMessage(v.warning, current)} — vẫn gửi được` : '';
    captureBtn.disabled = !v.ok || busy;
  }

  numberInput.addEventListener('focus', () => numberInput.select());
  numberInput.addEventListener('input', () => {
    const n = parseTypedNumber(numberInput.value);
    if (n) { current = n; edited = true; }
    paint();
  });
  numberInput.addEventListener('blur', () => { numberInput.value = formatNo(current); });
  numberInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') numberInput.blur(); });

  noTicketBtn.addEventListener('click', () => { noTicket = !noTicket; paint(); });

  // ---------- camera: tự nghỉ sau 1 phút không thao tác / khi app chạy nền; bấm CHỤP vẫn chụp được ----------
  let torchOn = false;
  let camFailed = false;
  const camCtl = managedCamera(video, {
    onState(state, c) {
      sleepCover.classList.toggle('hidden', state !== 'sleep');
      if (state === 'on') {
        cam = c;
        torchOn = false;
        torchBtn.classList.toggle('hidden', !c.hasTorch);
      } else cam = null;
      if (state === 'error') {
        camFailed = true;
        camBox.classList.add('hidden');
        camMsg.classList.remove('hidden');
        camMsg.textContent = 'Không mở được camera trong app. Bấm CHỤP để dùng camera của máy (cho phép quyền Camera để nhanh hơn).';
      }
    },
  });
  torchBtn.addEventListener('click', () => { if (!cam) return; torchOn = !torchOn; cam.setTorch(torchOn); torchBtn.classList.toggle('on', torchOn); });
  sleepCover.addEventListener('click', () => camCtl.ensure());
  root.addEventListener('pointerdown', () => { if (camCtl.awake) camCtl.bump(); });
  camCtl.ensure();

  scanBtn.addEventListener('click', () => {
    if (stopScan) { stopScan(); stopScan = null; paint(); return; }
    camCtl.ensure();
    stopScan = startScan(video, (text) => {
      const r = parseQr(text, ctx.qrSecret);
      if (!r.ok) { toast(ticketMessage('TICKET_INVALID'), { error: true }); return; }
      if (r.date !== today) { toast(`${ticketMessage('TICKET_WRONG_DATE')} — dùng phiếu của hôm nay`, { error: true }); return; }
      current = r.no;
      edited = true;
      stopScan(); stopScan = null;
      paint();
    });
    paint();
  });

  // ---------- chụp = gửi xe ----------
  async function takePhoto() {
    if (!camFailed) await camCtl.ensure(); // camera đang nghỉ → bật lại rồi chụp luôn
    if (cam && video.videoWidth) {
      camBox.classList.remove('flash'); void camBox.offsetWidth; camBox.classList.add('flash');
      return captureJpeg(video);
    }
    return captureViaInput();
  }

  async function capture() {
    if (busy) return;
    const v = validation();
    if (!v.ok) { paint(); return; }
    busy = true; paint();
    try {
      const blob = await takePhoto();
      if (!blob) return;
      const inAt = ctx.nowIso();
      const id = uuid();
      const photoId = uuid();
      const session = {
        id, ticketDate: today, ticketNo: current, noTicket, vehicleType, plate: '', plateStatus: 'pending',
        inAt, inStaffId: ctx.staff.id, inDeviceId: ctx.deviceId, inPhotoId: photoId,
        priceAtIn: priceFor(prices, vehicleType, inAt), status: 'in_lot', note: '',
      };
      const photo = { id: photoId, sessionId: id, kind: 'in', takenAt: inAt, deviceId: ctx.deviceId, blob, uploadState: 'pending', attempts: 0 };
      const op = {
        opId: uuid(), type: 'createSession', createdAt: inAt,
        payload: { id, ticketDate: today, ticketNo: current, noTicket, vehicleType, inAt, inPhotoId: photoId },
      };
      await db.saveCheckin(session, photo, op);
      const prevLast = lastNo;
      lastNo = current;
      await db.setMeta(`lastNo:${today}`, lastNo);
      sessions.push(session);
      sync.kick();
      ctx.changed();

      const no = current;
      const wasNoTicket = noTicket;
      noTicket = false;
      edited = false;
      current = suggestNext(lastNo, blockedNumbers(sessions, today));
      paint();
      const shownAt = Date.now();
      toast(`✔ Đã gửi xe — phiếu ${formatNo(no)}${wasNoTicket ? ' (không phiếu)' : ''}`, {
        ms: UNDO_MS,
        actions: [
          { label: '↶ Hoàn tác', onClick: () => undo(session, prevLast, shownAt) },
          { label: '📷 Chụp lại', onClick: () => retake(photo, no) },
        ],
      });
    } finally {
      busy = false;
      paint();
    }
  }

  async function undo(session, prevLast, shownAt) {
    if (Date.now() - shownAt > UNDO_MS) { toast('Đã quá 10 giây, không hoàn tác được', { error: true }); return; }
    const createdAt = ctx.nowIso();
    const cancelled = { ...session, status: 'cancelled', note: 'Hoàn tác' };
    await db.commit({ sessions: [cancelled], ops: [{ opId: uuid(), type: 'undo', createdAt, payload: { sessionId: session.id } }] });
    sessions = sessions.map((s) => (s.id === session.id ? cancelled : s));
    lastNo = prevLast;
    await db.setMeta(`lastNo:${today}`, lastNo);
    current = session.ticketNo;
    edited = false;
    sync.kick();
    ctx.changed();
    paint();
    toast(`Đã hoàn tác phiếu ${formatNo(session.ticketNo)}`);
  }

  async function retake(photo, no) {
    const blob = await takePhoto();
    if (!blob) return;
    await db.commit({ photos: [{ ...photo, blob, takenAt: ctx.nowIso(), uploadState: 'pending' }] });
    toast(`Đã chụp lại ảnh phiếu ${formatNo(no)}`);
  }

  captureBtn.addEventListener('click', capture);

  // Dữ liệu mới từ máy khác → cập nhật số đề xuất nếu số hiện tại vừa bị dùng.
  const onSync = async () => {
    sessions = await db.allSessions();
    batches = await db.getMeta('batches', []);
    const blocked = blockedNumbers(sessions, today);
    if (!edited && blocked.has(current)) current = suggestNext(current - 1, blocked);
    // Biển số AI vừa đọc trùng một xe khác đang trong bãi → báo nhẹ, không chặn (FR-022).
    const dup = findPlateDuplicate(sessions, ctx.deviceId, new Date(ctx.now() - 5 * 60000).toISOString());
    plateDup.classList.toggle('hidden', !dup);
    plateDup.textContent = dup ? `ℹ Biển số ${dup.session.plate} (phiếu ${formatNo(dup.session.ticketNo)}) đã có trong bãi ở phiếu ${formatNo(dup.other.ticketNo)} — kiểm tra lại` : '';
    paint();
  };
  window.addEventListener('sync:changed', onSync);

  paint();
  return () => {
    window.removeEventListener('sync:changed', onSync);
    if (stopScan) stopScan();
    camCtl.close();
  };
}
