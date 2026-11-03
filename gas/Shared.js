// GENERATED from web/shared — do not edit

// ---- ticket.js ----
// Logic phiếu QR: số thứ tự, mã QR có mã kiểm tra, nhảy số, kiểm tra hợp lệ.
// Thuần JavaScript (không dùng API trình duyệt/Apps Script) để dùng chung web + Apps Script + test.

const QR_PREFIX = 'GM1';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Việt Nam UTC+7, không có giờ mùa hè

/** Số phiếu luôn hiển thị 3 chữ số: 7 → "007". */
function formatNo(n) {
  return String(n).padStart(3, '0');
}

/** Số nhân viên gõ tay ("037" hoặc "37") → 37; không hợp lệ → null. */
function parseTypedNumber(text) {
  const t = String(text == null ? '' : text).trim();
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n > 0 ? n : null;
}

/** Ngày theo giờ Việt Nam dạng YYYYMMDD từ mốc thời gian (ms hoặc chuỗi ISO). */
function dateKey(time) {
  const ms = typeof time === 'number' ? time : Date.parse(time);
  return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '');
}

// ---------- SHA-256 / HMAC thuần JS (đồng bộ, chạy được cả trên máy lẫn Apps Script) ----------
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function utf8Bytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
      c = 0x10000 + ((c - 0xd800) << 10) + (str.charCodeAt(++i) - 0xdc00);
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function sha256Bytes(bytes) {
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const msg = bytes.slice();
  const bitLen = bytes.length * 8;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  for (let i = 7; i >= 0; i--) msg.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff);
  const w = new Array(64);
  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = (msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) | (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3];
    }
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  const out = [];
  for (const v of h) out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  return out;
}

function toHex(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sha256Hex(text) {
  return toHex(sha256Bytes(utf8Bytes(String(text))));
}

/** HMAC-SHA256 (hex chữ thường). */
function hmacSha256Hex(key, message) {
  let k = utf8Bytes(String(key));
  if (k.length > 64) k = sha256Bytes(k);
  while (k.length < 64) k.push(0);
  const ipad = k.map((b) => b ^ 0x36);
  const opad = k.map((b) => b ^ 0x5c);
  const inner = sha256Bytes(ipad.concat(utf8Bytes(String(message))));
  return toHex(sha256Bytes(opad.concat(inner)));
}

// ---------- Mã QR trên phiếu ----------
function qrCheck(date, no, secret) {
  return hmacSha256Hex(secret, `${date}|${formatNo(no)}`).slice(0, 6);
}

/** Nội dung QR: GM1|YYYYMMDD|NNN|ck */
function encodeQr(date, no, secret) {
  return `${QR_PREFIX}|${date}|${formatNo(no)}|${qrCheck(date, no, secret)}`;
}

function parseQr(text, secret) {
  const m = /^GM1\|(\d{8})\|(\d{3,4})\|([0-9a-f]{6})$/.exec(String(text || '').trim());
  if (!m) return { ok: false, error: 'TICKET_INVALID' };
  const no = parseInt(m[2], 10);
  if (!(no > 0) || qrCheck(m[1], no, secret) !== m[3]) return { ok: false, error: 'TICKET_INVALID' };
  return { ok: true, date: m[1], no };
}

// ---------- Nhảy số, kiểm tra hợp lệ ----------
const USED_STATUSES = ['returned', 'lost', 'provisional'];

function sameTicket(s, date, no) {
  return s.ticketDate === date && Number(s.ticketNo) === Number(no) && s.status !== 'cancelled';
}

/** Số đề xuất tiếp theo = số vừa dùng + 1, bỏ qua các số bị chặn (đang có xe / đã dùng). */
function suggestNext(lastNo, blocked) {
  let n = (Number(lastNo) || 0) + 1;
  while (blocked && blocked.has(n)) n++;
  return n;
}

/** Các số của ngày `date` không dùng lại được (đang có xe, đã trả, báo mất). */
function blockedNumbers(sessions, date) {
  const set = new Set();
  for (const s of sessions) if (s.ticketDate === date && s.status !== 'cancelled') set.add(Number(s.ticketNo));
  return set;
}

function maxTicketNo(batches, date) {
  let max = 0;
  for (const b of batches || []) if (b.date === date && Number(b.toNo) > max) max = Number(b.toNo);
  return max;
}

/**
 * Kiểm tra trước khi gửi xe. Vượt bộ phiếu chỉ là CẢNH BÁO (máy offline có thể chưa biết bộ phiếu mới).
 * @returns {{ok:true, warning?:string} | {ok:false, error:string, session?:object}}
 */
function validateForCheckin({ ticketDate, ticketNo, noTicket }, { today, sessions, batches }) {
  if (!(Number(ticketNo) > 0)) return { ok: false, error: 'BAD_REQUEST' };
  if (ticketDate !== today) return { ok: false, error: 'TICKET_WRONG_DATE' };
  for (const s of sessions) {
    if (!sameTicket(s, ticketDate, ticketNo)) continue;
    if (s.status === 'in_lot') return { ok: false, error: 'TICKET_IN_USE', session: s };
    if (USED_STATUSES.includes(s.status)) return { ok: false, error: 'TICKET_USED', session: s };
  }
  if (!noTicket && Number(ticketNo) > maxTicketNo(batches, today)) return { ok: true, warning: 'TICKET_OUT_OF_RANGE' };
  return { ok: true };
}

/**
 * Tìm lượt để trả xe theo QR (có ngày) hoặc theo số gõ tay (không ngày).
 * @returns {{ok:true, matches:object[]} | {ok:false, error:string, session?:object}}
 */
function validateForCheckout(sessions, { ticketDate, ticketNo }) {
  const same = sessions.filter((s) => Number(s.ticketNo) === Number(ticketNo) && s.status !== 'cancelled'
    && (!ticketDate || s.ticketDate === ticketDate));
  const matches = same.filter((s) => s.status === 'in_lot');
  if (matches.length) return { ok: true, matches };
  const latest = same.sort((a, b) => String(b.outAt || b.inAt).localeCompare(String(a.outAt || a.inAt)))[0];
  if (!latest) return { ok: false, error: 'SESSION_NOT_FOUND' };
  if (latest.status === 'lost') return { ok: false, error: 'TICKET_LOST', session: latest };
  return { ok: false, error: 'TICKET_USED', session: latest };
}

/** Số bị bỏ qua: chưa dùng nhưng nhỏ hơn số lớn nhất đã dùng trong ngày. */
function computeSkipped(sessions, date) {
  const used = blockedNumbers(sessions, date);
  const max = Math.max(0, ...used);
  const out = [];
  for (let n = 1; n < max; n++) if (!used.has(n)) out.push(n);
  return out;
}

/** Số phiếu còn lại = số lớn nhất đã tạo − số lớn nhất đã dùng (số bỏ qua không tính là còn). */
function remainingTickets(batches, sessions, date) {
  const used = blockedNumbers(sessions, date);
  return Math.max(0, maxTicketNo(batches, date) - Math.max(0, ...used));
}

const MESSAGES = {
  TICKET_IN_USE: (no) => `Phiếu ${formatNo(no)} đang có xe trong bãi`,
  TICKET_USED: (no) => `Phiếu ${formatNo(no)} đã được dùng`,
  TICKET_LOST: (no) => `Phiếu ${formatNo(no)} đã báo mất`,
  TICKET_WRONG_DATE: () => 'Phiếu của ngày khác',
  TICKET_OUT_OF_RANGE: (no) => `Số ${formatNo(no)} vượt quá số phiếu đã tạo hôm nay`,
  TICKET_INVALID: () => 'Mã không phải phiếu Gò Mây Arena',
  SESSION_NOT_FOUND: () => 'Phiếu này chưa gửi xe nào',
};

/** Câu thông báo tiếng Việt cho mã lỗi phiếu. */
function ticketMessage(code, no) {
  const f = MESSAGES[code];
  return f ? f(no) : code;
}

// ---- pricing.js ----
// Bảng giá: đồng giá mỗi lượt theo loại xe, phí mất phiếu (tổng tiền, không cộng giá thường).

const VEHICLE_TYPES = { motorbike: 'Xe máy', ebike: 'Xe điện', bicycle: 'Xe đạp' };
const DEFAULT_PRICES = { motorbike: 5000, ebike: 5000, bicycle: 5000, lostFee: 10000 };

/** Bảng giá có hiệu lực tại thời điểm `at` (mới nhất có effectiveFrom ≤ at). */
function priceRuleAt(rules, at) {
  let best = null;
  for (const r of rules || []) {
    if (String(r.effectiveFrom) <= String(at) && (!best || String(r.effectiveFrom) > String(best.effectiveFrom))) best = r;
  }
  return best || DEFAULT_PRICES;
}

function priceFor(rules, vehicleType, at) {
  const rule = priceRuleAt(rules, at);
  const v = Number(rule[vehicleType]);
  return v > 0 ? v : DEFAULT_PRICES[vehicleType] || DEFAULT_PRICES.motorbike;
}

function lostFee(rules, at) {
  const v = Number(priceRuleAt(rules, at).lostFee);
  return v > 0 ? v : DEFAULT_PRICES.lostFee;
}

/** 5000 → "5.000đ" */
function formatMoney(v) {
  return `${String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
}

// ---- sessions.js ----
// Vòng đời một lượt gửi xe. Không có thao tác nào xóa lượt (constitution, Nguyên tắc IV).

const STATUS = {
  IN_LOT: 'in_lot', RETURNED: 'returned', LOST: 'lost', PROVISIONAL: 'provisional', CANCELLED: 'cancelled',
};
const PLATE_STATUS = { PENDING: 'pending', READ: 'read', UNREADABLE: 'unreadable', MANUAL: 'manual' };
const UNDO_WINDOW_MS = 10 * 1000;

function normalizePlate(plate) {
  return String(plate || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Biển số để hiển thị: viết hoa, gọn khoảng trắng ("59x1 123.45" → "59X1 123.45"). So sánh dùng normalizePlate. */
function displayPlate(plate) {
  return String(plate || '').toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 20);
}

/**
 * Xe vừa gửi (bởi máy này, sau mốc `sinceIso`) có biển số trùng một xe khác đang trong bãi?
 * Dùng để hiện cảnh báo nhẹ, KHÔNG chặn thao tác.
 * @returns {{session:object, other:object} | null}
 */
function findPlateDuplicate(sessions, deviceId, sinceIso) {
  const inLot = sessions.filter((s) => s.status === STATUS.IN_LOT && normalizePlate(s.plate).length >= 6);
  const recent = inLot.filter((s) => s.inDeviceId === deviceId && String(s.inAt) >= String(sinceIso))
    .sort((a, b) => String(b.inAt).localeCompare(String(a.inAt)));
  for (const s of recent) {
    const other = inLot.find((o) => o.id !== s.id && normalizePlate(o.plate) === normalizePlate(s.plate));
    if (other) return { session: s, other };
  }
  return null;
}

function hasNote(p) {
  return typeof p.note === 'string' && p.note.trim().length > 0;
}

/**
 * Áp một thao tác lên một lượt gửi (không sửa object gốc).
 * @returns {{session:object} | {error:string}}
 */
function applyOp(session, op, ctx = {}) {
  const p = op.payload || {};
  if (!session) return { error: 'SESSION_NOT_FOUND' };
  switch (op.type) {
    case 'checkout':
    case 'lostCheckout': {
      if (session.status !== STATUS.IN_LOT) return { error: session.status === STATUS.LOST ? 'TICKET_LOST' : 'TICKET_USED' };
      if (!p.outAt || !p.outPhotoId) return { error: 'BAD_REQUEST' };
      const lost = op.type === 'lostCheckout';
      if (lost && !hasNote(p)) return { error: 'NOTE_REQUIRED' };
      const fee = lost ? Number(p.fee != null ? p.fee : ctx.lostFee) : Number(session.priceAtIn);
      return {
        session: {
          ...session,
          status: lost ? STATUS.LOST : STATUS.RETURNED,
          outAt: p.outAt, outStaffId: op.staffId, outPhotoId: p.outPhotoId, fee,
          ...(lost ? { note: p.note.trim() } : {}),
        },
      };
    }
    case 'undo': {
      if (session.status !== STATUS.IN_LOT) return { error: 'UNDO_EXPIRED' };
      const elapsed = Date.parse(op.createdAt) - Date.parse(session.inAt);
      if (op.staffId !== session.inStaffId || !(elapsed >= 0 && elapsed <= UNDO_WINDOW_MS)) return { error: 'UNDO_EXPIRED' };
      return { session: { ...session, status: STATUS.CANCELLED, note: 'Hoàn tác' } };
    }
    case 'cancel': {
      if (!hasNote(p)) return { error: 'NOTE_REQUIRED' };
      return { session: { ...session, status: STATUS.CANCELLED, note: p.note.trim() } };
    }
    case 'setPlate':
      return { session: { ...session, plate: displayPlate(p.plate), plateStatus: PLATE_STATUS.MANUAL } };
    default:
      return { error: 'BAD_REQUEST' };
  }
}

/** Tạo lượt "trả xe tạm" khi máy cổng ra chưa có dữ liệu lượt gửi. */
function createProvisional(p, staffId) {
  if (!hasNote(p)) return { error: 'NOTE_REQUIRED' };
  if (!p.id || !p.ticketDate || !(Number(p.ticketNo) > 0) || !p.outAt || !p.outPhotoId) return { error: 'BAD_REQUEST' };
  return {
    session: {
      id: p.id, ticketDate: p.ticketDate, ticketNo: Number(p.ticketNo), noTicket: false,
      status: STATUS.PROVISIONAL, outAt: p.outAt, outStaffId: staffId, outPhotoId: p.outPhotoId,
      note: p.note.trim(), fee: null, plateStatus: PLATE_STATUS.PENDING,
    },
  };
}

// ---- vision.js ----
// Phân tích ảnh xe bằng AI: câu lệnh gửi AI, kiểm tra/chuẩn hóa kết quả, tóm tắt "Xe máy màu đỏ · 2 mũ".
// Logic thuần — dùng chung Apps Script (gas/Vision.js) và test. Việc gọi AI nằm ở gas/Vision.js.

const COLOR_GROUPS = ['đỏ', 'xanh dương', 'xanh lá', 'đen', 'trắng', 'xám/bạc', 'vàng', 'cam', 'nâu', 'hồng/tím', 'không rõ'];
const DEFAULT_THRESHOLD = 0.7;

/** JSON Schema cho kết quả (dùng cho structured outputs của Claude và responseSchema của Gemini). */
const VISION_SCHEMA = {
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

function visionPrompt() {
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

function normalizeColor(text) {
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
function parseVisionResponse(text) {
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
function summarizeAnalysis(a, vehicleType, threshold = DEFAULT_THRESHOLD) {
  if (!a) return '';
  let s = VEHICLE_TYPES[vehicleType] || 'Xe';
  if (a.confidence.color >= threshold && a.color !== 'không rõ') s += ` màu ${a.color}`;
  const total = a.helmetsOnVehicle + a.helmetsWorn;
  if (a.confidence.helmets >= threshold) s += total ? ` · ${total} mũ` : ' · không mũ';
  return s === (VEHICLE_TYPES[vehicleType] || 'Xe') ? '' : s;
}

/** Gắn kết quả phân tích ẢNH LÚC VÀO vào lượt gửi (không ghi đè biển số đã sửa tay). */
function applyInAnalysis(session, a, threshold = DEFAULT_THRESHOLD) {
  const out = { ...session, inSummary: summarizeAnalysis(a, session.vehicleType, threshold) };
  if (session.plateStatus !== PLATE_STATUS.MANUAL) {
    const ok = a.plate && a.confidence.plate >= threshold;
    out.plate = ok ? a.plate : session.plate || '';
    out.plateStatus = out.plate ? PLATE_STATUS.READ : PLATE_STATUS.UNREADABLE;
  }
  return out;
}

// ---- merge.js ----
// Gộp bản ghi từ máy chủ vào bản trên máy.

/**
 * Máy chủ thắng, trừ khi máy còn thao tác chưa gửi cho lượt này (giữ bản trên máy để không "nhảy ngược").
 * Cờ xung đột từ máy chủ luôn được giữ để nhân viên/quản lý thấy.
 */
function mergeServerSession(local, server, pendingSessionIds) {
  if (!local) return server;
  if (pendingSessionIds && pendingSessionIds.has(server.id)) {
    return server.conflict ? { ...local, conflict: server.conflict } : local;
  }
  return server;
}

// ---- server-ops.js ----
// Xử lý các thao tác `push` gửi từ máy lên. Logic thuần, dùng chung cho Apps Script (gas/Sessions.js)
// và máy chủ giả trong test (tests/e2e/fixtures/mock-api.js), để test kiểm tra đúng logic thật.

/** Trạng thái máy chủ dùng cho applyPush. sessions: Map id → lượt gửi. */
function newState() {
  return { sessions: new Map(), batches: [], prices: [], appliedOpIds: new Set() };
}

function findOpen(state, date, no, status) {
  for (const s of state.sessions.values()) {
    if (s.ticketDate === date && Number(s.ticketNo) === Number(no) && s.status === status && !s.mergedInto) return s;
  }
  return null;
}

function opCreateSession(state, op) {
  const p = op.payload || {};
  if (!p.id || !p.ticketDate || !(Number(p.ticketNo) > 0) || !p.inAt || !p.inPhotoId) return { status: 'rejected', error: 'BAD_REQUEST' };
  if (state.sessions.has(p.id)) return { status: 'duplicate', session: state.sessions.get(p.id) };

  const others = [...state.sessions.values()].filter((s) => s.id !== p.id);
  const check = validateForCheckin(
    { ticketDate: p.ticketDate, ticketNo: p.ticketNo, noTicket: !!p.noTicket },
    { today: dateKey(p.inAt), sessions: others, batches: state.batches },
  );
  let conflict;
  if (!check.ok) {
    conflict = { TICKET_IN_USE: 'duplicate_ticket', TICKET_USED: 'ticket_used', TICKET_WRONG_DATE: 'wrong_date' }[check.error] || 'invalid';
  } else if (!p.noTicket && Number(p.ticketNo) > maxTicketNo(state.batches, p.ticketDate)) {
    conflict = 'out_of_range';
  }
  // Ngoại lệ: lượt "trả xe tạm" đang chờ ghép không tính là trùng số.
  const provisional = findOpen(state, p.ticketDate, p.ticketNo, STATUS.PROVISIONAL);
  if (provisional && conflict === 'ticket_used') conflict = undefined;

  const vehicleType = ['motorbike', 'ebike', 'bicycle'].includes(p.vehicleType) ? p.vehicleType : 'motorbike';
  let session = {
    id: p.id, ticketDate: p.ticketDate, ticketNo: Number(p.ticketNo), noTicket: !!p.noTicket, vehicleType,
    plate: p.plate || '', plateStatus: PLATE_STATUS.PENDING, inAt: p.inAt, inStaffId: op.staffId,
    inDeviceId: op.deviceId, inPhotoId: p.inPhotoId, priceAtIn: priceFor(state.prices, vehicleType, p.inAt),
    status: STATUS.IN_LOT, note: p.note || '',
  };
  if (conflict) session.conflict = conflict;

  const changed = [];
  let action = 'create';
  if (provisional && !conflict) {
    session = { ...session, status: STATUS.RETURNED, outAt: provisional.outAt, outStaffId: provisional.outStaffId,
      outPhotoId: provisional.outPhotoId, fee: session.priceAtIn, note: provisional.note };
    const merged = { ...provisional, status: STATUS.CANCELLED, mergedInto: session.id };
    state.sessions.set(merged.id, merged);
    changed.push(merged);
    action = 'merge_provisional';
  }
  state.sessions.set(session.id, session);
  changed.unshift(session);
  return { status: conflict ? 'conflict' : 'applied', error: conflict, session, changed, action };
}

function opTransition(state, op, action) {
  const p = op.payload || {};
  const current = state.sessions.get(p.sessionId);
  if (!current) return { status: 'rejected', error: 'SESSION_NOT_FOUND' };
  const r = applyOp(current, op);
  if (r.error) {
    if (op.type === 'checkout' && r.error === 'TICKET_USED') {
      const flagged = { ...current, conflict: 'double_checkout' };
      state.sessions.set(flagged.id, flagged);
      return { status: 'conflict', error: 'double_checkout', session: flagged, changed: [flagged], action: 'conflict' };
    }
    return { status: 'rejected', error: r.error, session: current };
  }
  state.sessions.set(r.session.id, r.session);
  return { status: 'applied', session: r.session, changed: [r.session], action };
}

function opProvisional(state, op) {
  const p = op.payload || {};
  if (state.sessions.has(p.id)) return { status: 'duplicate', session: state.sessions.get(p.id) };
  const open = findOpen(state, p.ticketDate, p.ticketNo, STATUS.IN_LOT);
  if (open) {
    // Máy chủ đã có lượt gửi → trả luôn lượt đó.
    return opTransition(state, { ...op, type: 'checkout', payload: { sessionId: open.id, outAt: p.outAt, outPhotoId: p.outPhotoId } }, 'checkout');
  }
  const r = createProvisional(p, op.staffId);
  if (r.error) return { status: 'rejected', error: r.error };
  state.sessions.set(r.session.id, r.session);
  return { status: 'applied', session: r.session, changed: [r.session], action: 'provisional' };
}

const HANDLERS = {
  createSession: opCreateSession,
  checkout: (st, op) => opTransition(st, op, 'checkout'),
  undo: (st, op) => opTransition(st, op, 'undo'),
  provisionalCheckout: opProvisional,
  setPlate: (st, op) => opTransition(st, op, 'set_plate'),
};

/**
 * Áp danh sách thao tác. Sửa trực tiếp `state` (sessions, appliedOpIds).
 * Mỗi op: { opId, type, payload, createdAt, staffId, deviceId } — staffId/deviceId do máy chủ gắn từ token.
 * @returns {{results:object[], changed:object[], audits:object[]}}
 */
function applyPush(state, ops) {
  const results = [];
  const changed = new Map();
  const audits = [];
  for (const op of ops || []) {
    if (!op || !op.opId) { results.push({ opId: op && op.opId, status: 'rejected', error: 'BAD_REQUEST' }); continue; }
    if (state.appliedOpIds.has(op.opId)) { results.push({ opId: op.opId, status: 'duplicate' }); continue; }
    const handler = HANDLERS[op.type];
    const r = handler ? handler(state, op) : { status: 'rejected', error: 'BAD_REQUEST' };
    state.appliedOpIds.add(op.opId);
    for (const s of r.changed || []) changed.set(s.id, s);
    if (r.action) {
      audits.push({ at: op.createdAt, staffId: op.staffId, deviceId: op.deviceId, action: r.action,
        sessionId: r.session && r.session.id, detail: { opId: op.opId, type: op.type, conflict: r.error || null } });
    }
    results.push({ opId: op.opId, status: r.status, ...(r.error ? { error: r.error } : {}), ...(r.session ? { session: r.session } : {}) });
  }
  return { results, changed: [...changed.values()], audits };
}
