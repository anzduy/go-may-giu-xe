// Máy chủ giả cho kiểm thử đầu-cuối: chặn yêu cầu tới URL máy chủ và trả lời bằng ĐÚNG logic
// web/shared/server-ops.js mà Apps Script dùng (gas/Sessions.js), để test kiểm tra logic thật.
import { applyPush, newState } from '../../../web/shared/server-ops.js';
import { encodeQr, maxTicketNo, dateKey } from '../../../web/shared/ticket.js';
import { applyInAnalysis } from '../../../web/shared/vision.js';
import { reportRows } from '../../../web/shared/report.js';
import { newAlertsForSession } from '../../../web/shared/compare.js';
import { randomUUID } from 'node:crypto';

export const MOCK_URL = 'https://mock.gomay.test/macros/s/test/exec';
export const SECRET = 'bi-mat-thu-nghiem';
export const today = () => dateKey(Date.now());

export function createMock() {
  const state = newState();
  let rev = 0;
  const staff = [
    { id: 'st_m', name: 'Quản lý', role: 'manager', pin: '111111' },
    { id: 'st_a', name: 'Tuấn', role: 'staff', pin: '1234' },
    { id: 'st_b', name: 'Hùng', role: 'staff', pin: '5678' },
  ];
  const tokens = new Map();
  const requests = [];
  const photos = new Map(); // photoId → { jpegBase64, sessionId, kind, takenAt }
  let analyze = null; // (photo, session) → analysis | null : giả lập AI đọc ảnh
  const analyses = new Map(); // photoId → { ...analysis, id, sessionId, kind, rev }
  let threshold = 0.7;

  function runCompare(sessionId) {
    const s = state.sessions.get(sessionId);
    if (!s || !s.inPhotoId || !s.outPhotoId) return;
    const fresh = newAlertsForSession(s, analyses.get(s.inPhotoId), analyses.get(s.outPhotoId), state.alerts, threshold, new Date().toISOString(), randomUUID);
    if (fresh.length) { rev++; fresh.forEach((a) => state.alerts.push({ ...a, rev })); }
  }
  let n = 0;

  const ok = (data) => ({ ok: true, data });
  const fail = (code, message) => ({ ok: false, error: { code, message: message || code } });

  function handle(body) {
    const { action, token, deviceId, data = {} } = body;
    if (action === 'login') {
      const s = staff.find((x) => x.name.toLowerCase() === String(data.staffName || '').trim().toLowerCase() && x.pin === data.pin);
      if (!s) return fail('BAD_LOGIN', 'Sai tên hoặc mã PIN');
      if (s.active === false) return fail('STAFF_INACTIVE', 'Tài khoản đã bị khóa');
      const t = `tok${++n}`;
      tokens.set(t, s);
      return ok({ token: t, staff: { id: s.id, name: s.name, role: s.role }, qrSecret: SECRET, serverTime: new Date().toISOString() });
    }
    const me = tokens.get(token);
    if (!me) return fail('AUTH_REQUIRED');
    const manager = me.role === 'manager';
    switch (action) {
      case 'push': {
        const ops = (data.ops || []).map((o) => ({ ...o, staffId: me.id, deviceId, role: me.role }));
        const r = applyPush(state, ops);
        if (r.changed.length) {
          rev++;
          for (const s of r.changed) state.sessions.set(s.id, { ...s, rev });
          for (const res of r.results) if (res.session) res.session = state.sessions.get(res.session.id);
        }
        return ok({ results: r.results, rev });
      }
      case 'pull': {
        const since = Number(data.sinceRev || 0);
        const sessions = [...state.sessions.values()].filter((s) => !since || s.rev > since);
        return ok({ rev, full: !since, sessions, batches: state.batches, prices: state.prices,
          staffNames: Object.fromEntries(staff.map((s) => [s.id, s.name])), config: { alertThreshold: threshold },
          analyses: [...analyses.values()].filter((a) => !since || a.rev > since),
          alerts: state.alerts.filter((a) => !since || a.rev > since), serverTime: new Date().toISOString() });
      }
      case 'uploadPhoto': {
        if (!photos.has(data.photoId)) {
          photos.set(data.photoId, { ...data });
          const session = state.sessions.get(data.sessionId);
          const a = analyze && session ? analyze(data, session) : null;
          if (a) { rev++; analyses.set(data.photoId, { ...a, analysisStatus: a.status || 'done', id: data.photoId, sessionId: data.sessionId, kind: data.kind, rev }); }
          if (a && data.kind === 'in') { rev++; state.sessions.set(session.id, { ...applyInAnalysis(session, a), rev }); }
          if (a) runCompare(data.sessionId);
        }
        return ok({ driveFileId: `drive-${data.photoId}` });
      }
      case 'getPhoto': {
        const ph = photos.get(data.photoId);
        return ph ? ok({ jpegBase64: ph.jpegBase64, kind: ph.kind, sessionId: ph.sessionId, takenAt: ph.takenAt }) : fail('PHOTO_NOT_FOUND');
      }
      case 'resolveAlert': {
        const a = state.alerts.find((x) => x.id === data.alertId);
        if (!a || !['ok_customer_wearing', 'false_alarm', 'real_issue'].includes(data.resolution)) return fail('BAD_REQUEST');
        rev++;
        Object.assign(a, { status: 'resolved', resolution: data.resolution, note: data.note || '', resolvedBy: me.id, resolvedAt: new Date().toISOString(), rev });
        return ok({ alert: a });
      }
      case 'listAlerts':
        if (!manager) return fail('FORBIDDEN');
        return ok({ alerts: state.alerts.map((a) => ({ ...a, ticketNo: state.sessions.get(a.sessionId)?.ticketNo })) });
      case 'setConfig':
        if (!manager) return fail('FORBIDDEN');
        threshold = Number(data.alertThreshold);
        return ok({ alertThreshold: threshold });
      case 'report':
        if (!manager) return fail('FORBIDDEN');
        return ok({ rows: reportRows({ sessions: [...state.sessions.values()], batches: state.batches, shifts: [...state.shifts.values()],
          from: data.from, to: data.to, groupBy: data.groupBy, staffNames: Object.fromEntries(staff.map((x) => [x.id, x.name])) }) });
      case 'setPrices':
        if (!manager) return fail('FORBIDDEN');
        state.prices.push({ effectiveFrom: new Date().toISOString(), motorbike: data.motorbike, ebike: data.ebike, bicycle: data.bicycle, lostFee: data.lostFee, setBy: me.id });
        rev++;
        return ok({ prices: state.prices });
      case 'listStaff':
        if (!manager) return fail('FORBIDDEN');
        return ok({ staff: staff.map(({ id, name: nm, role, active = true }) => ({ id, name: nm, role, active })) });
      case 'saveStaff': {
        if (!manager) return fail('FORBIDDEN');
        let st = data.id && staff.find((x) => x.id === data.id);
        if (!st) {
          if (staff.some((x) => x.name.toLowerCase() === String(data.name).toLowerCase())) return fail('BAD_REQUEST', 'Tên nhân viên đã tồn tại');
          st = { id: `st_${staff.length + 1}`, name: data.name, role: data.role, pin: data.pin, active: true };
          staff.push(st);
        } else Object.assign(st, { name: data.name, role: data.role, active: data.active !== false, ...(data.pin ? { pin: data.pin } : {}) });
        return ok({ staff: { id: st.id, name: st.name, role: st.role, active: st.active } });
      }
      case 'createBatch': {
        if (!manager) return fail('FORBIDDEN');
        const from = maxTicketNo(state.batches, data.date) + 1;
        const b = { date: data.date, fromNo: from, toNo: from + Number(data.count) - 1, createdBy: me.id, createdAt: new Date().toISOString() };
        state.batches.push(b);
        rev++;
        return ok({ ...b, tickets: tickets(b) });
      }
      case 'listBatches':
        if (!manager) return fail('FORBIDDEN');
        return ok({ batches: [...state.batches].reverse().map((b) => ({ ...b, createdByName: staff.find((s) => s.id === b.createdBy)?.name })) });
      case 'reprintBatch':
        if (!manager) return fail('FORBIDDEN');
        return ok({ ...data, tickets: tickets(data) });
      default:
        return fail('BAD_REQUEST');
    }
  }

  function tickets(b) {
    const out = [];
    for (let no = b.fromNo; no <= b.toNo; no++) out.push({ no, qr: encodeQr(b.date, no, SECRET) });
    return out;
  }

  return {
    state,
    requests,
    sessions: () => [...state.sessions.values()],
    session: (id) => state.sessions.get(id),
    photos,
    staff,
    alerts: () => state.alerts,
    threshold: () => threshold,
    setAnalyze(fn) { analyze = fn; },
    pushedOps: () => requests.filter((r) => r.action === 'push').flatMap((r) => r.data.ops || []),
    seedBatch(date, fromNo, toNo) { state.batches.push({ date, fromNo, toNo, createdBy: 'st_m', createdAt: new Date().toISOString() }); rev++; },
    seedSession(s) { rev++; state.sessions.set(s.id, { status: 'in_lot', priceAtIn: 5000, vehicleType: 'motorbike', plateStatus: 'pending', ...s, rev }); },
    async attach(context) {
      await context.route(MOCK_URL, async (route) => {
        const req = route.request();
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
        const body = JSON.parse(req.postData() || '{}');
        requests.push(body);
        await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(handle(body)) });
      });
    },
  };
}

/** Mở app và đăng nhập (dán URL máy chủ giả ở lần đầu). */
export async function login(page, name = 'Tuấn', pin = '1234') {
  await page.goto('/');
  await page.locator('#staff-name').waitFor();
  if (await page.locator('#api-url').isVisible()) await page.fill('#api-url', MOCK_URL);
  await page.fill('#staff-name', name);
  await page.fill('#pin', pin);
  await page.click('button[type=submit]');
  await page.locator('#topbar').waitFor({ state: 'visible' });
}

/** Giả lập quét QR (camera giả của trình duyệt test không chứa mã QR). */
export function scan(page, text) {
  return page.evaluate((t) => document.dispatchEvent(new CustomEvent('gomay:scan', { detail: t })), text);
}
