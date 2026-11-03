// Báo cáo chốt ca / doanh thu. Logic thuần, dùng chung app (chốt ca khi offline), Apps Script và test.
// Quy ước: tiền tính cho NGƯỜI TRẢ XE vào lúc trả (outAt); lượt gửi tính cho người nhận xe (inAt).
import { dateKey, computeSkipped } from './ticket.js';

const VN_MS = 7 * 3600 * 1000;
const PAID = ['returned', 'lost'];

/** [đầu ngày, cuối ngày] giờ Việt Nam của ngày "YYYYMMDD", dạng ISO. */
export function dayRange(key) {
  const start = Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8)) - VN_MS;
  return [new Date(start).toISOString(), new Date(start + 86400000 - 1).toISOString()];
}

function daysBetween(fromKey, toKey) {
  const out = [];
  let ms = Date.parse(dayRange(fromKey)[0]) + VN_MS;
  const end = Date.parse(dayRange(toKey)[0]) + VN_MS;
  for (; ms <= end; ms += 86400000) out.push(new Date(ms).toISOString().slice(0, 10).replace(/-/g, ''));
  return out;
}

const within = (iso, from, to) => !!iso && String(iso) >= from && String(iso) <= to;

/**
 * Tổng hợp trong khoảng [from, to] (ISO). staffId (tùy chọn): chỉ tính phần của nhân viên đó.
 */
export function summarize({ sessions = [], alerts = [], batches = [], from, to, staffId }) {
  const paid = sessions.filter((s) => PAID.includes(s.status) && within(s.outAt, from, to) && (!staffId || s.outStaffId === staffId));
  const byType = {};
  for (const s of paid) {
    const t = s.vehicleType || 'motorbike';
    byType[t] = byType[t] || { count: 0, revenue: 0 };
    byType[t].count++;
    byType[t].revenue += Number(s.fee) || 0;
  }
  const checkins = sessions.filter((s) => s.status !== 'cancelled' && within(s.inAt, from, to) && (!staffId || s.inStaffId === staffId));
  const inLot = sessions.filter((s) => s.status === 'in_lot');
  const lastDay = dateKey(to);
  const days = daysBetween(dateKey(from), lastDay);
  let ticketsPrinted = 0;
  for (const b of batches) if (days.includes(b.date)) ticketsPrinted += Number(b.toNo) - Number(b.fromNo) + 1;
  const used = sessions.filter((s) => s.status !== 'cancelled' && !s.noTicket && days.includes(s.ticketDate));
  const skipped = days.flatMap((d) => computeSkipped(sessions, d));
  const inRange = (a) => within(a.createdAt, from, to);
  return {
    from, to,
    count: paid.length,
    revenue: paid.reduce((sum, s) => sum + (Number(s.fee) || 0), 0),
    byType,
    lost: paid.filter((s) => s.status === 'lost').length,
    checkins: checkins.length,
    provisional: sessions.filter((s) => s.status === 'provisional' && within(s.outAt, from, to) && (!staffId || s.outStaffId === staffId)).length,
    conflicts: sessions.filter((s) => s.conflict && s.status !== 'cancelled' && (within(s.inAt, from, to) || within(s.outAt, from, to))).length,
    inLot: inLot.length,
    overnight: inLot.filter((s) => s.ticketDate < lastDay).length,
    ticketsPrinted,
    ticketsUsed: used.length,
    skipped,
    alerts: alerts.filter(inRange).length,
    alertsOpen: alerts.filter((a) => inRange(a) && a.status === 'new').length,
  };
}

function hhmm(iso) {
  const d = new Date(Date.parse(iso) + VN_MS);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
const ddmm = (key) => `${key.slice(6, 8)}/${key.slice(4, 6)}`;

/**
 * Các dòng báo cáo từ ngày `from` tới ngày `to` (YYYYMMDD), nhóm theo ngày hoặc theo ca.
 */
export function reportRows({ sessions = [], alerts = [], batches = [], shifts = [], from, to, groupBy = 'day', staffNames = {} }) {
  if (groupBy === 'shift') {
    const [start] = dayRange(from);
    const [, end] = dayRange(to);
    return shifts.filter((sh) => within(sh.endAt, start, end))
      .sort((a, b) => String(a.endAt).localeCompare(String(b.endAt)))
      .map((sh) => ({
        key: sh.id, staffId: sh.staffId,
        label: `${staffNames[sh.staffId] || sh.staffId} · ${hhmm(sh.startAt)}–${hhmm(sh.endAt)} ${ddmm(dateKey(sh.endAt))}`,
        ...summarize({ sessions, alerts, batches, from: sh.startAt, to: sh.endAt, staffId: sh.staffId }),
      }));
  }
  return daysBetween(from, to).map((key) => {
    const [s, e] = dayRange(key);
    return { key, label: ddmm(key), ...summarize({ sessions, alerts, batches, from: s, to: e }) };
  });
}
