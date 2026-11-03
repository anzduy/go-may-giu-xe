// QUẢN LÝ (chỉ chủ sân): báo cáo doanh thu theo ngày/ca, bảng giá, nhân viên, lượt có xung đột (hủy lượt).
import { call } from '../api.js';
import * as db from '../db.js';
import * as sync from '../sync.js';
import { h, toast, uuid, timeVN, dateVN } from '../ui.js';
import { hashParams } from '../ctx.js';
import { formatNo, dateKey } from '../../shared/ticket.js';
import { formatMoney, priceRuleAt, VEHICLE_TYPES } from '../../shared/pricing.js';

const TABS = { report: 'Báo cáo', prices: 'Giá', staff: 'Nhân viên', conflicts: 'Xung đột' };
const CONFLICT_VN = {
  duplicate_ticket: 'Trùng số phiếu với xe khác', out_of_range: 'Số vượt bộ phiếu đã in', double_checkout: 'Trả xe 2 lần',
  ticket_used: 'Phiếu đã dùng', wrong_date: 'Phiếu ngày khác', invalid: 'Không hợp lệ',
};

export async function render(root, ctx) {
  if (!ctx.isManager()) { root.replaceChildren(h('div', { class: 'banner danger' }, 'Chỉ quản lý mới vào được')); return; }
  const tab = TABS[hashParams().tab] ? hashParams().tab : 'report';
  const body = h('div', { id: 'admin-body' });
  root.replaceChildren(
    h('div', { class: 'segmented', id: 'admin-tabs' }, Object.entries(TABS).map(([k, label]) =>
      h('button', { type: 'button', class: k === tab ? 'on' : '', 'data-tab': k, onclick: () => ctx.navigate(`#admin?tab=${k}`) }, label))),
    body,
  );
  if (tab === 'report') await reportTab(body, ctx);
  if (tab === 'prices') await pricesTab(body, ctx);
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
  body.replaceChildren(h('div', { class: 'row' }, period, group), out);

  async function load() {
    const [from, to] = periodRange(period.value, ctx.now());
    out.replaceChildren(h('div', { class: 'muted' }, 'Đang tải…'));
    const r = await call('report', { from, to, groupBy: group.value });
    if (!r.ok) { out.replaceChildren(h('div', { class: 'banner warn' }, r.error.code === 'OFFLINE' ? 'Xem báo cáo cần có mạng' : r.error.message || 'Lỗi')); return; }
    const rows = r.data.rows;
    const total = rows.reduce((t, x) => ({ count: t.count + x.count, revenue: t.revenue + x.revenue, lost: t.lost + x.lost,
      provisional: t.provisional + x.provisional, conflicts: t.conflicts + x.conflicts, checkins: t.checkins + x.checkins }),
    { count: 0, revenue: 0, lost: 0, provisional: 0, conflicts: 0, checkins: 0 });
    const last = rows[rows.length - 1];
    out.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'fee', id: 'report-total' }, `Tổng: ${formatMoney(total.revenue)}`),
        h('div', { class: 'muted' }, `${total.count} lượt trả xe · ${total.checkins} lượt gửi · mất phiếu ${total.lost} · trả tạm ${total.provisional} · xung đột ${total.conflicts}`),
        last && group.value === 'day' ? h('div', { class: 'muted' }, `Phiếu hôm cuối: in ${last.ticketsPrinted}, đã dùng ${last.ticketsUsed}, bỏ qua ${last.skipped.length}`
          + ` · xe đang trong bãi ${last.inLot}${last.overnight ? ` (tồn qua đêm ${last.overnight})` : ''}`) : null),
      h('div', { class: 'list', id: 'report-rows' }, rows.length ? rows.map((x) => h('div', { class: 'item' },
        h('div', { style: 'flex:1' }, h('b', {}, x.label),
          h('div', { class: 'muted' }, `${x.count} lượt · mất phiếu ${x.lost}${x.provisional ? ` · trả tạm ${x.provisional}` : ''}${x.conflicts ? ` · xung đột ${x.conflicts}` : ''}`),
          h('div', { class: 'muted' }, Object.entries(x.byType).map(([t, v]) => `${VEHICLE_TYPES[t] || t} ${v.count}`).join(' · '))),
        h('div', { class: 'info-line' }, formatMoney(x.revenue)))) : h('div', { class: 'muted' }, group.value === 'shift' ? 'Chưa có ca nào được chốt' : 'Không có dữ liệu')),
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
  body.replaceChildren(h('div', { class: 'card' }, ...rows.flat(), save, msg));
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
  body.replaceChildren(list, h('div', { class: 'card' }, h('b', {}, 'Thêm nhân viên'), name, pin, h('div', { class: 'row', style: 'margin-top:8px' }, role, add), msg));

  async function save(d) {
    const r = await call('saveStaff', d);
    if (!r.ok) { msg.textContent = r.error.code === 'OFFLINE' ? 'Cần có mạng' : r.error.message || 'Lỗi'; return false; }
    msg.textContent = '';
    await load();
    return true;
  }
  async function load() {
    const r = await call('listStaff', {});
    if (!r.ok) { list.replaceChildren(h('div', { class: 'banner warn' }, 'Xem danh sách nhân viên cần có mạng')); return; }
    list.replaceChildren(...r.data.staff.map((s) => {
      const resetBtn = h('button', { type: 'button', class: 'small' }, 'Đổi PIN');
      const toggle = h('button', { type: 'button', class: s.active ? 'small danger' : 'small' }, s.active ? 'Khóa' : 'Mở khóa');
      resetBtn.addEventListener('click', async () => {
        const p = prompt(`Mã PIN mới cho ${s.name} (4–6 số):`);
        if (p && (await save({ id: s.id, name: s.name, role: s.role, pin: p, active: s.active }))) toast(`Đã đổi PIN cho ${s.name}`);
      });
      toggle.addEventListener('click', () => save({ id: s.id, name: s.name, role: s.role, active: !s.active }));
      return h('div', { class: 'item', 'data-staff': s.name },
        h('div', { style: 'flex:1' }, h('b', {}, s.name), h('div', { class: 'muted' }, `${s.role === 'manager' ? 'Quản lý' : 'Nhân viên'}${s.active ? '' : ' · ĐÃ KHÓA'}`)),
        resetBtn, toggle);
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
  body.replaceChildren(h('p', { class: 'muted' }, 'Lượt cần kiểm tra (dữ liệu 3 ngày gần nhất trên máy này). Sửa số: vào "Trong bãi" → chạm xe → Gán lại số.'),
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
