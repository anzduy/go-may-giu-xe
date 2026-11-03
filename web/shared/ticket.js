// Logic phiếu QR: số thứ tự, mã QR có mã kiểm tra, nhảy số, kiểm tra hợp lệ.
// Thuần JavaScript (không dùng API trình duyệt/Apps Script) để dùng chung web + Apps Script + test.

export const QR_PREFIX = 'GM1';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Việt Nam UTC+7, không có giờ mùa hè

/** Số phiếu luôn hiển thị 3 chữ số: 7 → "007". */
export function formatNo(n) {
  return String(n).padStart(3, '0');
}

/** Số nhân viên gõ tay ("037" hoặc "37") → 37; không hợp lệ → null. */
export function parseTypedNumber(text) {
  const t = String(text == null ? '' : text).trim();
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n > 0 ? n : null;
}

/** Ngày theo giờ Việt Nam dạng YYYYMMDD từ mốc thời gian (ms hoặc chuỗi ISO). */
export function dateKey(time) {
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

export function sha256Hex(text) {
  return toHex(sha256Bytes(utf8Bytes(String(text))));
}

/** HMAC-SHA256 (hex chữ thường). */
export function hmacSha256Hex(key, message) {
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
export function encodeQr(date, no, secret) {
  return `${QR_PREFIX}|${date}|${formatNo(no)}|${qrCheck(date, no, secret)}`;
}

export function parseQr(text, secret) {
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
export function suggestNext(lastNo, blocked) {
  let n = (Number(lastNo) || 0) + 1;
  while (blocked && blocked.has(n)) n++;
  return n;
}

/** Các số của ngày `date` không dùng lại được (đang có xe, đã trả, báo mất). */
export function blockedNumbers(sessions, date) {
  const set = new Set();
  for (const s of sessions) if (s.ticketDate === date && s.status !== 'cancelled') set.add(Number(s.ticketNo));
  return set;
}

export function maxTicketNo(batches, date) {
  let max = 0;
  for (const b of batches || []) if (b.date === date && Number(b.toNo) > max) max = Number(b.toNo);
  return max;
}

/**
 * Kiểm tra trước khi gửi xe. Vượt bộ phiếu chỉ là CẢNH BÁO (máy offline có thể chưa biết bộ phiếu mới).
 * @returns {{ok:true, warning?:string} | {ok:false, error:string, session?:object}}
 */
export function validateForCheckin({ ticketDate, ticketNo, noTicket }, { today, sessions, batches }) {
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
export function validateForCheckout(sessions, { ticketDate, ticketNo }) {
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
export function computeSkipped(sessions, date) {
  const used = blockedNumbers(sessions, date);
  const max = Math.max(0, ...used);
  const out = [];
  for (let n = 1; n < max; n++) if (!used.has(n)) out.push(n);
  return out;
}

/** Số phiếu còn lại = số lớn nhất đã tạo − số lớn nhất đã dùng (số bỏ qua không tính là còn). */
export function remainingTickets(batches, sessions, date) {
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
export function ticketMessage(code, no) {
  const f = MESSAGES[code];
  return f ? f(no) : code;
}
