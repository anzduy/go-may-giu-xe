// QUẢN LÝ (chỉ chủ sân): báo cáo doanh thu theo ngày/ca, bảng giá, nhân viên, lượt có xung đột (hủy lượt).
import { call } from '../api.js';
import * as db from '../db.js';
import * as sync from '../sync.js';
import { h, toast, uuid, timeVN, dateVN, fill } from '../ui.js';
import { hashParams } from '../ctx.js';
import { supported as readerSupported } from '../plate-reader.js';
import { formatNo, dateKey } from '../../shared/ticket.js';
import { formatMoney, priceRuleAt, VEHICLE_TYPES } from '../../shared/pricing.js';

const TABS = { report: 'Báo cáo', alerts: 'Cảnh báo', prices: 'Giá', staff: 'Nhân viên', conflicts: 'Xung đột' };
const CONFLICT_VN = {
  duplicate_ticket: 'Trùng số phiếu với xe khác', out_of_range: 'Số vượt bộ phiếu đã in', double_checkout: 'Trả xe 2 lần',
  ticket_used: 'Phiếu đã dùng', wrong_date: 'Phiếu ngày khác', invalid: 'Không hợp lệ',
};

export async function render(root, ctx) {
  if (!ctx.isManager()) { fill(root, h('div', { class: 'banner danger' }, 'Chỉ quản lý mới vào được')); return; }
  const tab = TABS[hashParams().tab] ? hashParams().tab : 'report';
  const body = h('div', { id: 'admin-body' });
  fill(root, 
    h('div', { class: 'segmented', id: 'admin-tabs' }, Object.entries(TABS).map(([k, label]) =>
      h('button', { type: 'button', class: k === tab ? 'on' : '', 'data-tab': k, onclick: () => ctx.navigate(`#admin?tab=${k}`) }, label))),
    body,
  );
  if (tab === 'report') await reportTab(body, ctx);
  if (tab === 'prices') await pricesTab(body, ctx);
  if (tab === 'alerts') await alertsTab(body, ctx);
  if (tab === 'staff') await staffTab(body, ctx);
  if (tab === 'conflicts') await conflictsTab(body, ctx);
}

// ---------- Báo cáo ----------
function periodRange(period, now) {
  const today = dateKey(now);
  if (period === 'week') return [dateKey(now - 6 * 86400000), today];
  if (period === 'month') return [`${today.slice(0, 6)}01`, today];
  return [today, today];
}

async function reportTab(body, ctx) {
  const period = h('select', { id: 'report-period' },
    h('option', { value: 'today' }, 'Hôm nay'), h('option', { value: 'week' }, '7 ngày qua'), h('option', { value: 'month' }, 'Tháng này'));
  const group = h('select', { id: 'report-group' }, h('option', { value: 'day' }, 'Theo ngày'), h('option', { value: 'shift' }, 'Theo ca'));
  const out = h('div', { id: 'report-out' });
  fill(body, h('div', { class: 'row' }, period, group), out);

  async function load() {
    const [from, to] = periodRange(period.value, ctx.now());
    fill(out, h('div', { class: 'muted' }, 'Đang tải…'));
    const r = await call('report', { from, to, groupBy: group.value });
    if (!r.ok) { fill(out, h('div', { class: 'banner warn' }, r.error.code === 'OFFLINE' ? 'Xem báo cáo cần có mạng' : r.error.message || 'Lỗi')); return; }
    const rows = r.data.rows;
    const cashOf = (x) => (x.cash != null ? x.cash : x.revenue);
    const total = rows.reduce((t, x) => ({ count: t.count + x.count, revenue: t.revenue + x.revenue, lost: t.lost + x.lost,
      provisional: t.provisional + x.provisional, conflicts: t.conflicts + x.conflicts, checkins: t.checkins + x.checkins,
      cash: t.cash + cashOf(x), transfer: t.transfer + (x.transfer || 0) }),
    { count: 0, revenue: 0, lost: 0, provisional: 0, conflicts: 0, checkins: 0, cash: 0, transfer: 0 });
    const last = rows[rows.length - 1];
    fill(out, 
      h('div', { class: 'card' },
        h('div', { class: 'fee', id: 'report-total' }, `Tổng: ${formatMoney(total.revenue)}`),
        h('div', { id: 'report-money' }, `Tiền mặt ${formatMoney(total.cash)} · Chuyển khoản ${formatMoney(total.transfer)}`),
        h('div', { class: 'muted' }, `${total.count} lượt trả xe · ${total.checkins} lượt gửi · mất phiếu ${total.lost} · trả tạm ${total.provisional} · xung đột ${total.conflicts}`),
        last && group.value === 'day' ? h('div', { class: 'muted' }, `Phiếu hôm cuối: in ${last.ticketsPrinted}, đã dùng ${last.ticketsUsed}, bỏ qua ${last.skipped.length}`
          + ` · xe đang trong bãi ${last.inLot}${last.overnight ? ` (tồn qua đêm ${last.overnight})` : ''}`) : null),
      h('div', { class: 'list', id: 'report-rows' }, rows.length ? rows.map((x) => h('div', { class: 'item' },
        h('div', { style: 'flex:1' }, h('b', {}, x.label),
          h('div', { class: 'muted' }, `${x.count} lượt · mất phiếu ${x.lost}${x.provisional ? ` · trả tạm ${x.provisional}` : ''}${x.conflicts ? ` · xung đột ${x.conflicts}` : ''}`),
          h('div', { class: 'muted' }, Object.entries(x.byType).map(([t, v]) => `${VEHICLE_TYPES[t] || t} ${v.count}`).join(' · '))),
        h('div', { style: 'text-align:right' }, h('div', { class: 'info-line' }, formatMoney(x.revenue)),
          x.transfer ? h('div', { class: 'muted' }, `CK ${formatMoney(x.transfer)}`) : null))) : h('div', { class: 'muted' }, group.value === 'shift' ? 'Chưa có ca nào được chốt' : 'Không có dữ liệu')),
    );
  }
  period.addEventListener('change', load);
  group.addEventListener('change', load);
  await load();
}

// ---------- Giá ----------
async function pricesTab(body, ctx) {
  const current = priceRuleAt(await db.getMeta('prices', []), ctx.nowIso());
  const fields = {};
  const labels = { motorbike: 'Xe máy (đ/lượt)', ebike: 'Xe điện (đ/lượt)', bicycle: 'Xe đạp (đ/lượt)', lostFee: 'Mất phiếu (tổng tiền, đ)' };
  const rows = Object.entries(labels).map(([k, label]) => {
    fields[k] = h('input', { id: `price-${k}`, type: 'number', inputmode: 'numeric', min: '0', step: '1000', value: String(current[k]) });
    return [h('label', { for: `price-${k}` }, label), fields[k]];
  });
  const save = h('button', { type: 'button', class: 'primary', id: 'price-save', style: 'width:100%;margin-top:12px' }, 'Lưu bảng giá');
  const msg = h('div', { class: 'muted', id: 'price-msg' }, 'Giá mới áp dụng cho xe gửi từ bây giờ; xe đang trong bãi giữ giá lúc gửi.');
  fill(body, h('div', { class: 'card' }, ...rows.flat(), save, msg));
  save.addEventListener('click', async () => {
    const d = Object.fromEntries(Object.entries(fields).map(([k, el]) => [k, Number(el.value)]));
    save.disabled = true;
    const r = await call('setPrices', d);
    save.disabled = false;
    if (!r.ok) { msg.textContent = r.error.code === 'OFFLINE' ? 'Đổi giá cần có mạng' : r.error.message || 'Lỗi'; return; }
    await db.setMeta('prices', r.data.prices);
    msg.textContent = '✓ Đã lưu bảng giá mới';
    toast('Đã lưu bảng giá');
  });
}

// ---------- Nhân viên ----------
async function staffTab(body) {
  const list = h('div', { class: 'list', id: 'staff-list' });
  const name = h('input', { id: 'new-staff-name', placeholder: 'Tên nhân viên' });
  const pin = h('input', { id: 'new-staff-pin', inputmode: 'numeric', maxlength: '6', placeholder: 'Mã PIN 4–6 số' });
  const role = h('select', { id: 'new-staff-role' }, h('option', { value: 'staff' }, 'Nhân viên'), h('option', { value: 'manager' }, 'Quản lý'));
  const add = h('button', { type: 'button', class: 'primary', id: 'add-staff' }, 'Thêm');
  const msg = h('div', { class: 'error-text', id: 'staff-msg' });
  fill(body, list, h('div', { class: 'card' }, h('b', {}, 'Thêm nhân viên'), name, pin, h('div', { class: 'row', style: 'margin-top:8px' }, role, add), msg));

  async function save(d) {
    const r = await call('saveStaff', d);
    if (!r.ok) { msg.textContent = r.error.code === 'OFFLINE' ? 'Cần có mạng' : r.error.message || 'Lỗi'; return false; }
    msg.textContent = '';
    await load();
    return true;
  }
  async function load() {
    const r = await call('listStaff', {});
    if (!r.ok) { fill(list, h('div', { class: 'banner warn' }, 'Xem danh sách nhân viên cần có mạng')); return; }
    fill(list, ...r.data.staff.map((s) => {
      const resetBtn = h('button', { type: 'button', class: 'small' }, 'Đổi PIN');
      const toggle = h('button', { type: 'button', class: s.active ? 'small danger' : 'small' }, s.active ? 'Khóa' : 'Mở khóa');
      const logoutAll = h('button', { type: 'button', class: 'small ghost', title: 'Đăng xuất mọi máy của người này (mất điện thoại…)' }, 'Đăng xuất máy');
      logoutAll.addEventListener('click', async () => {
        if (!confirm(`Đăng xuất ${s.name} khỏi mọi điện thoại?`)) return;
        const r = await call('revokeTokens', { staffId: s.id });
        if (!r.ok) { msg.textContent = r.error.code === 'OFFLINE' ? 'Cần có mạng' : r.error.message || 'Lỗi'; return; }
        toast(`Đã đăng xuất ${s.name} khỏi ${r.data.revoked} máy`);
      });
      resetBtn.addEventListener('click', async () => {
        const p = prompt(`Mã PIN mới cho ${s.name} (4–6 số):`);
        if (p && (await save({ id: s.id, name: s.name, role: s.role, pin: p, active: s.active }))) toast(`Đã đổi PIN cho ${s.name}`);
      });
      toggle.addEventListener('click', () => save({ id: s.id, name: s.name, role: s.role, active: !s.active }));
      return h('div', { class: 'item', 'data-staff': s.name },
        h('div', { style: 'flex:1' }, h('b', {}, s.name), h('div', { class: 'muted' }, `${s.role === 'manager' ? 'Quản lý' : 'Nhân viên'}${s.active ? '' : ' · ĐÃ KHÓA'}`)),
        resetBtn, logoutAll, toggle);
    }));
  }
  add.addEventListener('click', async () => {
    if (!name.value.trim() || !/^\d{4,6}$/.test(pin.value)) { msg.textContent = 'Nhập tên và mã PIN 4–6 số'; return; }
    if (await save({ name: name.value.trim(), role: role.value, pin: pin.value, active: true })) {
      toast(`Đã thêm ${name.value.trim()}`);
      name.value = ''; pin.value = '';
    }
  });
  await load();
}

// ---------- Xung đột / hủy lượt ----------
async function conflictsTab(body, ctx) {
  const all = await db.allSessions();
  const list = all.filter((s) => s.conflict && s.status !== 'cancelled' || s.status === 'provisional')
    .sort((a, b) => String(b.inAt || b.outAt).localeCompare(String(a.inAt || a.outAt)));
  fill(body, h('p', { class: 'muted' }, 'Lượt cần kiểm tra (dữ liệu 3 ngày gần nhất trên máy này). Sửa số: vào "Trong bãi" → chạm xe → Gán lại số.'),
    h('div', { class: 'list', id: 'conflict-list' }, list.length ? list.map((s) => {
      const cancelBtn = h('button', { type: 'button', class: 'small danger' }, 'Hủy lượt');
      cancelBtn.addEventListener('click', async () => {
        const note = prompt(`Lý do hủy lượt phiếu ${formatNo(s.ticketNo)} (bắt buộc):`);
        if (!note || !note.trim()) return;
        const createdAt = ctx.nowIso();
        await db.commit({ sessions: [{ ...s, status: 'cancelled', note: note.trim() }],
          ops: [{ opId: uuid(), type: 'cancel', createdAt, payload: { sessionId: s.id, note: note.trim() } }] });
        sync.kick();
        ctx.changed();
        toast(`Đã hủy lượt phiếu ${formatNo(s.ticketNo)}`);
        ctx.navigate('#admin?tab=conflicts');
      });
      return h('div', { class: 'item', 'data-id': s.id },
        h('div', { style: 'flex:1' }, h('b', {}, `Phiếu ${formatNo(s.ticketNo)} · ${dateVN(s.ticketDate)}`),
          h('div', { class: 'warn-text' }, s.status === 'provisional' ? 'Trả xe tạm — chờ ghép lượt gửi' : CONFLICT_VN[s.conflict] || s.conflict),
          h('div', { class: 'muted' }, `${s.inAt ? `vào ${timeVN(s.inAt)}` : ''}${s.outAt ? ` · ra ${timeVN(s.outAt)}` : ''}${s.note ? ` · ${s.note}` : ''}`)),
        h('button', { type: 'button', class: 'small', onclick: () => ctx.navigate(`#session?id=${encodeURIComponent(s.id)}`) }, 'Xem'),
        cancelBtn);
    }) : h('div', { class: 'muted' }, '✓ Không có lượt nào cần kiểm tra')));
}

// ---------- Cảnh báo AI: độ nhạy + danh sách ----------
const RES_VN = { ok_customer_wearing: 'Đúng xe / khách đội mũ', false_alarm: 'Báo sai', real_issue: 'Có vấn đề thật' };

async function alertsTab(body, ctx) {
  const current = Number(await db.getMeta('alertThreshold', 0.7)) || 0.7;
  const slider = h('input', { type: 'range', id: 'alert-threshold', min: '0.5', max: '0.95', step: '0.05', value: String(current) });
  const label = h('div', { id: 'alert-threshold-label', class: 'muted' });
  const showLabel = () => {
    const v = Number(slider.value);
    label.textContent = `Ngưỡng chắc chắn ${Math.round(v * 100)}% — ${v <= 0.6 ? 'nhạy (nhiều cảnh báo, dễ báo sai)' : v >= 0.85 ? 'chặt (ít cảnh báo, có thể bỏ sót)' : 'cân bằng (khuyên dùng)'}`;
  };
  const save = h('button', { type: 'button', class: 'small', id: 'alert-threshold-save' }, 'Lưu độ nhạy');
  const period = h('select', { id: 'alert-period' }, h('option', { value: 'week' }, '7 ngày qua'), h('option', { value: 'month' }, 'Tháng này'));
  const stats = h('div', { class: 'muted', id: 'alert-stats' });
  const list = h('div', { class: 'list', id: 'admin-alert-list' });
  const aiOff = (await db.getMeta('visionEnabled')) === false && !readerSupported();
  fill(body, 
    aiOff ? h('div', { class: 'banner warn', id: 'ai-off' }, '⚠ Điện thoại này không chạy được bộ đọc biển số (trình duyệt quá cũ). Cập nhật Chrome / Safari rồi mở lại app.') : null,
    h('p', { class: 'muted' }, 'Biển số + màu xe do điện thoại tự đọc (miễn phí, chạy cả khi mất mạng). Không đếm mũ bảo hiểm.'),
    h('div', { class: 'card' }, h('b', {}, 'Độ nhạy cảnh báo'), slider, label, save),
    h('div', { class: 'row' }, period), stats, list);
  slider.addEventListener('input', showLabel);
  showLabel();
  save.addEventListener('click', async () => {
    const r = await call('setConfig', { alertThreshold: Number(slider.value) });
    if (!r.ok) { toast(r.error.code === 'OFFLINE' ? 'Cần có mạng' : r.error.message || 'Lỗi', { error: true }); return; }
    await db.setMeta('alertThreshold', r.data.alertThreshold);
    toast('Đã lưu độ nhạy cảnh báo');
  });
  async function load() {
    const [from, to] = periodRange(period.value, ctx.now());
    const r = await call('listAlerts', { from, to });
    if (!r.ok) { fill(list, h('div', { class: 'banner warn' }, 'Xem cảnh báo cần có mạng')); return; }
    const rows = r.data.alerts;
    const resolved = rows.filter((a) => a.status === 'resolved');
    const falseAlarm = resolved.filter((a) => a.resolution === 'false_alarm').length;
    stats.textContent = `${rows.length} cảnh báo · đang mở ${rows.length - resolved.length} · có vấn đề thật ${resolved.filter((a) => a.resolution === 'real_issue').length}`
      + ` · báo sai ${falseAlarm}${resolved.length ? ` (${Math.round((falseAlarm / resolved.length) * 100)}% số đã xử lý)` : ''}`;
    fill(list, ...rows.map((a) => h('div', { class: 'item' },
      h('div', { style: 'flex:1' }, h('b', {}, a.message),
        h('div', { class: 'muted' }, `${timeVN(a.createdAt)} ${dateVN(dateKey(a.createdAt))} · ${a.status === 'new' ? 'ĐANG MỞ' : RES_VN[a.resolution] || a.resolution}${a.note ? ` · ${a.note}` : ''}`)),
      h('button', { type: 'button', class: 'small', onclick: () => ctx.navigate(`#session?id=${encodeURIComponent(a.sessionId)}`) }, 'Xem'))));
    if (!rows.length) fill(list, h('div', { class: 'muted' }, 'Chưa có cảnh báo nào'));
  }
  period.addEventListener('change', load);
  await load();
}
