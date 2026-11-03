// CẢNH BÁO (US7): ảnh lúc ra không khớp ảnh lúc vào (khác màu, khác biển số, thiếu mũ).
// - Thẻ cảnh báo nổi ở trên cùng cho nhân viên vừa trả xe: rung (máy hỗ trợ) hoặc nháy đỏ (iPhone) + âm báo.
//   Thẻ KHÔNG chặn thao tác: vẫn quét/trả xe tiếp được; "Để sau" thu gọn vào danh sách Cảnh báo.
// - Màn hình #alerts: danh sách cảnh báo còn mở.
import { call } from '../api.js';
import * as db from '../db.js';
import { h, toast, timeVN, asyncPhoto } from '../ui.js';
import { formatNo } from '../../shared/ticket.js';

const RESOLUTIONS = [
  ['ok_customer_wearing', 'Đúng xe / đội mũ'],
  ['false_alarm', 'Báo sai'],
  ['real_issue', 'Có vấn đề thật'],
];
const KIND_VN = { color_mismatch: 'Khác màu xe', plate_mismatch: 'Khác biển số', helmet_missing: 'Thiếu mũ bảo hiểm' };

let ctxRef = null;
let shownId = null;
const later = new Set(); // cảnh báo đã bấm "Để sau" (vẫn còn trong danh sách Cảnh báo)

function beep() {
  const ac = ctxRef && ctxRef.audio;
  if (!ac) return;
  try {
    [0, 0.35].forEach((t) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.25;
      o.connect(g).connect(ac.destination);
      o.start(ac.currentTime + t);
      o.stop(ac.currentTime + t + 0.22);
    });
  } catch { /* bỏ qua */ }
}

/** Rung nếu máy hỗ trợ; iPhone không rung được từ web → nháy đỏ toàn màn hình 1,5 giây. */
function attention() {
  beep();
  if (typeof navigator.vibrate === 'function') { navigator.vibrate([300, 100, 300]); return 'vibrate'; }
  const f = h('div', { id: 'alert-flash', class: 'alert-flash' });
  document.body.append(f);
  setTimeout(() => f.remove(), 1500);
  return 'flash';
}

async function resolve(alert, resolution, note) {
  const r = await call('resolveAlert', { alertId: alert.id, resolution, note });
  if (!r.ok) { toast(r.error.code === 'OFFLINE' ? 'Cần có mạng để đóng cảnh báo — thử lại sau' : r.error.message || 'Lỗi', { error: true }); return false; }
  await db.putAlerts([r.data.alert]);
  window.dispatchEvent(new CustomEvent('alerts:changed'));
  return true;
}

/** Thẻ cảnh báo (dùng cho thẻ nổi và danh sách). */
export function alertCard(alert, session, { onDone, onLater } = {}) {
  const note = h('input', { class: 'alert-note', placeholder: 'Ghi chú (không bắt buộc)' });
  const buttons = RESOLUTIONS.map(([key, label]) => {
    const b = h('button', { type: 'button', class: key === 'real_issue' ? 'small danger' : 'small', 'data-resolution': key }, label);
    b.addEventListener('click', async () => { if (await resolve(alert, key, note.value.trim())) { toast(`Đã xử lý cảnh báo phiếu ${formatNo(session ? session.ticketNo : 0)}`); if (onDone) onDone(); } });
    return b;
  });
  return h('div', { class: `alert-card ${alert.level}`, 'data-alert': alert.id },
    h('div', { class: 'alert-title' }, `${alert.level === 'high' ? '⛔' : '⚠️'} ${KIND_VN[alert.kind] || 'Cảnh báo'} · ${timeVN(alert.createdAt)}`),
    h('div', { class: 'alert-msg' }, alert.message),
    session ? h('div', { class: 'side-by-side alert-photos' },
      h('figure', {}, asyncPhoto(session.inPhotoId, 'Lúc vào', db.getPhotoResult), h('figcaption', {}, 'Lúc vào')),
      h('figure', {}, asyncPhoto(session.outPhotoId, 'Lúc ra', db.getPhotoResult), h('figcaption', {}, 'Lúc ra'))) : null,
    h('div', { class: 'muted alert-hint' }, 'AI chỉ gợi ý — xem 2 ảnh, hỏi khách nhẹ nhàng nếu cần.'),
    note,
    h('div', { class: 'alert-actions' }, buttons, onLater ? h('button', { type: 'button', class: 'small ghost', onclick: onLater }, 'Để sau') : null));
}

/** Kiểm tra cảnh báo mới dành cho mình → hiện thẻ nổi + rung/nháy + âm báo (mỗi cảnh báo một lần). */
async function checkNew() {
  if (!ctxRef || !ctxRef.staff) return;
  const notified = new Set(await db.getMeta('notifiedAlerts', []));
  const mine = (await db.allAlerts()).filter((a) => a.status === 'new' && a.notifyStaffId === ctxRef.staff.id)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  updateNavCount(mine.length);
  const fresh = mine.filter((a) => !notified.has(a.id));
  if (fresh.length) {
    fresh.forEach((a) => notified.add(a.id));
    await db.setMeta('notifiedAlerts', [...notified].slice(-500));
    const how = attention();
    window.__gomayLastAttention = how;
  }
  const holder = document.getElementById('alert-float');
  const visible = mine.filter((a) => !later.has(a.id));
  const current = visible.find((a) => a.id === shownId) || visible[visible.length - 1];
  if (!current) { holder.replaceChildren(); shownId = null; return; }
  if (current.id === shownId && holder.firstChild) return;
  shownId = current.id;
  const session = await db.getSession(current.sessionId);
  holder.replaceChildren(alertCard(current, session, {
    onDone: () => { shownId = null; checkNew(); },
    onLater: () => { later.add(current.id); shownId = null; holder.replaceChildren(); checkNew(); },
  }));
}

function updateNavCount(n) {
  const link = document.querySelector('#nav a[href="#alerts"]');
  if (link) link.textContent = n ? `Cảnh báo (${n})` : 'Cảnh báo';
}

/** Gọi một lần khi khởi động app. */
export function initAlerts(ctx) {
  ctxRef = ctx;
  if (!document.getElementById('alert-float')) document.body.append(h('div', { id: 'alert-float', class: 'alert-float' }));
  window.addEventListener('alerts:changed', checkNew);
  window.addEventListener('sync:changed', checkNew);
  checkNew();
}

/** Màn hình danh sách cảnh báo còn mở (của mình; quản lý thấy tất cả). */
export async function render(root, ctx) {
  const list = h('div', { class: 'list', id: 'alert-list' });
  const aiOff = (await db.getMeta('visionEnabled')) === false;
  root.replaceChildren(
    aiOff ? h('div', { class: 'banner warn', id: 'ai-off' }, '⚠ AI đọc ảnh CHƯA BẬT nên app chưa thể cảnh báo khác xe / thiếu mũ. Chủ sân cần thêm VISION_API_KEY trong Apps Script (xem README, mục 1b).') : null,
    h('p', { class: 'muted' }, 'Cảnh báo AI khi ảnh lúc ra khác ảnh lúc vào. Chỉ là gợi ý — xem kỹ 2 ảnh.'), list);
  async function paint() {
    const open = (await db.allAlerts()).filter((a) => a.status === 'new' && (ctx.isManager() || a.notifyStaffId === ctx.staff.id))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (!open.length) { list.replaceChildren(h('div', { class: 'muted' }, '✓ Không có cảnh báo nào đang mở')); return; }
    list.replaceChildren(...await Promise.all(open.map(async (a) => alertCard(a, await db.getSession(a.sessionId), { onDone: paint }))));
  }
  window.addEventListener('alerts:changed', paint);
  await paint();
  return () => window.removeEventListener('alerts:changed', paint);
}
