// CHI TIẾT LƯỢT GỬI: ảnh lúc vào và lúc ra đặt cạnh nhau (chạm để phóng to), giờ, nhân viên, tiền, diễn biến.
import * as db from '../db.js';
import * as sync from '../sync.js';
import { h, timeVN, dateVN, asyncPhoto, toast, uuid } from '../ui.js';
import { hashParams } from '../ctx.js';
import { formatNo } from '../../shared/ticket.js';
import { VEHICLE_TYPES, formatMoney } from '../../shared/pricing.js';
import { call } from '../api.js';
import { COLOR_GROUPS } from '../../shared/vision.js';
import { compareNote } from '../../shared/compare.js';

const STATUS_VN = { in_lot: 'Đang trong bãi', returned: 'Đã trả xe', lost: 'Mất phiếu — đã trả', provisional: 'Trả xe tạm (chờ ghép)', cancelled: 'Đã hủy' };

export async function render(root, ctx) {
  const { id } = hashParams();
  const s = id && (await db.getSession(id));
  if (!s) { root.replaceChildren(h('div', { class: 'banner danger' }, 'Không tìm thấy lượt gửi này trên máy')); return; }
  const names = await db.getMeta('staffNames', {});
  const who = (sid) => names[sid] || sid || '';

  const timeline = [
    s.inAt ? `Gửi xe ${timeVN(s.inAt)} ngày ${dateVN(s.ticketDate)} — ${who(s.inStaffId)}` : null,
    s.outAt ? `${s.status === 'lost' ? 'Trả xe (mất phiếu)' : s.status === 'provisional' ? 'Trả xe tạm' : 'Trả xe'} ${timeVN(s.outAt)} — ${who(s.outStaffId)}` : null,
    s.status === 'cancelled' ? `Đã hủy${s.note ? `: ${s.note}` : ''}` : null,
    s.note && s.status !== 'cancelled' ? `Ghi chú: ${s.note}` : null,
    s.conflict ? `⚠ Xung đột đồng bộ: ${s.conflict}` : null,
    s.mergedInto ? `Đã ghép vào lượt ${s.mergedInto}` : null,
  ].filter(Boolean);

  root.replaceChildren(
    h('div', { class: 'info-line' }, `Phiếu ${formatNo(s.ticketNo)}${s.noTicket ? ' (không phiếu)' : ''}${s.plate ? ` · ${s.plate}` : ''}`),
    h('div', { class: 'muted' }, `${VEHICLE_TYPES[s.vehicleType] || ''} · ${STATUS_VN[s.status] || s.status}${s.fee != null ? ` · Đã thu ${formatMoney(s.fee)}` : ''}`),
    h('div', { class: 'side-by-side', id: 'photo-pair', style: 'margin-top:10px' },
      h('figure', {}, asyncPhoto(s.inPhotoId, 'Ảnh lúc vào', db.getPhotoResult), h('figcaption', {}, `Lúc vào ${timeVN(s.inAt)}`)),
      h('figure', {}, s.outPhotoId ? asyncPhoto(s.outPhotoId, 'Ảnh lúc ra', db.getPhotoResult) : h('div', { class: 'photo-missing' }, 'Chưa trả xe'),
        h('figcaption', {}, s.outAt ? `Lúc ra ${timeVN(s.outAt)}` : ''))),
    savePhotosRow(s),
    plateEditor(s, ctx),
    await analysisCard(s, ctx),
    s.inSummary ? h('div', { class: 'warn-text', id: 'detail-summary' }, `AI: ${s.inSummary}`) : null,
    h('div', { class: 'card', style: 'margin-top:10px' }, h('b', {}, 'Diễn biến'), h('ul', { class: 'timeline' }, timeline.map((t) => h('li', {}, t)))),
    h('button', { type: 'button', style: 'width:100%', onclick: () => history.back() }, '← Quay lại'),
  );
}

const PLATE_VN = { pending: 'đang chờ AI đọc', read: 'AI đọc', unreadable: 'AI không đọc được', manual: 'nhập tay' };

/** Ô sửa biển số (nhân viên/quản lý) → thao tác setPlate, đồng bộ ngầm. */
function plateEditor(s, ctx) {
  const input = h('input', { id: 'plate-input', value: s.plate || '', placeholder: 'Ví dụ 59X1-123.45', autocomplete: 'off' });
  const save = h('button', { type: 'button', id: 'plate-save', class: 'small' }, 'Lưu biển số');
  const status = h('div', { class: 'muted', id: 'plate-status' }, `Biển số: ${PLATE_VN[s.plateStatus] || '—'}`);
  save.addEventListener('click', async () => {
    const plate = input.value.trim();
    if (!plate) return;
    const createdAt = ctx.nowIso();
    const updated = { ...s, plate: plate.toUpperCase(), plateStatus: 'manual' };
    await db.commit({ sessions: [updated], ops: [{ opId: uuid(), type: 'setPlate', createdAt, payload: { sessionId: s.id, plate } }] });
    Object.assign(s, updated);
    status.textContent = `Biển số: ${PLATE_VN.manual}`;
    sync.kick();
    toast(`Đã lưu biển số ${updated.plate}`);
  });
  return h('div', { class: 'card', style: 'margin-top:10px' }, h('label', { for: 'plate-input' }, 'Biển số'),
    h('div', { class: 'keypad-row' }, input, save), status);
}

const pct = (v) => `${Math.round((Number(v) || 0) * 100)}%`;

function analysisLine(a) {
  if (!a) return h('div', { class: 'muted' }, 'Chưa có kết quả AI');
  return h('div', {},
    h('div', {}, `Màu: ${a.color} (${pct(a.confidence.color)})`),
    h('div', {}, `Mũ trên xe: ${a.helmetsOnVehicle} · đội: ${a.helmetsWorn} (${pct(a.confidence.helmets)})`),
    a.plate ? h('div', {}, `Biển số: ${a.plate} (${pct(a.confidence.plate)})`) : null,
    a.otherItems && a.otherItems.length ? h('div', { class: 'muted' }, `Đồ khác: ${a.otherItems.join(', ')}`) : null,
    a.analysisStatus === 'manual' ? h('div', { class: 'muted' }, '(đã sửa tay)') : null);
}

/** Kết quả AI của ảnh vào/ra; quản lý sửa tay được (setAnalysis) khi AI đọc sai. */
async function analysisCard(s, ctx) {
  const pin = s.inPhotoId && (await db.getPhoto(s.inPhotoId));
  const pout = s.outPhotoId && (await db.getPhoto(s.outPhotoId));
  const ain = pin && pin.analysis;
  const aout = pout && pout.analysis;
  const alerts = (await db.allAlerts()).filter((a) => a.sessionId === s.id);
  const threshold = Number(await db.getMeta('alertThreshold', 0.7)) || 0.7;
  const note = ain && aout ? compareNote(ain, aout, threshold) : '';
  const card = h('div', { class: 'card', id: 'analysis-card', style: 'margin-top:10px' },
    h('b', {}, 'AI phân tích ảnh'),
    h('div', { class: 'analysis' }, h('div', {}, h('div', { class: 'muted' }, 'Lúc vào'), analysisLine(ain)),
      h('div', {}, h('div', { class: 'muted' }, 'Lúc ra'), analysisLine(aout))),
    note ? h('div', { class: 'muted' }, `So sánh: ${note}`) : null,
    ...alerts.map((a) => h('div', { class: a.status === 'new' ? 'warn-text' : 'muted' },
      `${a.level === 'high' ? '⛔' : '⚠️'} ${a.message}${a.status === 'resolved' ? ` — đã xử lý (${a.resolution})` : ''}`)));
  if (!ctx.isManager()) return card;
  for (const [label, p] of [['lúc vào', pin], ['lúc ra', pout]]) {
    if (!p) continue;
    const a = p.analysis || {};
    const color = h('select', { 'data-edit': `color-${p.kind}` }, COLOR_GROUPS.map((c) => h('option', { value: c, selected: c === a.color }, c)));
    const onV = h('input', { type: 'number', min: '0', max: '6', value: String(a.helmetsOnVehicle ?? 0), 'data-edit': `onv-${p.kind}` });
    const worn = h('input', { type: 'number', min: '0', max: '6', value: String(a.helmetsWorn ?? 0), 'data-edit': `worn-${p.kind}` });
    const save = h('button', { type: 'button', class: 'small', 'data-edit': `save-${p.kind}` }, `Lưu sửa ảnh ${label}`);
    save.addEventListener('click', async () => {
      const r = await call('setAnalysis', { photoId: p.id, color: color.value, helmetsOnVehicle: Number(onV.value), helmetsWorn: Number(worn.value) });
      if (!r.ok) { toast(r.error.code === 'OFFLINE' ? 'Cần có mạng' : r.error.message || 'Lỗi', { error: true }); return; }
      await db.putAnalyses([{ ...r.data.analysis, id: p.id, sessionId: s.id, kind: p.kind }]);
      toast(`Đã sửa kết quả AI ảnh ${label}${r.data.newAlerts ? ` · ${r.data.newAlerts} cảnh báo mới` : ''}`);
      sync.syncNow();
    });
    card.append(h('details', {}, h('summary', { class: 'muted' }, `Sửa tay kết quả AI ảnh ${label}`),
      h('label', {}, 'Màu xe'), color, h('div', { class: 'row' }, h('div', {}, h('label', {}, 'Mũ trên xe'), onV), h('div', {}, h('label', {}, 'Mũ đội'), worn)), save));
  }
  return card;
}

/**
 * Lưu ảnh về điện thoại. Ảnh của app nằm TRONG app (không tự vào thư viện ảnh) và được sao lưu ở Google Drive
 * (GoMay-GiuXe/Anh/ngày). Nút này: điện thoại hỗ trợ thì mở bảng chia sẻ (chọn "Lưu hình ảnh"), không thì tải file.
 */
function savePhotosRow(s) {
  const mk = (photoId, kind) => {
    if (!photoId) return null;
    const b = h('button', { type: 'button', class: 'small', 'data-save': kind }, `⬇ Lưu ảnh lúc ${kind === 'in' ? 'vào' : 'ra'}`);
    b.addEventListener('click', async () => {
      const r = await db.getPhotoResult(photoId);
      if (!r.blob) { toast('Chưa có ảnh này trên máy hoặc máy chủ', { error: true }); return; }
      const name = `GoMay_phieu${formatNo(s.ticketNo)}_${s.ticketDate}_${kind === 'in' ? 'vao' : 'ra'}.jpg`;
      const file = new File([r.blob], name, { type: 'image/jpeg' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      const url = URL.createObjectURL(r.blob);
      const a = h('a', { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
    return b;
  };
  return h('div', { class: 'row', style: 'margin-top:8px' }, mk(s.inPhotoId, 'in'), mk(s.outPhotoId, 'out'));
}
