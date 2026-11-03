// Phân tích ảnh xe bằng AI: câu lệnh gửi AI, kiểm tra/chuẩn hóa kết quả, tóm tắt "Xe máy màu đỏ · 2 mũ".
// Logic thuần — dùng chung Apps Script (gas/Vision.js) và test. Việc gọi AI nằm ở gas/Vision.js.
import { VEHICLE_TYPES } from './pricing.js';
import { normalizePlate, PLATE_STATUS } from './sessions.js';

export const COLOR_GROUPS = ['đỏ', 'xanh dương', 'xanh lá', 'đen', 'trắng', 'xám/bạc', 'vàng', 'cam', 'nâu', 'hồng/tím', 'không rõ'];
export const DEFAULT_THRESHOLD = 0.7;

/** JSON Schema cho kết quả (dùng cho structured outputs của Claude và responseSchema của Gemini). */
export const VISION_SCHEMA = {
  type: 'object',
  properties: {
    plate: { type: 'string', description: 'Biển số Việt Nam như in trên xe, ví dụ "59X1-123.45"; chuỗi rỗng nếu không đọc được' },
    color: { type: 'string', enum: COLOR_GROUPS },
    vehicleType: { type: 'string', enum: ['motorbike', 'ebike', 'bicycle', 'other'] },
    helmetsOnVehicle: { type: 'integer', description: 'Số mũ bảo hiểm treo/để trên xe' },
    helmetsWorn: { type: 'integer', description: 'Số mũ bảo hiểm đang đội trên đầu người trong ảnh' },
    otherItems: { type: 'array', items: { type: 'string' } },
    confidence: {
      type: 'object',
      properties: { plate: { type: 'number' }, color: { type: 'number' }, helmets: { type: 'number' } },
      required: ['plate', 'color', 'helmets'],
      additionalProperties: false,
    },
  },
  required: ['plate', 'color', 'vehicleType', 'helmetsOnVehicle', 'helmetsWorn', 'otherItems', 'confidence'],
  additionalProperties: false,
};

export function visionPrompt() {
  return [
    'Đây là ảnh chụp một chiếc xe tại bãi giữ xe của sân bóng ở Việt Nam (thường là xe máy).',
    'Hãy trả về JSON đúng schema, gồm:',
    '- plate: biển số xe Việt Nam đúng như in (ví dụ "59X1-123.45", biển 2 dòng thì nối bằng dấu cách); chuỗi rỗng nếu không thấy rõ — KHÔNG đoán.',
    `- color: màu chính của thân xe, chọn một trong: ${COLOR_GROUPS.join(', ')}.`,
    '- vehicleType: motorbike (xe máy xăng), ebike (xe điện), bicycle (xe đạp), other.',
    '- helmetsOnVehicle: số mũ bảo hiểm treo hoặc để trên xe. helmetsWorn: số mũ đang đội trên đầu người trong ảnh.',
    '- otherItems: đồ dễ thấy khác trên xe (áo mưa, túi, balo...), danh sách ngắn bằng tiếng Việt.',
    '- confidence: mức chắc chắn từ 0 đến 1 cho plate, color, helmets. Ảnh tối/mờ/bị che thì để thấp.',
    'Nếu ảnh có nhiều xe, chỉ mô tả chiếc xe chính ở giữa khung hình.',
  ].join('\n');
}

const COLOR_ALIASES = [
  [/hồng|tím|pink|purple|violet/, 'hồng/tím'],
  [/xanh\s*lá|xanh\s*lục|green|lá cây/, 'xanh lá'],
  [/xanh|blue|navy|dương|lam/, 'xanh dương'],
  [/đỏ|red|đô/, 'đỏ'],
  [/đen|black/, 'đen'],
  [/trắng|white/, 'trắng'],
  [/xám|bạc|ghi|gray|grey|silver/, 'xám/bạc'],
  [/vàng|yellow|gold/, 'vàng'],
  [/cam|orange/, 'cam'],
  [/nâu|brown|be|kem/, 'nâu'],
];

export function normalizeColor(text) {
  const t = String(text || '').toLowerCase().trim();
  if (COLOR_GROUPS.includes(t)) return t;
  for (const [re, group] of COLOR_ALIASES) if (re.test(t)) return group;
  return 'không rõ';
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num01 = (v) => (typeof v === 'number' && isFinite(v) ? clamp(v, 0, 1) : 0);
const helmets = (v) => (typeof v === 'number' && isFinite(v) ? clamp(Math.round(v), 0, 6) : 0);

/** Biển số hợp lý: 2 số tỉnh + chữ + số, 6–10 ký tự sau khi chuẩn hóa. */
function plausiblePlate(plate) {
  const n = normalizePlate(plate);
  return /^\d{2}[A-Z]{1,2}\d{0,2}\d{3,6}$/.test(n) && n.length >= 6 && n.length <= 10;
}

/**
 * Đọc chuỗi trả về từ AI → kết quả đã kiểm tra.
 * @returns {{ok:true, analysis:object} | {ok:false, error:string}}
 */
export function parseVisionResponse(text) {
  let raw = String(text || '').trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(raw);
  if (fence) raw = fence[1];
  let o;
  try { o = JSON.parse(raw); } catch { return { ok: false, error: 'BAD_JSON' }; }
  if (!o || typeof o !== 'object') return { ok: false, error: 'BAD_JSON' };
  const c = o.confidence || {};
  const confidence = { plate: num01(c.plate), color: num01(c.color), helmets: num01(c.helmets) };
  const plate = plausiblePlate(o.plate) ? String(o.plate).toUpperCase().replace(/\s+/g, ' ').trim() : '';
  const analysis = {
    plate,
    color: normalizeColor(o.color),
    vehicleType: ['motorbike', 'ebike', 'bicycle'].includes(o.vehicleType) ? o.vehicleType : 'other',
    helmetsOnVehicle: helmets(o.helmetsOnVehicle),
    helmetsWorn: helmets(o.helmetsWorn),
    otherItems: Array.isArray(o.otherItems) ? o.otherItems.map(String).filter(Boolean).slice(0, 8) : [],
    confidence,
  };
  if (!plate) confidence.plate = 0;
  if (analysis.color === 'không rõ') confidence.color = 0;
  const anyConfident = (plate && confidence.plate >= DEFAULT_THRESHOLD) || confidence.color >= DEFAULT_THRESHOLD || confidence.helmets >= DEFAULT_THRESHOLD;
  analysis.status = anyConfident ? 'done' : 'unclear';
  return { ok: true, analysis };
}

/** "Xe máy màu đỏ · 2 mũ" — chỉ nói phần AI đủ chắc chắn. */
export function summarizeAnalysis(a, vehicleType, threshold = DEFAULT_THRESHOLD) {
  if (!a) return '';
  let s = VEHICLE_TYPES[vehicleType] || 'Xe';
  if (a.confidence.color >= threshold && a.color !== 'không rõ') s += ` màu ${a.color}`;
  const total = a.helmetsOnVehicle + a.helmetsWorn;
  if (a.confidence.helmets >= threshold) s += total ? ` · ${total} mũ` : ' · không mũ';
  return s === (VEHICLE_TYPES[vehicleType] || 'Xe') ? '' : s;
}

/** Gắn kết quả phân tích ẢNH LÚC VÀO vào lượt gửi (không ghi đè biển số đã sửa tay). */
export function applyInAnalysis(session, a, threshold = DEFAULT_THRESHOLD) {
  const out = { ...session, inSummary: summarizeAnalysis(a, session.vehicleType, threshold) };
  if (session.plateStatus !== PLATE_STATUS.MANUAL) {
    const ok = a.plate && a.confidence.plate >= threshold;
    out.plate = ok ? a.plate : session.plate || '';
    out.plateStatus = out.plate ? PLATE_STATUS.READ : PLATE_STATUS.UNREADABLE;
  }
  return out;
}
