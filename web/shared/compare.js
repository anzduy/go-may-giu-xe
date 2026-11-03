// So sánh phân tích ảnh lúc vào và lúc ra → cảnh báo (research.md R6). Logic thuần, dùng chung Apps Script + test.
// Chỉ cảnh báo khi CẢ HAI kết quả đủ chắc chắn — cảnh báo là gợi ý để kiểm tra, không phải kết luận.
import { formatNo } from './ticket.js';
import { normalizePlate } from './sessions.js';

/** Khoảng cách Levenshtein giữa hai biển số đã chuẩn hóa. */
export function plateDistance(a, b) {
  const x = normalizePlate(a), y = normalizePlate(b);
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
  }
  return d[x.length][y.length];
}

const sure = (a, field, th) => !!a && a.confidence && a.confidence[field] >= th;

/**
 * @returns {{kind:'color_mismatch'|'plate_mismatch'|'helmet_missing', level:'high'|'medium', message:string, inValue:string, outValue:string}[]}
 */
export function compareAnalyses(inA, outA, threshold, ticketNo) {
  const out = [];
  const no = formatNo(ticketNo);
  if (!inA || !outA) return out;
  if (sure(inA, 'color', threshold) && sure(outA, 'color', threshold)
    && inA.color !== 'không rõ' && outA.color !== 'không rõ' && inA.color !== outA.color) {
    out.push({ kind: 'color_mismatch', level: 'high', message: `Phiếu ${no}: có thể giao nhầm xe (${inA.color} → ${outA.color})`,
      inValue: inA.color, outValue: outA.color });
  }
  if (inA.plate && outA.plate && sure(inA, 'plate', threshold) && sure(outA, 'plate', threshold)
    && plateDistance(inA.plate, outA.plate) > 1) {
    out.push({ kind: 'plate_mismatch', level: 'high', message: `Phiếu ${no}: biển số khác (${inA.plate} → ${outA.plate})`,
      inValue: inA.plate, outValue: outA.plate });
  }
  if (sure(inA, 'helmets', threshold) && sure(outA, 'helmets', threshold)) {
    const tin = inA.helmetsOnVehicle + inA.helmetsWorn;
    const tout = outA.helmetsOnVehicle + outA.helmetsWorn; // khách đội mũ khi dắt xe ra vẫn tính
    if (tout < tin) {
      out.push({ kind: 'helmet_missing', level: 'medium', message: `Phiếu ${no}: lúc vào ${tin} mũ, lúc ra ${tout} mũ`,
        inValue: String(tin), outValue: String(tout) });
    }
  }
  return out;
}

/** "không đủ rõ để so sánh" khi không có mục nào cả hai ảnh đủ chắc chắn. */
export function compareNote(inA, outA, threshold) {
  if (!inA || !outA) return 'chưa đủ ảnh để so sánh';
  const any = ['color', 'helmets'].some((f) => sure(inA, f, threshold) && sure(outA, f, threshold))
    || (inA.plate && outA.plate && sure(inA, 'plate', threshold) && sure(outA, 'plate', threshold));
  return any ? '' : 'không đủ rõ để so sánh';
}

/**
 * Tạo các dòng cảnh báo MỚI cho một lượt đã trả xe (tối đa 1 cảnh báo mỗi loại mỗi lượt).
 * Dùng chung cho Apps Script (gas/Alerts.js) và máy chủ giả trong test.
 */
export function newAlertsForSession(session, inA, outA, existing, threshold, nowIso, makeId) {
  if (!session || !['returned', 'lost'].includes(session.status)) return [];
  const have = new Set((existing || []).filter((a) => a.sessionId === session.id).map((a) => a.kind));
  return compareAnalyses(inA, outA, threshold, session.ticketNo)
    .filter((a) => !have.has(a.kind))
    .map((a) => ({ id: makeId(), sessionId: session.id, ...a, createdAt: nowIso, notifyStaffId: session.outStaffId, status: 'new' }));
}
