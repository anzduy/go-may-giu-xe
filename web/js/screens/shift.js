// CHỐT CA: tổng kết ca của nhân viên đang đăng nhập (tính ngay trên máy, chạy được khi mất mạng),
// gửi lên máy chủ để chủ sân đối chiếu. Tiền cần nộp = tiền các lượt mình TRẢ xe trong ca.
import * as db from '../db.js';
import * as sync from '../sync.js';
import { h, toast, uuid, timeVN, dateVN, asyncPhoto } from '../ui.js';
import { formatNo, remainingTickets } from '../../shared/ticket.js';
import { summarize } from '../../shared/report.js';
import { VEHICLE_TYPES, formatMoney } from '../../shared/pricing.js';

function summaryCard(sum, title, extra) {
  const types = Object.entries(sum.byType || {}).map(([t, v]) => `${VEHICLE_TYPES[t] || t}: ${v.count} lượt · ${formatMoney(v.revenue)}`);
  return h('div', { class: 'card', id: 'shift-summary' },
    h('b', {}, title),
    h('div', { class: 'fee', id: 'shift-revenue' }, `Tiền cần nộp: ${formatMoney(sum.revenue)}`),
    h('ul', { class: 'timeline' },
      h('li', {}, `Trả xe: ${sum.count} lượt (trong đó mất phiếu: ${sum.lost})`),
      ...types.map((t) => h('li', { class: 'muted' }, t)),
      h('li', {}, `Gửi xe: ${sum.checkins} lượt`),
      sum.provisional ? h('li', { class: 'warn-text' }, `Trả xe tạm chờ ghép: ${sum.provisional}`) : null,
      sum.conflicts ? h('li', { class: 'warn-text' }, `Lượt có xung đột: ${sum.conflicts} (quản lý kiểm tra)`) : null,
      sum.alerts ? h('li', {}, `Cảnh báo: ${sum.alerts} (chưa xử lý: ${sum.alertsOpen})`) : null,
      h('li', {}, `Xe còn trong bãi: ${sum.inLot}${sum.overnight ? ` (tồn qua đêm: ${sum.overnight})` : ''}`)),
    extra || null);
}

export async function render(root, ctx) {
  let start = await db.getMeta('shiftStart');
  if (!start) { start = ctx.nowIso(); await db.setMeta('shiftStart', start); }
  const sessions = await db.allSessions();
  const batches = await db.getMeta('batches', []);
  const now = ctx.nowIso();
  const myAlerts = (await db.allAlerts()).filter((a) => a.notifyStaffId === ctx.staff.id);
  const sum = summarize({ sessions, batches, alerts: myAlerts, from: start, to: now, staffId: ctx.staff.id });
  const remaining = remainingTickets(batches, sessions, ctx.today());

  const closeBtn = h('button', { type: 'button', class: 'primary', id: 'close-shift' }, 'CHỐT CA');
  const last = await db.getMeta('lastShift');
  const lastBox = h('div', { id: 'last-shift' });
  if (last) {
    const confirmed = await db.getMeta(`shift:${last.id}`);
    lastBox.append(summaryCard(confirmed ? confirmed.summary : last.summary,
      `Ca đã chốt: ${timeVN(last.startAt)}–${timeVN(last.endAt)} ${dateVN(ctx.today())}`,
      h('div', { class: confirmed ? 'muted' : 'warn-text', id: 'shift-confirm' }, confirmed ? '✓ Máy chủ đã xác nhận' : '… Chờ gửi lên máy chủ')));
  }

  const inLot = sessions.filter((s) => s.status === 'in_lot').sort((a, b) => String(a.inAt).localeCompare(String(b.inAt)));
  root.replaceChildren(
    h('div', { class: 'muted' }, `${ctx.staff.name} · ca bắt đầu ${timeVN(start)} · còn ${remaining} phiếu`),
    summaryCard(sum, 'Ca hiện tại'),
    lastBox,
    inLot.length ? h('div', {}, h('b', {}, `Xe còn trong bãi (${inLot.length})`),
      h('div', { class: 'grid', style: 'margin-top:8px' }, inLot.map((s) =>
        h('div', { class: 'tile' }, asyncPhoto(s.inPhotoId, `Phiếu ${formatNo(s.ticketNo)}`, db.getPhotoResult, { zoom: false }),
          h('div', {}, `Phiếu ${formatNo(s.ticketNo)} · ${timeVN(s.inAt)}`))))) : null,
    h('div', { class: 'bottom-bar' }, closeBtn),
  );

  closeBtn.addEventListener('click', async () => {
    if (!confirm(`Chốt ca? Tiền cần nộp: ${formatMoney(sum.revenue)}`)) return;
    const endAt = ctx.nowIso();
    const shiftId = uuid();
    const final = summarize({ sessions: await db.allSessions(), batches, alerts: myAlerts, from: start, to: endAt, staffId: ctx.staff.id });
    await db.commit({ ops: [{ opId: uuid(), type: 'closeShift', createdAt: endAt, payload: { shiftId, startAt: start, endAt } }] });
    await db.setMeta('lastShift', { id: shiftId, startAt: start, endAt, summary: final });
    await db.setMeta('shiftStart', endAt);
    sync.kick();
    toast(`Đã chốt ca · nộp ${formatMoney(final.revenue)}`, { ms: 5000 });
    ctx.navigate('#shift');
  });

  const onSync = async () => {
    const l = await db.getMeta('lastShift');
    const el = document.getElementById('shift-confirm');
    if (l && el && (await db.getMeta(`shift:${l.id}`))) { el.textContent = '✓ Máy chủ đã xác nhận'; el.className = 'muted'; }
  };
  window.addEventListener('sync:changed', onSync);
  return () => window.removeEventListener('sync:changed', onSync);
}
