// ===== App Giữ Xe Gò Mây Arena — máy chủ Google Apps Script (FILE GỘP, tự sinh, không sửa tay) =====
// Cách dùng: dán TOÀN BỘ file này vào một file duy nhất trong Apps Script, lưu, rồi chạy hàm setup().
// Nguồn: thư mục gas/ (Shared.js, Admin.js, Alerts.js, Auth.js, Cleanup.js, Db.js, Main.js, Photos.js, Sessions.js, Setup.js, Vision.js) — sinh bằng: npm run build:gas

// ==================== Shared.js ====================
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

// ---- report.js ----
// Báo cáo chốt ca / doanh thu. Logic thuần, dùng chung app (chốt ca khi offline), Apps Script và test.
// Quy ước: tiền tính cho NGƯỜI TRẢ XE vào lúc trả (outAt); lượt gửi tính cho người nhận xe (inAt).

const VN_MS = 7 * 3600 * 1000;
const PAID = ['returned', 'lost'];

/** [đầu ngày, cuối ngày] giờ Việt Nam của ngày "YYYYMMDD", dạng ISO. */
function dayRange(key) {
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
function summarize({ sessions = [], alerts = [], batches = [], from, to, staffId }) {
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
function reportRows({ sessions = [], alerts = [], batches = [], shifts = [], from, to, groupBy = 'day', staffNames = {} }) {
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

// ---- server-ops.js ----
// Xử lý các thao tác `push` gửi từ máy lên. Logic thuần, dùng chung cho Apps Script (gas/Sessions.js)
// và máy chủ giả trong test (tests/e2e/fixtures/mock-api.js), để test kiểm tra đúng logic thật.

/** Trạng thái máy chủ dùng cho applyPush. sessions: Map id → lượt gửi. */
function newState() {
  return { sessions: new Map(), batches: [], prices: [], shifts: new Map(), alerts: [], appliedOpIds: new Set() };
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

function opLost(state, op) {
  const p = op.payload || {};
  const current = state.sessions.get(p.sessionId);
  if (!current) return { status: 'rejected', error: 'SESSION_NOT_FOUND' };
  const withFee = { ...op, payload: { ...p, fee: lostFee(state.prices, p.outAt || op.createdAt) } };
  return opTransition(state, withFee, 'lost');
}

function opReassign(state, op) {
  const p = op.payload || {};
  const current = state.sessions.get(p.sessionId);
  if (!current) return { status: 'rejected', error: 'SESSION_NOT_FOUND' };
  if (!(typeof p.note === 'string' && p.note.trim())) return { status: 'rejected', error: 'NOTE_REQUIRED' };
  const no = Number(p.ticketNo);
  if (!(no > 0) || current.status === STATUS.CANCELLED) return { status: 'rejected', error: 'BAD_REQUEST' };
  const clash = [...state.sessions.values()].find((s) => s.id !== current.id && s.status === STATUS.IN_LOT
    && s.ticketDate === current.ticketDate && Number(s.ticketNo) === no);
  if (clash) return { status: 'rejected', error: 'TICKET_IN_USE' };
  const updated = { ...current, ticketNo: no, note: [current.note, `Gán lại số ${current.ticketNo}→${no}: ${p.note.trim()}`].filter(Boolean).join(' | ') };
  if (updated.conflict === 'duplicate_ticket' || updated.conflict === 'out_of_range') delete updated.conflict;
  state.sessions.set(updated.id, updated);
  return { status: 'applied', session: updated, changed: [updated], action: 'reassign', detail: { from: Number(current.ticketNo), to: no } };
}

function opCancel(state, op) {
  if (op.role !== 'manager') return { status: 'rejected', error: 'FORBIDDEN' };
  return opTransition(state, op, 'cancel');
}

function opCloseShift(state, op) {
  const p = op.payload || {};
  if (!p.shiftId || !p.startAt || !p.endAt) return { status: 'rejected', error: 'BAD_REQUEST' };
  const summary = summarize({ sessions: [...state.sessions.values()], batches: state.batches, from: p.startAt, to: p.endAt, staffId: op.staffId,
    alerts: (state.alerts || []).filter((a) => a.notifyStaffId === op.staffId) });
  const shift = { id: p.shiftId, staffId: op.staffId, deviceId: op.deviceId, startAt: p.startAt, endAt: p.endAt, summary };
  state.shifts.set(shift.id, shift);
  return { status: 'applied', shift, shiftChanged: shift, action: 'close_shift', detail: { revenue: summary.revenue, count: summary.count } };
}

const HANDLERS = {
  createSession: opCreateSession,
  checkout: (st, op) => opTransition(st, op, 'checkout'),
  undo: (st, op) => opTransition(st, op, 'undo'),
  provisionalCheckout: opProvisional,
  setPlate: (st, op) => opTransition(st, op, 'set_plate'),
  lostCheckout: opLost,
  reassignTicket: opReassign,
  cancel: opCancel,
  closeShift: opCloseShift,
};

/**
 * Áp danh sách thao tác. Sửa trực tiếp `state` (sessions, appliedOpIds).
 * Mỗi op: { opId, type, payload, createdAt, staffId, deviceId } — staffId/deviceId do máy chủ gắn từ token.
 * @returns {{results:object[], changed:object[], audits:object[]}}
 */
function applyPush(state, ops) {
  const results = [];
  const changed = new Map();
  const shifts = [];
  const audits = [];
  for (const op of ops || []) {
    if (!op || !op.opId) { results.push({ opId: op && op.opId, status: 'rejected', error: 'BAD_REQUEST' }); continue; }
    if (state.appliedOpIds.has(op.opId)) { results.push({ opId: op.opId, status: 'duplicate' }); continue; }
    const handler = HANDLERS[op.type];
    const r = handler ? handler(state, op) : { status: 'rejected', error: 'BAD_REQUEST' };
    state.appliedOpIds.add(op.opId);
    for (const s of r.changed || []) changed.set(s.id, s);
    if (r.shiftChanged) shifts.push(r.shiftChanged);
    if (r.action) {
      audits.push({ at: op.createdAt, staffId: op.staffId, deviceId: op.deviceId, action: r.action,
        sessionId: r.session && r.session.id, detail: { opId: op.opId, type: op.type, conflict: r.error || null, ...(r.detail || {}) } });
    }
    results.push({ opId: op.opId, status: r.status, ...(r.error ? { error: r.error } : {}), ...(r.session ? { session: r.session } : {}),
      ...(r.shift ? { shift: r.shift } : {}) });
  }
  return { results, changed: [...changed.values()], shifts, audits };
}

// ---- compare.js ----
// So sánh phân tích ảnh lúc vào và lúc ra → cảnh báo (research.md R6). Logic thuần, dùng chung Apps Script + test.
// Chỉ cảnh báo khi CẢ HAI kết quả đủ chắc chắn — cảnh báo là gợi ý để kiểm tra, không phải kết luận.

/** Khoảng cách Levenshtein giữa hai biển số đã chuẩn hóa. */
function plateDistance(a, b) {
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
function compareAnalyses(inA, outA, threshold, ticketNo) {
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
function compareNote(inA, outA, threshold) {
  if (!inA || !outA) return 'chưa đủ ảnh để so sánh';
  const any = ['color', 'helmets'].some((f) => sure(inA, f, threshold) && sure(outA, f, threshold))
    || (inA.plate && outA.plate && sure(inA, 'plate', threshold) && sure(outA, 'plate', threshold));
  return any ? '' : 'không đủ rõ để so sánh';
}

/**
 * Tạo các dòng cảnh báo MỚI cho một lượt đã trả xe (tối đa 1 cảnh báo mỗi loại mỗi lượt).
 * Dùng chung cho Apps Script (gas/Alerts.js) và máy chủ giả trong test.
 */
function newAlertsForSession(session, inA, outA, existing, threshold, nowIso, makeId) {
  if (!session || !['returned', 'lost'].includes(session.status)) return [];
  const have = new Set((existing || []).filter((a) => a.sessionId === session.id).map((a) => a.kind));
  return compareAnalyses(inA, outA, threshold, session.ticketNo)
    .filter((a) => !have.has(a.kind))
    .map((a) => ({ id: makeId(), sessionId: session.id, ...a, createdAt: nowIso, notifyStaffId: session.outStaffId, status: 'new' }));
}

// ==================== Admin.js ====================
// Chức năng quản lý: tạo bộ phiếu ngày (giao diện in ở web/js/screens/print.js), báo cáo, bảng giá.

function createBatch(d, auth) {
  var date = String(d.date || '');
  var count = Number(d.count || 0);
  if (!/^\d{8}$/.test(date)) throw err_('BAD_REQUEST', 'Ngày không hợp lệ');
  if (!(count >= 1 && count <= 500)) throw err_('BAD_REQUEST', 'Số lượng phiếu phải từ 1 đến 500');
  var secret = PropertiesService.getScriptProperties().getProperty('QR_SECRET');
  var batch = withLock(function () {
    var max = maxTicketNo(readObjects('TicketBatches'), date); // từ gas/Shared.js
    var b = { date: date, fromNo: max + 1, toNo: max + count, createdBy: auth.staff.id, createdAt: new Date().toISOString() };
    appendObject('TicketBatches', b);
    nextRev();
    audit(auth.staff.id, auth.deviceId, 'create_batch', '', { date: date, fromNo: b.fromNo, toNo: b.toNo });
    return b;
  });
  var tickets = [];
  for (var no = batch.fromNo; no <= batch.toNo; no++) tickets.push({ no: no, qr: encodeQr(date, no, secret) });
  return { date: date, fromNo: batch.fromNo, toNo: batch.toNo, tickets: tickets };
}

/** Danh sách bộ phiếu gần đây (mới nhất trước), kèm tên người tạo. */
function listBatches() {
  var names = {};
  readObjects('Staff').forEach(function (s) { names[s.id] = s.name; });
  var rows = readObjects('TicketBatches').map(strip_).map(function (b) { b.createdByName = names[b.createdBy] || b.createdBy; return b; });
  rows.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  return { batches: rows.slice(0, 60) };
}

/** In lại một bộ phiếu đã tạo (không tạo số mới). */
function reprintBatch(d) {
  var secret = PropertiesService.getScriptProperties().getProperty('QR_SECRET');
  var date = String(d.date || '');
  var fromNo = Number(d.fromNo), toNo = Number(d.toNo);
  if (!/^\d{8}$/.test(date) || !(fromNo >= 1) || !(toNo >= fromNo) || toNo - fromNo > 500) throw err_('BAD_REQUEST');
  var tickets = [];
  for (var no = fromNo; no <= toNo; no++) tickets.push({ no: no, qr: encodeQr(date, no, secret) });
  return { date: date, fromNo: fromNo, toNo: toNo, tickets: tickets };
}

/** Báo cáo theo ngày hoặc theo ca, từ ngày `from` đến `to` (YYYYMMDD). Chỉ quản lý. */
function report(d) {
  var from = String(d.from || ''), to = String(d.to || '');
  if (!/^\d{8}$/.test(from) || !/^\d{8}$/.test(to) || from > to) throw err_('BAD_REQUEST', 'Khoảng ngày không hợp lệ');
  var names = {};
  readObjects('Staff').forEach(function (s) { names[s.id] = s.name; });
  var rows = reportRows({
    sessions: readObjects('Sessions').map(strip_),
    alerts: readObjects('Alerts').map(strip_),
    batches: readObjects('TicketBatches').map(strip_),
    shifts: readObjects('Shifts').map(strip_),
    from: from, to: to, groupBy: d.groupBy === 'shift' ? 'shift' : 'day', staffNames: names,
  });
  return { rows: rows, staffNames: names };
}

/** Đổi giá: thêm dòng giá mới có hiệu lực từ bây giờ (giữ lịch sử, không sửa dòng cũ). */
function setPrices(d, auth) {
  var row = { effectiveFrom: new Date().toISOString(), setBy: auth.staff.id };
  ['motorbike', 'ebike', 'bicycle', 'lostFee'].forEach(function (k) {
    var v = Number(d[k]);
    if (!(v >= 0 && v <= 1000000) || Math.round(v) !== v) throw err_('BAD_REQUEST', 'Giá không hợp lệ: ' + k);
    row[k] = v;
  });
  withLock(function () {
    appendObject('Prices', row);
    nextRev();
    audit(auth.staff.id, auth.deviceId, 'set_price', '', row);
  });
  return { prices: readObjects('Prices').map(strip_) };
}

// ==================== Alerts.js ====================
// Cảnh báo khi ảnh lúc ra không khớp ảnh lúc vào (khác màu, khác biển số, thiếu mũ).
// So sánh bằng luật trong web/shared/compare.js. Cảnh báo chỉ là gợi ý để kiểm tra — không chặn trả xe.

var ANALYZED = ['done', 'unclear', 'manual'];
var RESOLUTIONS = ['ok_customer_wearing', 'false_alarm', 'real_issue'];

function analysisFromRow_(p) {
  return p && ANALYZED.indexOf(p.analysisStatus) >= 0 ? analysisOf_(p) : null;
}

/** Gọi BÊN TRONG withLock sau khi lưu kết quả phân tích: so sánh nếu đã có cả ảnh vào và ảnh ra. */
function runCompare_(sessionId, threshold) {
  var s = findBy('Sessions', 'id', sessionId);
  if (!s || !s.inPhotoId || !s.outPhotoId) return [];
  var photos = readObjects('Photos');
  var inA = analysisFromRow_(photos.filter(function (p) { return p.id === s.inPhotoId; })[0]);
  var outA = analysisFromRow_(photos.filter(function (p) { return p.id === s.outPhotoId; })[0]);
  if (!inA || !outA) return [];
  var fresh = newAlertsForSession(strip_(s), inA, outA, readObjects('Alerts').map(strip_), threshold,
    new Date().toISOString(), function () { return Utilities.getUuid(); });
  if (!fresh.length) return [];
  var rev = nextRev();
  fresh.forEach(function (a) { a.rev = rev; });
  appendObjects('Alerts', fresh);
  fresh.forEach(function (a) { audit('system', '', 'alert', a.sessionId, { kind: a.kind, level: a.level, message: a.message }); });
  return fresh;
}

/** Nhân viên/quản lý đóng cảnh báo bằng một kết quả. */
function resolveAlert(d, auth) {
  if (RESOLUTIONS.indexOf(d.resolution) < 0) throw err_('BAD_REQUEST', 'Kết quả xử lý không hợp lệ');
  return withLock(function () {
    var all = readObjects('Alerts');
    var a = all.filter(function (x) { return x.id === d.alertId; })[0];
    if (!a) throw err_('BAD_REQUEST', 'Không tìm thấy cảnh báo');
    var row = strip_(a);
    row.status = 'resolved';
    row.resolution = d.resolution;
    row.resolvedBy = auth.staff.id;
    row.resolvedAt = new Date().toISOString();
    row.note = String(d.note || '').slice(0, 500);
    row.rev = nextRev();
    upsertObjects('Alerts', [row], all);
    audit(auth.staff.id, auth.deviceId, 'resolve_alert', row.sessionId, { alertId: row.id, resolution: row.resolution, note: row.note });
    return { alert: row };
  });
}

function listAlerts(d) {
  var from = String(d.from || ''), to = String(d.to || '');
  var rows = readObjects('Alerts').map(strip_).filter(function (a) {
    var k = dateKey(a.createdAt);
    return (!from || k >= from) && (!to || k <= to) && (!d.status || a.status === d.status);
  });
  rows.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  var sessions = {};
  readObjects('Sessions').forEach(function (s) { sessions[s.id] = s; });
  return { alerts: rows.map(function (a) {
    var s = sessions[a.sessionId] || {};
    a.ticketNo = s.ticketNo; a.inPhotoId = s.inPhotoId; a.outPhotoId = s.outPhotoId;
    return a;
  }) };
}

/** Độ nhạy cảnh báo: ngưỡng chắc chắn 0,5 (nhạy, nhiều cảnh báo) – 0,95 (ít cảnh báo). */
function setConfig(d, auth) {
  var v = Number(d.alertThreshold);
  if (!(v >= 0.5 && v <= 0.95)) throw err_('BAD_REQUEST', 'Độ nhạy phải từ 0,5 đến 0,95');
  withLock(function () {
    var all = readObjects('Config');
    upsertObjects('Config', [{ key: 'alertThreshold', value: String(v) }], all, 'key');
    audit(auth.staff.id, auth.deviceId, 'set_config', '', { alertThreshold: v });
  });
  return { alertThreshold: v };
}

/** Quản lý sửa tay kết quả AI của một ảnh; chạy lại so sánh. */
function setAnalysis(d, auth) {
  var threshold = Number(getConfig('alertThreshold', DEFAULT_THRESHOLD)) || DEFAULT_THRESHOLD;
  return withLock(function () {
    var photos = readObjects('Photos');
    var p = photos.filter(function (x) { return x.id === d.photoId; })[0];
    if (!p) throw err_('PHOTO_NOT_FOUND');
    var row = strip_(p);
    var conf = row.confidence || { plate: 0, color: 0, helmets: 0 };
    if (d.color != null) { row.color = normalizeColor(d.color); conf.color = 1; }
    if (d.helmetsOnVehicle != null) { row.helmetsOnVehicle = Math.max(0, Math.round(Number(d.helmetsOnVehicle)) || 0); conf.helmets = 1; }
    if (d.helmetsWorn != null) { row.helmetsWorn = Math.max(0, Math.round(Number(d.helmetsWorn)) || 0); conf.helmets = 1; }
    if (d.plate != null) { row.plate = displayPlate(d.plate); conf.plate = row.plate ? 1 : 0; }
    row.confidence = conf;
    row.analysisStatus = 'manual';
    row.rev = nextRev();
    upsertObjects('Photos', [row], photos);
    if (row.kind === 'in') {
      var sessions = readObjects('Sessions');
      var s = sessions.filter(function (x) { return x.id === row.sessionId; })[0];
      if (s) {
        var updated = applyInAnalysis(strip_(s), analysisOf_(row), threshold);
        if (d.plate != null) { updated.plate = row.plate; updated.plateStatus = 'manual'; }
        updated.rev = nextRev();
        upsertObjects('Sessions', [updated], sessions);
      }
    }
    audit(auth.staff.id, auth.deviceId, 'set_analysis', row.sessionId, { photoId: row.id, color: row.color,
      helmetsOnVehicle: row.helmetsOnVehicle, helmetsWorn: row.helmetsWorn, plate: row.plate });
    var created = runCompare_(row.sessionId, threshold);
    return { analysis: analysisOf_(row), newAlerts: created.length };
  });
}

// ==================== Auth.js ====================
// Đăng nhập bằng tên + mã PIN, token, quản lý nhân viên.

var MAX_FAILS = 5;
var LOCK_SECONDS = 15 * 60;

function pinHash_(staffId, pin) {
  return sha256Hex(staffId + ':' + pin); // từ gas/Shared.js
}

function randomToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function login(d) {
  var name = String(d.staffName || '').trim().toLowerCase();
  var pin = String(d.pin || '').trim();
  if (!name || !/^\d{4,6}$/.test(pin)) throw err_('BAD_LOGIN');
  var cache = CacheService.getScriptCache();
  var failKey = 'fail:' + name;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILS) throw err_('BAD_LOGIN', 'Sai quá nhiều lần, thử lại sau 15 phút');

  var staff = readObjects('Staff').filter(function (s) { return String(s.name).trim().toLowerCase() === name; })[0];
  if (!staff || staff.pinHash !== pinHash_(staff.id, pin)) {
    cache.put(failKey, String(fails + 1), LOCK_SECONDS);
    throw err_('BAD_LOGIN');
  }
  if (!staff.active) throw err_('STAFF_INACTIVE');
  cache.remove(failKey);

  var token = randomToken_();
  appendObject('Tokens', { token: token, staffId: staff.id, deviceId: String(d.deviceId || ''), createdAt: new Date().toISOString(), revoked: false });
  return {
    token: token,
    staff: { id: staff.id, name: staff.name, role: staff.role },
    qrSecret: PropertiesService.getScriptProperties().getProperty('QR_SECRET'),
    serverTime: new Date().toISOString(),
  };
}

/** Kiểm tra token → { staff }. Có cache 2 phút cho nhanh (khóa nhân viên có hiệu lực tối đa sau 2 phút). */
function authenticate(token) {
  if (!token) throw err_('AUTH_REQUIRED');
  var cache = CacheService.getScriptCache();
  var cached = cache.get('tok:' + token);
  if (cached) return { staff: JSON.parse(cached) };
  var row = findBy('Tokens', 'token', String(token));
  if (!row || row.revoked) throw err_('AUTH_REQUIRED');
  var staff = findBy('Staff', 'id', row.staffId);
  if (!staff || !staff.active) throw err_('AUTH_REQUIRED');
  var info = { id: staff.id, name: staff.name, role: staff.role };
  cache.put('tok:' + token, JSON.stringify(info), 120);
  return { staff: info };
}

function listStaff() {
  return { staff: readObjects('Staff').map(function (s) { return { id: s.id, name: s.name, role: s.role, active: s.active }; }) };
}

/** Tạo/sửa nhân viên (không bao giờ xóa — nghỉ việc thì tắt `active`). */
function saveStaff(d, auth) {
  var name = String(d.name || '').trim();
  var role = d.role === 'manager' ? 'manager' : 'staff';
  if (!name) throw err_('BAD_REQUEST', 'Thiếu tên nhân viên');
  if (d.pin != null && d.pin !== '' && !/^\d{4,6}$/.test(String(d.pin))) throw err_('BAD_REQUEST', 'Mã PIN phải gồm 4–6 chữ số');
  return withLock(function () {
    var all = readObjects('Staff');
    var existing = d.id ? all.filter(function (s) { return s.id === d.id; })[0] : null;
    if (!existing && all.some(function (s) { return String(s.name).trim().toLowerCase() === name.toLowerCase(); })) {
      throw err_('BAD_REQUEST', 'Tên nhân viên đã tồn tại');
    }
    if (!existing && !d.pin) throw err_('BAD_REQUEST', 'Nhân viên mới cần mã PIN');
    var id = existing ? existing.id : 'st_' + Utilities.getUuid().slice(0, 8);
    var row = {
      id: id, name: name, role: role,
      pinHash: d.pin ? pinHash_(id, String(d.pin)) : existing.pinHash,
      active: d.active !== false,
    };
    upsertObjects('Staff', [row], all);
    audit(auth.staff.id, auth.deviceId, 'staff_change', '', { id: id, name: name, role: role, active: row.active, pinChanged: !!d.pin });
    // Khóa tài khoản hoặc đổi PIN → đăng xuất mọi máy của người đó.
    if (existing && (!row.active || d.pin)) revokeTokensOf_(id);
    return { staff: { id: id, name: name, role: role, active: row.active } };
  });
}

/** Thu hồi mọi token của một nhân viên (gọi bên trong withLock). */
function revokeTokensOf_(staffId) {
  var all = readObjects('Tokens');
  var mine = all.filter(function (t) { return t.staffId === staffId && !t.revoked; });
  if (!mine.length) return 0;
  upsertObjects('Tokens', mine.map(function (t) { var r = strip_(t); r.revoked = true; return r; }), all, 'token');
  var cache = CacheService.getScriptCache();
  mine.forEach(function (t) { cache.remove('tok:' + t.token); });
  return mine.length;
}

/** Quản lý: đăng xuất mọi máy của một nhân viên (mất điện thoại, nghỉ việc). */
function revokeTokens(d, auth) {
  if (!d.staffId) throw err_('BAD_REQUEST');
  return withLock(function () {
    var n = revokeTokensOf_(String(d.staffId));
    audit(auth.staff.id, auth.deviceId, 'revoke_tokens', '', { staffId: d.staffId, count: n });
    return { revoked: n };
  });
}

// ==================== Cleanup.js ====================
// Dọn dẹp hằng đêm (trigger 3 giờ sáng):
//  1. Xóa (vào Thùng rác Drive) thư mục ảnh của các ngày cũ hơn 30 ngày (FR-019).
//  2. Chuyển dòng cũ hơn 90 ngày của Sessions/Photos/Audit/Ops sang file lưu trữ theo năm
//     "GoMay-GiuXe-LuuTru-YYYY" — KHÔNG xóa mất dữ liệu (constitution IV), chỉ dời đi cho file chính nhẹ.

var PHOTO_KEEP_DAYS = 30;
var DATA_KEEP_DAYS = 90;

function nightlyCleanup() {
  return { trashedFolders: trashOldPhotoFolders_(), archived: archiveOldRows_() };
}

function trashOldPhotoFolders_() {
  var id = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID');
  if (!id) return 0;
  var cutoff = dateKey(Date.now() - PHOTO_KEEP_DAYS * 86400000);
  var it = DriveApp.getFolderById(id).getFolders();
  var n = 0;
  while (it.hasNext()) {
    var f = it.next();
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.getName());
    if (m && m[1] + m[2] + m[3] < cutoff) { f.setTrashed(true); n++; }
  }
  return n;
}

function archiveSpreadsheet_(year) {
  var props = PropertiesService.getScriptProperties();
  var key = 'ARCHIVE_ID_' + year;
  var id = props.getProperty(key);
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.create('GoMay-GiuXe-LuuTru-' + year);
  props.setProperty(key, ss.getId());
  return ss;
}

var ARCHIVE_RULES = {
  Sessions: function (o, cutoff) { return o.status !== 'in_lot' && String(o.outAt || o.inAt || '') < cutoff; },
  Photos: function (o, cutoff) { return String(o.takenAt || '') < cutoff; },
  Audit: function (o, cutoff) { return String(o.at || '') < cutoff; },
  Ops: function (o, cutoff) { return String(o.appliedAt || '') < cutoff; },
};

function archiveOldRows_() {
  var cutoff = new Date(Date.now() - DATA_KEEP_DAYS * 86400000).toISOString();
  var result = {};
  Object.keys(ARCHIVE_RULES).forEach(function (name) {
    result[name] = withLock(function () {
      var sh = sheet_(name);
      var values = sh.getDataRange().getValues();
      if (values.length < 2) return 0;
      var cols = HEADERS[name];
      var keep = [values[0]];
      var old = [];
      for (var r = 1; r < values.length; r++) {
        var o = {};
        cols.forEach(function (c, i) { o[c] = fromCell_(c, values[r][i]); });
        (ARCHIVE_RULES[name](o, cutoff) ? old : keep).push(values[r]);
      }
      if (!old.length) return 0;
      var arch = archiveSpreadsheet_(cutoff.slice(0, 4));
      var ash = arch.getSheetByName(name) || arch.insertSheet(name);
      if (ash.getLastRow() === 0) ash.getRange(1, 1, 1, cols.length).setValues([cols]);
      ash.getRange(ash.getLastRow() + 1, 1, old.length, cols.length).setValues(old.map(function (row) { return row.slice(0, cols.length); }));
      sh.clearContents();
      sh.getRange(1, 1, keep.length, cols.length).setValues(keep.map(function (row) { return row.slice(0, cols.length); }));
      return old.length;
    });
  });
  return result;
}

// ==================== Db.js ====================
// Đọc/ghi Google Sheets, khóa ngắn, bộ đếm phiên bản (rev), nhật ký.
// Mọi ô được lưu dạng văn bản thuần (định dạng "@") để Sheets không tự đổi chuỗi giờ ISO thành ngày;
// khi đọc lên sẽ đổi lại kiểu số / đúng-sai / JSON theo danh sách cột bên dưới.

var HEADERS = {
  Sessions: ['id', 'ticketDate', 'ticketNo', 'noTicket', 'vehicleType', 'plate', 'plateStatus', 'inSummary', 'inAt',
    'inStaffId', 'inDeviceId', 'inPhotoId', 'outAt', 'outStaffId', 'outPhotoId', 'fee', 'priceAtIn', 'status', 'note',
    'conflict', 'mergedInto', 'rev'],
  TicketBatches: ['date', 'fromNo', 'toNo', 'createdBy', 'createdAt'],
  Photos: ['id', 'sessionId', 'kind', 'takenAt', 'deviceId', 'driveFileId', 'uploadedAt', 'analysisStatus', 'plate',
    'color', 'vehicleTypeSeen', 'helmetsOnVehicle', 'helmetsWorn', 'otherItems', 'confidence', 'analyzedAt', 'analysisAttempts', 'rev'],
  Alerts: ['id', 'sessionId', 'kind', 'level', 'message', 'inValue', 'outValue', 'createdAt', 'notifyStaffId', 'status',
    'resolution', 'resolvedBy', 'resolvedAt', 'note', 'rev'],
  Prices: ['effectiveFrom', 'motorbike', 'ebike', 'bicycle', 'lostFee', 'setBy'],
  Staff: ['id', 'name', 'role', 'pinHash', 'active'],
  Tokens: ['token', 'staffId', 'deviceId', 'createdAt', 'revoked'],
  Shifts: ['id', 'staffId', 'deviceId', 'startAt', 'endAt', 'summary'],
  Audit: ['at', 'staffId', 'deviceId', 'action', 'sessionId', 'detail'],
  Config: ['key', 'value'],
  Ops: ['opId', 'type', 'staffId', 'appliedAt', 'result'],
};

var NUMBER_COLS = ['ticketNo', 'fee', 'priceAtIn', 'rev', 'fromNo', 'toNo', 'motorbike', 'ebike', 'bicycle', 'lostFee',
  'helmetsOnVehicle', 'helmetsWorn', 'analysisAttempts'];
var BOOL_COLS = ['noTicket', 'active', 'revoked'];
var JSON_COLS = ['otherItems', 'confidence', 'summary', 'detail'];

/**
 * Bảng tính dữ liệu. Dự án mở từ Google Sheets (Tiện ích mở rộng → Apps Script) thì dùng chính bảng tính đó;
 * dự án tạo riêng ở script.google.com thì dùng bảng tính setup() đã tạo (lưu ở Script Property SHEET_ID).
 */
function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw err_('SETUP_REQUIRED', 'Chưa chạy setup()');
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw err_('SETUP_REQUIRED', 'Chưa chạy setup(): thiếu trang tính ' + name);
  return sh;
}

function toCell_(col, v) {
  if (v === undefined || v === null) return '';
  if (JSON_COLS.indexOf(col) >= 0) return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function fromCell_(col, v) {
  if (v === '' || v === null || v === undefined) {
    if (BOOL_COLS.indexOf(col) >= 0) return false;
    return NUMBER_COLS.indexOf(col) >= 0 ? null : '';
  }
  if (NUMBER_COLS.indexOf(col) >= 0) return Number(v);
  if (BOOL_COLS.indexOf(col) >= 0) return v === true || String(v) === 'true';
  if (JSON_COLS.indexOf(col) >= 0) { try { return JSON.parse(v); } catch (e) { return null; } }
  return String(v);
}

/** Đọc cả trang tính thành mảng object; mỗi object có thêm `_row` (số dòng trong Sheets). */
function readObjects(name) {
  var values = sheet_(name).getDataRange().getValues();
  var cols = HEADERS[name];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var o = { _row: r + 1 };
    for (var c = 0; c < cols.length; c++) {
      var val = fromCell_(cols[c], values[r][c]);
      if (val !== '' && val !== null) o[cols[c]] = val;
      else if (BOOL_COLS.indexOf(cols[c]) >= 0) o[cols[c]] = false;
    }
    out.push(o);
  }
  return out;
}

function rowOf_(name, obj) {
  return HEADERS[name].map(function (c) { return toCell_(c, obj[c]); });
}

function appendObjects(name, objs) {
  if (!objs || !objs.length) return;
  var sh = sheet_(name);
  var rows = objs.map(function (o) { return rowOf_(name, o); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADERS[name].length).setValues(rows);
}

function appendObject(name, obj) {
  appendObjects(name, [obj]);
}

/** Ghi đè dòng có cùng `keyCol` (mặc định id), không có thì thêm mới. `existing` = kết quả readObjects. */
function upsertObjects(name, objs, existing, keyCol) {
  keyCol = keyCol || 'id';
  var sh = sheet_(name);
  var index = {};
  (existing || readObjects(name)).forEach(function (o) { index[o[keyCol]] = o._row; });
  var fresh = [];
  objs.forEach(function (o) {
    var row = index[o[keyCol]];
    if (row) sh.getRange(row, 1, 1, HEADERS[name].length).setValues([rowOf_(name, o)]);
    else fresh.push(o);
  });
  appendObjects(name, fresh);
}

function updateById(name, obj) {
  upsertObjects(name, [obj]);
}

function findBy(name, col, value) {
  var all = readObjects(name);
  for (var i = 0; i < all.length; i++) if (all[i][col] === value) return all[i];
  return null;
}

/**
 * Chạy fn trong khóa ngắn. Trong khóa CHỈ đọc/ghi Sheets — KHÔNG gọi UrlFetchApp/DriveApp
 * (research.md R4) để các máy khác không phải chờ.
 */
function withLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw err_('BUSY', 'Máy chủ đang bận, máy sẽ tự thử lại');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function currentRev() {
  return Number(PropertiesService.getScriptProperties().getProperty('REV') || 0);
}

/** Tăng bộ đếm phiên bản (gọi bên trong withLock). */
function nextRev() {
  var rev = currentRev() + 1;
  PropertiesService.getScriptProperties().setProperty('REV', String(rev));
  return rev;
}

/** Nhật ký chỉ thêm, không sửa/xóa. */
function audit(staffId, deviceId, action, sessionId, detail) {
  appendObject('Audit', { at: new Date().toISOString(), staffId: staffId, deviceId: deviceId, action: action,
    sessionId: sessionId || '', detail: detail || {} });
}

function getConfig(key, fallback) {
  var row = findBy('Config', 'key', key);
  return row ? row.value : fallback;
}

function err_(code, message) {
  var e = new Error(message || code);
  e.code = code;
  return e;
}

function strip_(o) {
  var c = {};
  Object.keys(o).forEach(function (k) { if (k !== '_row') c[k] = o[k]; });
  return c;
}

// ==================== Main.js ====================
// Điểm vào Web App: mọi lệnh gửi bằng POST text/plain JSON { action, token, deviceId, data }.

var ROUTES = {
  login: { fn: function (d) { return login(d); }, auth: false },
  push: { fn: function (d, a) { return push(d, a); } },
  pull: { fn: function (d, a) { return pull(d, a); } },
  uploadPhoto: { fn: function (d, a) { return uploadPhoto(d, a); } },
  getPhoto: { fn: function (d, a) { return getPhoto(d, a); } },
  createBatch: { fn: function (d, a) { return createBatch(d, a); }, manager: true },
  listBatches: { fn: function (d, a) { return listBatches(d, a); }, manager: true },
  reprintBatch: { fn: function (d, a) { return reprintBatch(d, a); }, manager: true },
  listStaff: { fn: function (d, a) { return listStaff(d, a); }, manager: true },
  report: { fn: function (d, a) { return report(d, a); }, manager: true },
  resolveAlert: { fn: function (d, a) { return resolveAlert(d, a); } },
  listAlerts: { fn: function (d, a) { return listAlerts(d, a); }, manager: true },
  setConfig: { fn: function (d, a) { return setConfig(d, a); }, manager: true },
  setAnalysis: { fn: function (d, a) { return setAnalysis(d, a); }, manager: true },
  setPrices: { fn: function (d, a) { return setPrices(d, a); }, manager: true },
  saveStaff: { fn: function (d, a) { return saveStaff(d, a); }, manager: true },
  revokeTokens: { fn: function (d, a) { return revokeTokens(d, a); }, manager: true },
};

var ERROR_MESSAGES = {
  AUTH_REQUIRED: 'Cần đăng nhập lại',
  FORBIDDEN: 'Chỉ quản lý mới dùng được chức năng này',
  BAD_REQUEST: 'Yêu cầu không hợp lệ',
  BAD_LOGIN: 'Sai tên hoặc mã PIN',
  STAFF_INACTIVE: 'Tài khoản đã bị khóa',
  BUSY: 'Máy chủ đang bận, máy sẽ tự thử lại',
  PHOTO_NOT_FOUND: 'Chưa có ảnh này trên máy chủ',
};

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(body) {
  var req;
  try { req = JSON.parse(body || '{}'); } catch (e) { throw err_('BAD_REQUEST'); }
  var route = ROUTES[req.action];
  if (!route) throw err_('BAD_REQUEST', 'Lệnh không tồn tại: ' + req.action);
  var auth = null;
  if (route.auth !== false) {
    auth = authenticate(req.token);
    auth.deviceId = String(req.deviceId || '');
    if (route.manager && auth.staff.role !== 'manager') throw err_('FORBIDDEN');
  }
  return route.fn(req.data || {}, auth);
}

function doPost(e) {
  try {
    return json_({ ok: true, data: handle_(e && e.postData ? e.postData.contents : '') });
  } catch (ex) {
    var code = ex.code || 'SERVER_ERROR';
    if (!ex.code) console.error(ex && ex.stack ? ex.stack : ex);
    return json_({ ok: false, error: { code: code, message: ex.code ? (ex.message !== code ? ex.message : ERROR_MESSAGES[code] || code) : 'Lỗi máy chủ' } });
  }
}

function doGet() {
  return ContentService.createTextOutput('Gò Mây Arena — API giữ xe đang chạy');
}

// ==================== Photos.js ====================
// Ảnh xe: lưu lên Google Drive (GoMay-GiuXe/Anh/YYYY-MM-DD/), lấy lại khi máy mất ảnh,
// rồi gọi AI phân tích (gas/Vision.js). Không gọi Drive/AI trong lúc giữ khóa (research.md R4).

function photoFolderForDay_(dayKey) {
  var root = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID'));
  var name = dayKey.slice(0, 4) + '-' + dayKey.slice(4, 6) + '-' + dayKey.slice(6, 8);
  return getOrCreateFolder_(root, name);
}

function uploadPhoto(d, auth) {
  var photoId = String(d.photoId || '');
  var kind = d.kind === 'out' ? 'out' : d.kind === 'in' ? 'in' : '';
  if (!photoId || !kind || !d.sessionId || !d.jpegBase64) throw err_('BAD_REQUEST', 'Thiếu dữ liệu ảnh');

  var existing = findBy('Photos', 'id', photoId);
  if (existing && existing.driveFileId) return { driveFileId: existing.driveFileId, duplicate: true };

  // Ngoài khóa: ghi file lên Drive.
  var session = findBy('Sessions', 'id', String(d.sessionId));
  var takenAt = String(d.takenAt || new Date().toISOString());
  var name = (session ? formatNo(session.ticketNo) : 'xxx') + '_' + kind + '_' + photoId + '.jpg';
  var blob = Utilities.newBlob(Utilities.base64Decode(String(d.jpegBase64)), 'image/jpeg', name);
  var file = photoFolderForDay_(dateKey(takenAt)).createFile(blob);

  var saved = withLock(function () {
    var rows = readObjects('Photos');
    var again = rows.filter(function (p) { return p.id === photoId; })[0];
    if (again && again.driveFileId) return { row: strip_(again), duplicate: true };
    var row = {
      id: photoId, sessionId: String(d.sessionId), kind: kind, takenAt: takenAt, deviceId: auth.deviceId,
      driveFileId: file.getId(), uploadedAt: new Date().toISOString(),
      analysisStatus: visionConfigured_() ? 'pending' : 'disabled', analysisAttempts: 0,
    };
    upsertObjects('Photos', [row], rows);
    return { row: row, duplicate: false };
  });
  if (saved.duplicate) { file.setTrashed(true); return { driveFileId: saved.row.driveFileId, duplicate: true }; }

  // Ngoài khóa: AI phân tích. Lỗi AI không làm lỗi lệnh tải ảnh (trigger 5 phút sẽ thử lại).
  if (saved.row.analysisStatus === 'pending') {
    try { analyzeAndStore_(saved.row, blob); } catch (e) { console.error('Phân tích ảnh lỗi: ' + e); }
  }
  return { driveFileId: saved.row.driveFileId };
}

function getPhoto(d) {
  var row = findBy('Photos', 'id', String(d.photoId || ''));
  if (!row || !row.driveFileId) throw err_('PHOTO_NOT_FOUND');
  try {
    var bytes = DriveApp.getFileById(row.driveFileId).getBlob().getBytes();
    return { jpegBase64: Utilities.base64Encode(bytes), kind: row.kind, sessionId: row.sessionId, takenAt: row.takenAt };
  } catch (e) {
    throw err_('PHOTO_NOT_FOUND', 'Ảnh đã bị xóa khỏi Drive (quá 30 ngày?)');
  }
}

// ==================== Sessions.js ====================
// push: nhận hàng đợi thao tác từ máy; pull: trả thay đổi mới. Logic xử lý nằm ở applyPush (gas/Shared.js).

function sessionKeys_() {
  return HEADERS.Sessions;
}

function cleanSession_(s) {
  var o = strip_(s);
  return o;
}

function loadState_() {
  var st = newState(); // từ gas/Shared.js
  var rows = readObjects('Sessions');
  rows.forEach(function (s) { st.sessions.set(s.id, cleanSession_(s)); });
  st.batches = readObjects('TicketBatches').map(strip_);
  st.prices = readObjects('Prices').map(strip_);
  st.alerts = readObjects('Alerts').map(strip_);
  var opIds = sheet_('Ops').getLastRow() > 1 ? sheet_('Ops').getRange(2, 1, sheet_('Ops').getLastRow() - 1, 1).getValues() : [];
  opIds.forEach(function (r) { if (r[0]) st.appliedOpIds.add(String(r[0])); });
  st._rows = rows;
  return st;
}

function push(d, auth) {
  var ops = (d.ops || []).slice(0, 50).map(function (op) {
    return { opId: String(op.opId || ''), type: op.type, payload: op.payload || {}, createdAt: op.createdAt,
      staffId: auth.staff.id, deviceId: auth.deviceId, role: auth.staff.role };
  });
  return withLock(function () {
    var st = loadState_();
    var r = applyPush(st, ops);
    var rev = currentRev();
    if (r.changed.length) {
      rev = nextRev();
      var changed = r.changed.map(function (s) { var c = cleanSession_(s); c.rev = rev; return c; });
      upsertObjects('Sessions', changed, st._rows);
      // trả về bản có rev mới
      var byId = {};
      changed.forEach(function (c) { byId[c.id] = c; });
      r.results.forEach(function (res) { if (res.session && byId[res.session.id]) res.session = byId[res.session.id]; });
    }
    if (r.shifts.length) upsertObjects('Shifts', r.shifts);
    var now = new Date().toISOString();
    appendObjects('Ops', r.results.filter(function (x) { return x.opId; }).map(function (x) {
      var op = ops.filter(function (o) { return o.opId === x.opId; })[0];
      return { opId: x.opId, type: op ? op.type : '', staffId: auth.staff.id, appliedAt: now, result: x.status };
    }));
    appendObjects('Audit', r.audits.map(function (a) {
      return { at: a.at || now, staffId: a.staffId, deviceId: a.deviceId, action: a.action, sessionId: a.sessionId || '', detail: a.detail };
    }));
    return { results: r.results, rev: rev };
  });
}

function recentDays_(n) {
  var keys = [];
  var now = Date.now();
  for (var i = 0; i < n; i++) keys.push(dateKey(now - i * 86400000));
  return keys;
}

function pull(d) {
  var sinceRev = Number(d.sinceRev || 0);
  var rev = currentRev();
  var full = !(sinceRev > 0) || sinceRev > rev;
  var days = recentDays_(3);
  var sessions = readObjects('Sessions').map(strip_).filter(function (s) {
    if (full) return s.status === 'in_lot' || days.indexOf(s.ticketDate) >= 0 || (s.outAt && days.indexOf(dateKey(s.outAt)) >= 0);
    return Number(s.rev) > sinceRev;
  });
  return {
    rev: rev,
    full: full,
    sessions: sessions,
    batches: readObjects('TicketBatches').map(strip_).filter(function (b) { return days.indexOf(b.date) >= 0 || b.date > days[0]; }),
    prices: readObjects('Prices').map(strip_),
    staffNames: staffNames_(),
    config: { alertThreshold: Number(getConfig('alertThreshold', DEFAULT_THRESHOLD)) || DEFAULT_THRESHOLD },
    analyses: readObjects('Photos').map(strip_).filter(function (p) {
      return p.analysisStatus && ['done', 'unclear', 'manual'].indexOf(p.analysisStatus) >= 0
        && (full ? days.indexOf(dateKey(p.takenAt)) >= 0 : Number(p.rev) > sinceRev);
    }).map(analysisOf_),
    alerts: readObjects('Alerts').map(strip_).filter(function (a) {
      return full ? (a.status === 'new' || days.indexOf(dateKey(a.createdAt)) >= 0) : Number(a.rev) > sinceRev;
    }),
    serverTime: new Date().toISOString(),
  };
}

function staffNames_() {
  var names = {};
  readObjects('Staff').forEach(function (s) { names[s.id] = s.name; });
  return names;
}

/** Phần phân tích AI của một dòng Photos (gửi cho máy để xem/sửa, không kèm ảnh). */
function analysisOf_(p) {
  return { id: p.id, sessionId: p.sessionId, kind: p.kind, analysisStatus: p.analysisStatus, plate: p.plate || '',
    color: p.color || 'không rõ', vehicleType: p.vehicleTypeSeen || 'other', helmetsOnVehicle: Number(p.helmetsOnVehicle) || 0,
    helmetsWorn: Number(p.helmetsWorn) || 0, otherItems: p.otherItems || [], confidence: p.confidence || { plate: 0, color: 0, helmets: 0 } };
}

// ==================== Setup.js ====================
// Chạy setup() MỘT LẦN sau khi dán mã vào Apps Script của file Google Sheets "GoMay-GiuXe".

function setup() {
  var props0 = PropertiesService.getScriptProperties();
  var ss = props0.getProperty('SHEET_ID') ? SpreadsheetApp.openById(props0.getProperty('SHEET_ID')) : SpreadsheetApp.getActiveSpreadsheet();
  var created = false;
  if (!ss) {
    // Dự án tạo riêng (không gắn bảng tính) → tự tạo bảng tính dữ liệu.
    ss = SpreadsheetApp.create('GoMay-GiuXe');
    created = true;
  }
  props0.setProperty('SHEET_ID', ss.getId());
  Object.keys(HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), Math.max(sh.getMaxColumns(), HEADERS[name].length)).setNumberFormat('@');
    sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  var first = ss.getSheetByName('Sheet1') || ss.getSheetByName('Trang tính1');
  if (first && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('QR_SECRET')) props.setProperty('QR_SECRET', Utilities.getUuid() + Utilities.getUuid());
  if (!props.getProperty('REV')) props.setProperty('REV', '0');
  if (!props.getProperty('VISION_PROVIDER')) props.setProperty('VISION_PROVIDER', 'gemini');

  // Thư mục ảnh trên Drive
  var root = getOrCreateFolder_(DriveApp.getRootFolder(), 'GoMay-GiuXe');
  var photos = getOrCreateFolder_(root, 'Anh');
  props.setProperty('PHOTO_FOLDER_ID', photos.getId());

  if (readObjects('Prices').length === 0) {
    appendObject('Prices', { effectiveFrom: '2000-01-01T00:00:00.000Z', motorbike: 5000, ebike: 5000, bicycle: 5000, lostFee: 10000, setBy: 'setup' });
  }
  if (!findBy('Config', 'key', 'alertThreshold')) appendObject('Config', { key: 'alertThreshold', value: '0.7' });

  var message = 'Đã cài đặt xong.' + (created ? ' Đã tạo bảng tính "GoMay-GiuXe" trong Google Drive: ' + ss.getUrl() : '');
  if (readObjects('Staff').length === 0) {
    var pin = String(Math.floor(100000 + Math.random() * 900000));
    var id = 'st_' + Utilities.getUuid().slice(0, 8);
    appendObject('Staff', { id: id, name: 'Quản lý', role: 'manager', pinHash: sha256Hex(id + ':' + pin), active: true });
    message += ' Tài khoản đầu tiên: tên "Quản lý", mã PIN ' + pin + ' (hãy đổi sau khi đăng nhập).';
  }

  // Trigger chạy nền (hàm ở gas/Cleanup.js và gas/Vision.js)
  var existing = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (existing.indexOf('nightlyCleanup') < 0) ScriptApp.newTrigger('nightlyCleanup').timeBased().everyDays(1).atHour(3).create();
  if (existing.indexOf('retryFailedAnalyses') < 0) ScriptApp.newTrigger('retryFailedAnalyses').timeBased().everyMinutes(5).create();

  Logger.log(message);
  return message;
}

function getOrCreateFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/**
 * Thêm nhân viên từ trình soạn thảo Apps Script (trước khi có màn hình quản lý nhân viên):
 * sửa tên / mã PIN / vai trò bên dưới → chọn hàm themNhanVien → Chạy.
 */
function themNhanVien() {
  var TEN = 'Tuấn';
  var MA_PIN = '1234'; // 4–6 chữ số
  var VAI_TRO = 'staff'; // 'staff' = nhân viên, 'manager' = quản lý
  var r = saveStaff({ name: TEN, role: VAI_TRO, pin: MA_PIN }, { staff: { id: 'editor' }, deviceId: 'editor' });
  Logger.log('Đã thêm/sửa nhân viên: ' + JSON.stringify(r.staff));
  return r;
}

// ==================== Vision.js ====================
// Gọi AI đọc ảnh xe: biển số, màu xe, số mũ bảo hiểm. Cấu hình trong Script Properties:
//   VISION_PROVIDER = gemini (mặc định) | claude
//   VISION_API_KEY  = khóa API của nhà cung cấp đã chọn (bỏ trống = tắt phân tích ảnh)
//   VISION_MODEL    = (tùy chọn) mặc định gemini-2.5-flash / claude-haiku-5-5
// Câu lệnh, schema và kiểm tra kết quả nằm ở web/shared/vision.js (gas/Shared.js).

var MAX_ANALYSIS_ATTEMPTS = 5;

function visionConfigured_() {
  return !!PropertiesService.getScriptProperties().getProperty('VISION_API_KEY');
}

function callGemini_(key, model, b64) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  var body = {
    contents: [{ role: 'user', parts: [{ text: visionPrompt() }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  };
  var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key },
    payload: JSON.stringify(body), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { ok: false, error: 'HTTP_' + res.getResponseCode() };
  var j = JSON.parse(res.getContentText());
  var parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts || [];
  var text = parts.map(function (p) { return p.text || ''; }).join('');
  return text ? parseVisionResponse(text) : { ok: false, error: 'EMPTY' };
}

/** Claude Messages API qua HTTP (Apps Script không có SDK). Haiku 5.5: không gửi temperature (400). */
function callClaude_(key, model, b64) {
  var body = {
    model: model,
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: VISION_SCHEMA } },
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
      { type: 'text', text: visionPrompt() },
    ] }],
  };
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2026-10-21' },
    payload: JSON.stringify(body),
  });
  if (res.getResponseCode() !== 200) return { ok: false, error: 'HTTP_' + res.getResponseCode() };
  var j = JSON.parse(res.getContentText());
  if (j.stop_reason === 'refusal') return { ok: false, error: 'REFUSAL' };
  var text = (j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  return text ? parseVisionResponse(text) : { ok: false, error: 'EMPTY' };
}

/** Gọi AI cho một ảnh (Blob) → { ok, analysis } hoặc { ok:false, error }. */
function analyzeBlob_(blob) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('VISION_API_KEY');
  if (!key) return { ok: false, error: 'DISABLED' };
  var provider = (props.getProperty('VISION_PROVIDER') || 'gemini').toLowerCase();
  var b64 = Utilities.base64Encode(blob.getBytes());
  if (provider === 'claude') return callClaude_(key, props.getProperty('VISION_MODEL') || 'claude-haiku-5-5', b64);
  return callGemini_(key, props.getProperty('VISION_MODEL') || 'gemini-2.5-flash', b64);
}

/** Phân tích (ngoài khóa) rồi ghi kết quả (trong khóa ngắn). */
function analyzeAndStore_(photoRow, blob) {
  var result;
  try { result = analyzeBlob_(blob); } catch (e) { result = { ok: false, error: String(e) }; }
  storeAnalysis_(photoRow.id, result);
  return result;
}

function storeAnalysis_(photoId, result) {
  var threshold = Number(getConfig('alertThreshold', DEFAULT_THRESHOLD)) || DEFAULT_THRESHOLD;
  withLock(function () {
    var photos = readObjects('Photos');
    var found = photos.filter(function (p) { return p.id === photoId; })[0];
    if (!found) return;
    var row = strip_(found);
    var attempts = (Number(row.analysisAttempts) || 0) + 1;
    row.analysisAttempts = attempts;
    if (!result.ok) {
      row.analysisStatus = result.error === 'DISABLED' ? 'disabled' : attempts >= MAX_ANALYSIS_ATTEMPTS ? 'gave_up' : 'failed';
      upsertObjects('Photos', [row], photos);
      return;
    }
    var a = result.analysis;
    row.analysisStatus = a.status;
    row.plate = a.plate;
    row.color = a.color;
    row.vehicleTypeSeen = a.vehicleType;
    row.helmetsOnVehicle = a.helmetsOnVehicle;
    row.helmetsWorn = a.helmetsWorn;
    row.otherItems = a.otherItems;
    row.confidence = a.confidence;
    row.analyzedAt = new Date().toISOString();
    row.rev = nextRev();
    upsertObjects('Photos', [row], photos);

    if (row.kind === 'in') {
      var sessions = readObjects('Sessions');
      var s = sessions.filter(function (x) { return x.id === row.sessionId; })[0];
      if (s) {
        var updated = applyInAnalysis(strip_(s), a, threshold);
        updated.rev = nextRev();
        upsertObjects('Sessions', [updated], sessions);
      }
    }
    // Có đủ ảnh vào + ảnh ra đã phân tích → so sánh, tạo cảnh báo (gas/Alerts.js)
    runCompare_(row.sessionId, threshold);
  });
}

/** Trigger 5 phút: phân tích lại ảnh lỗi/chưa phân tích (tối đa 10 ảnh mỗi lần). */
function retryFailedAnalyses() {
  if (!visionConfigured_()) return 0;
  var cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  var todo = readObjects('Photos').filter(function (p) {
    return (p.analysisStatus === 'failed' || p.analysisStatus === 'pending') && p.driveFileId && String(p.uploadedAt) < cutoff;
  }).slice(0, 10);
  todo.forEach(function (p) {
    try { analyzeAndStore_(strip_(p), DriveApp.getFileById(p.driveFileId).getBlob()); } catch (e) { console.error(e); }
  });
  return todo.length;
}
