// Chạy thử mã Apps Script (gas/*.js) trong Node với các dịch vụ Google giả lập trong bộ nhớ,
// để bắt lỗi trước khi dán lên Apps Script thật.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

function fakeGoogle() {
  const sheets = new Map();
  const makeSheet = (name, target = sheets) => {
    const data = [];
    const sh = {
      name,
      data,
      getLastRow: () => data.length,
      getMaxRows: () => Math.max(1000, data.length),
      getMaxColumns: () => 26,
      getDataRange: () => ({ getValues: () => data.map((r) => r.slice()) }),
      getRange: (row, col, nr = 1, nc = 1) => ({
        setValues(values) {
          for (let r = 0; r < nr; r++) {
            while (data.length < row + r) data.push([]);
            for (let c = 0; c < nc; c++) data[row - 1 + r][col - 1 + c] = values[r][c];
          }
          return this;
        },
        getValues: () => Array.from({ length: nr }, (_, r) => Array.from({ length: nc }, (_, c) => (data[row - 1 + r] || [])[col - 1 + c] ?? '')),
        setNumberFormat() { return this; },
        setFontWeight() { return this; },
      }),
      setFrozenRows() {},
      clearContents() { data.length = 0; },
    };
    target.set(name, sh);
    return sh;
  };
  const props = new Map();
  const cache = new Map();
  const spreadsheet = {
    getId: () => 'ss-main',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/ss-main',
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => makeSheet(n),
    getSheets: () => [...sheets.values()],
    deleteSheet: (sh) => sheets.delete(sh.name),
  };
  // Drive giả: thư mục, file (lưu bytes), thùng rác
  const files = new Map();
  const folders = new Map();
  const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const folder = (name, parent) => {
    const f = {
      id: `folder-${folders.size + 1}`, name, parent, trashed: false, children: [],
      getId() { return this.id; }, getName() { return this.name; },
      setTrashed(t) { this.trashed = t; },
      getFoldersByName(n) { return iter(this.children.filter((c) => c.name === n && !c.trashed)); },
      getFolders() { return iter(this.children.filter((c) => !c.trashed)); },
      createFolder(n) { const c = folder(n, this); this.children.push(c); return c; },
      createFile(blob) {
        const file = { id: `file-${files.size + 1}`, name: blob.name, bytes: blob.bytes, folder: this, trashed: false,
          getId() { return this.id; }, setTrashed(t) { this.trashed = t; }, getBlob() { return { getBytes: () => this.bytes }; } };
        files.set(file.id, file);
        return file;
      },
    };
    folders.set(f.id, f);
    return f;
  };
  const root = folder('root');
  const spreadsheets = new Map();
  const fetches = [];
  let fetchImpl = () => ({ code: 500, body: '{}' });
  const makeSpreadsheet = (name) => {
    const own = new Map();
    const ss = {
      id: `ss-${spreadsheets.size + 1}`, name, sheets: own,
      getId() { return this.id; },
      getSheetByName: (n) => own.get(n) || null,
      insertSheet: (n) => makeSheet(n, own),
    };
    spreadsheets.set(ss.id, ss);
    return ss;
  };
  return {
    sheets, files, folders, root, spreadsheets, fetches,
    setFetch(fn) { fetchImpl = fn; },
    globals: {
      SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, create: (n) => makeSpreadsheet(n), openById: (id) => (id === 'ss-main' ? spreadsheet : spreadsheets.get(id)) },
      UrlFetchApp: { fetch: (url, opts) => { fetches.push({ url, opts }); const r = fetchImpl(url, opts); return { getResponseCode: () => r.code, getContentText: () => r.body }; } },
      PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v)) }) },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
      CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
      Utilities: {
        getUuid: () => crypto.randomUUID(),
        base64Decode: (b64) => [...Buffer.from(b64, 'base64')],
        base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
        newBlob: (bytes, type, name) => ({ bytes, type, name, getBytes: () => bytes }),
      },
      ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ content: s, setMimeType() { return this; } }) },
      DriveApp: { getRootFolder: () => root, getFolderById: (id) => folders.get(id), getFileById: (id) => files.get(id) },
      ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create() {} }) }), everyMinutes: () => ({ create() {} }) }) }) },
      Logger: { log() {} },
      console,
    },
  };
}

let gas;
let pin;
let fake;
const call = (action, data, token, deviceId = 'dev1') =>
  JSON.parse(gas.doPost({ postData: { contents: JSON.stringify({ action, data, token, deviceId }) } }).content);

beforeAll(() => {
  fake = fakeGoogle();
  const ctx = vm.createContext({ ...fake.globals });
  const dir = path.resolve('gas');
  const order = ['Shared.js', ...fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'Shared.js').sort()];
  for (const f of order) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  gas = ctx;
  gas.__sheets = fake.sheets;
  const msg = gas.setup();
  pin = /mã PIN (\d{6})/.exec(msg)[1];
});

describe('Apps Script (giả lập)', () => {
  let manager;
  let staffToken;
  const today = () => gas.dateKey(Date.now());

  it('setup tạo đủ trang tính và quản lý đầu tiên', () => {
    expect([...gas.__sheets.keys()]).toEqual(expect.arrayContaining(['Sessions', 'TicketBatches', 'Staff', 'Audit', 'Ops']));
    expect(gas.__sheets.get('Staff').data[1][1]).toBe('Quản lý');
  });

  it('đăng nhập sai PIN bị từ chối, đúng PIN nhận token + qrSecret', () => {
    expect(call('login', { staffName: 'Quản lý', pin: '000000' }).error.code).toBe('BAD_LOGIN');
    const r = call('login', { staffName: 'quản lý', pin });
    expect(r.ok).toBe(true);
    expect(r.data.staff.role).toBe('manager');
    expect(r.data.qrSecret).toBeTruthy();
    manager = r.data.token;
  });

  it('chưa đăng nhập → AUTH_REQUIRED', () => {
    expect(call('pull', {}).error.code).toBe('AUTH_REQUIRED');
  });

  it('quản lý tạo nhân viên; nhân viên không được tạo phiếu', () => {
    expect(call('saveStaff', { name: 'Tuấn', role: 'staff', pin: '1234' }, manager).ok).toBe(true);
    staffToken = call('login', { staffName: 'Tuấn', pin: '1234' }).data.token;
    expect(call('createBatch', { date: today(), count: 200 }, staffToken).error.code).toBe('FORBIDDEN');
  });

  it('tạo 200 phiếu rồi tạo thêm 50 nối tiếp', () => {
    const a = call('createBatch', { date: today(), count: 200 }, manager);
    expect(a.data).toMatchObject({ fromNo: 1, toNo: 200 });
    expect(a.data.tickets[36].qr).toMatch(/^GM1\|\d{8}\|037\|[0-9a-f]{6}$/);
    const b = call('createBatch', { date: today(), count: 50 }, manager);
    expect(b.data).toMatchObject({ fromNo: 201, toNo: 250 });
  });

  it('gửi xe ở máy A, máy B thấy qua pull, trả xe, gửi lại không làm lại', () => {
    const inAt = new Date().toISOString();
    const op = { opId: 'op1', type: 'createSession', createdAt: inAt,
      payload: { id: 'ses1', ticketDate: today(), ticketNo: 1, noTicket: false, vehicleType: 'motorbike', inAt, inPhotoId: 'ph1' } };
    const r = call('push', { ops: [op] }, staffToken, 'dA');
    expect(r.data.results[0]).toMatchObject({ status: 'applied', session: { status: 'in_lot', priceAtIn: 5000 } });
    expect(call('push', { ops: [op] }, staffToken, 'dA').data.results[0].status).toBe('duplicate');

    const p = call('pull', { sinceRev: 0 }, manager, 'dB');
    expect(p.data.full).toBe(true);
    expect(p.data.sessions.map((s) => s.id)).toContain('ses1');
    const sinceRev = p.data.rev;

    const out = { opId: 'op2', type: 'checkout', createdAt: inAt, payload: { sessionId: 'ses1', outAt: new Date().toISOString(), outPhotoId: 'ph2' } };
    expect(call('push', { ops: [out] }, manager, 'dB').data.results[0].session).toMatchObject({ status: 'returned', fee: 5000 });
    const p2 = call('pull', { sinceRev }, staffToken, 'dA');
    expect(p2.data.full).toBe(false);
    expect(p2.data.sessions).toHaveLength(1);
    expect(p2.data.sessions[0]).toMatchObject({ id: 'ses1', status: 'returned', ticketNo: 1, noTicket: false });
  });

  it('nhật ký ghi đủ thao tác', () => {
    const actions = gas.__sheets.get('Audit').data.slice(1).map((r) => r[3]);
    expect(actions).toEqual(expect.arrayContaining(['staff_change', 'create_batch', 'create', 'checkout']));
  });

  it('tải ảnh lên Drive theo ngày, gửi lại không tạo file thứ hai, lấy lại được ảnh', () => {
    const jpeg = Buffer.from('anh-xe-gia').toString('base64');
    const up = { photoId: 'ph1', sessionId: 'ses1', kind: 'in', takenAt: new Date().toISOString(), jpegBase64: jpeg };
    const r = call('uploadPhoto', up, staffToken, 'dA');
    expect(r.ok).toBe(true);
    const file = fake.files.get(r.data.driveFileId);
    expect(file.name).toBe('001_in_ph1.jpg');
    expect(file.folder.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(file.folder.parent.name).toBe('Anh');
    expect(call('uploadPhoto', up, staffToken, 'dA').data).toMatchObject({ driveFileId: r.data.driveFileId, duplicate: true });
    expect([...fake.files.values()].filter((f) => !f.trashed)).toHaveLength(1);
    expect(call('getPhoto', { photoId: 'ph1' }, manager, 'dB').data.jpegBase64).toBe(jpeg);
    expect(call('getPhoto', { photoId: 'khong-co' }, manager, 'dB').error.code).toBe('PHOTO_NOT_FOUND');
  });

  it('chưa cấu hình khóa AI → không gọi AI, ảnh ghi "disabled"', () => {
    expect(fake.fetches).toHaveLength(0);
    const row = gas.findBy('Photos', 'id', 'ph1');
    expect(row.analysisStatus).toBe('disabled');
  });

  it('có khóa Gemini: AI đọc biển số + màu + mũ, gắn vào lượt gửi và tới máy khác qua pull', () => {
    const props = gas.PropertiesService.getScriptProperties();
    props.setProperty('VISION_API_KEY', 'khoa-thu');
    const reply = { plate: '59X1-123.45', color: 'đỏ', vehicleType: 'motorbike', helmetsOnVehicle: 2, helmetsWorn: 0, otherItems: [],
      confidence: { plate: 0.95, color: 0.9, helmets: 0.9 } };
    fake.setFetch(() => ({ code: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }) }));
    const inAt = new Date().toISOString();
    call('push', { ops: [{ opId: 'op9', type: 'createSession', createdAt: inAt,
      payload: { id: 'ses9', ticketDate: today(), ticketNo: 9, noTicket: false, vehicleType: 'motorbike', inAt, inPhotoId: 'ph9' } }] }, staffToken, 'dA');
    const before = call('pull', { sinceRev: 0 }, manager, 'dB').data.rev;
    const r = call('uploadPhoto', { photoId: 'ph9', sessionId: 'ses9', kind: 'in', takenAt: inAt, jpegBase64: Buffer.from('x').toString('base64') }, staffToken, 'dA');
    expect(r.ok).toBe(true);
    expect(fake.fetches.at(-1).url).toContain('generativelanguage.googleapis.com');
    expect(fake.fetches.at(-1).opts.headers['x-goog-api-key']).toBe('khoa-thu');
    const p = call('pull', { sinceRev: before }, manager, 'dB').data;
    expect(p.sessions.find((s) => s.id === 'ses9')).toMatchObject({ plate: '59X1-123.45', plateStatus: 'read', inSummary: 'Xe máy màu đỏ · 2 mũ' });
    expect(gas.findBy('Photos', 'id', 'ph9')).toMatchObject({ analysisStatus: 'done', color: 'đỏ', helmetsOnVehicle: 2 });
  });

  it('Claude: gửi đúng định dạng Messages API, đọc kết quả JSON', () => {
    const props = gas.PropertiesService.getScriptProperties();
    props.setProperty('VISION_PROVIDER', 'claude');
    const reply = { plate: '', color: 'xanh dương', vehicleType: 'bicycle', helmetsOnVehicle: 0, helmetsWorn: 1, otherItems: [], confidence: { plate: 0, color: 0.9, helmets: 0.8 } };
    fake.setFetch(() => ({ code: 200, body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(reply) }] }) }));
    const res = gas.analyzeBlob_({ getBytes: () => [1, 2, 3] });
    const req = fake.fetches.at(-1);
    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.opts.headers).toMatchObject({ 'x-api-key': 'khoa-thu', 'anthropic-version': '2026-10-21' });
    const body = JSON.parse(req.opts.payload);
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.temperature).toBeUndefined();
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.messages[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });
    expect(res).toMatchObject({ ok: true, analysis: { color: 'xanh dương', helmetsWorn: 1, plate: '' } });
    fake.setFetch(() => ({ code: 200, body: JSON.stringify({ stop_reason: 'refusal', content: [] }) }));
    expect(gas.analyzeBlob_({ getBytes: () => [1] })).toMatchObject({ ok: false, error: 'REFUSAL' });
    props.setProperty('VISION_PROVIDER', 'gemini');
  });

  it('AI lỗi → ảnh "failed", tải ảnh vẫn thành công; trigger 5 phút phân tích lại', () => {
    fake.setFetch(() => ({ code: 503, body: '{}' }));
    const takenAt = new Date().toISOString();
    expect(call('uploadPhoto', { photoId: 'ph10', sessionId: 'ses9', kind: 'out', takenAt, jpegBase64: 'eA==' }, staffToken, 'dA').ok).toBe(true);
    expect(gas.findBy('Photos', 'id', 'ph10').analysisStatus).toBe('failed');
    // giả như đã tải lên 3 phút trước
    const sh = fake.sheets.get('Photos');
    const cols = gas.HEADERS.Photos;
    const row = sh.data.find((r) => r[0] === 'ph10');
    row[cols.indexOf('uploadedAt')] = new Date(Date.now() - 180000).toISOString();
    const reply = { plate: '', color: 'đỏ', vehicleType: 'motorbike', helmetsOnVehicle: 1, helmetsWorn: 0, otherItems: [], confidence: { plate: 0, color: 0.9, helmets: 0.9 } };
    fake.setFetch(() => ({ code: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }) }));
    expect(gas.retryFailedAnalyses()).toBe(1);
    expect(gas.findBy('Photos', 'id', 'ph10')).toMatchObject({ analysisStatus: 'done', helmetsOnVehicle: 1, analysisAttempts: 2 });
  });

  it('dọn đêm: thư mục ảnh > 30 ngày vào thùng rác; dòng > 90 ngày dời sang file lưu trữ (không mất)', () => {
    const photosRoot = fake.folders.get(gas.PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID'));
    const old = photosRoot.createFolder('2020-01-01');
    const sh = fake.sheets.get('Sessions');
    const cols = gas.HEADERS.Sessions;
    const oldRow = cols.map((c) => ({ id: 'old1', ticketDate: '20200101', ticketNo: '5', status: 'returned', inAt: '2020-01-01T03:00:00.000Z', outAt: '2020-01-01T04:00:00.000Z', rev: '1' }[c] || ''));
    sh.data.push(oldRow);
    const total = sh.data.length;
    const r = gas.nightlyCleanup();
    expect(r.trashedFolders).toBe(1);
    expect(old.trashed).toBe(true);
    expect(r.archived.Sessions).toBe(1);
    expect(sh.data).toHaveLength(total - 1);
    expect(sh.data.some((row) => row[0] === 'old1')).toBe(false);
    const arch = [...fake.spreadsheets.values()].find((x) => x.name.startsWith('GoMay-GiuXe-LuuTru-'));
    expect(arch.sheets.get('Sessions').data.some((row) => row[0] === 'old1')).toBe(true);
    expect(sh.data.some((row) => row[0] === 'ses9')).toBe(true); // dữ liệu mới giữ nguyên
  });

  it('US4/US5: mất phiếu, hủy lượt (chỉ quản lý), chốt ca lưu vào Shifts, báo cáo, đổi giá', () => {
    const inAt = new Date().toISOString();
    const mkCreate = (id, no) => ({ opId: `c-${id}`, type: 'createSession', createdAt: inAt,
      payload: { id, ticketDate: today(), ticketNo: no, noTicket: false, vehicleType: 'motorbike', inAt, inPhotoId: `p-${id}` } });
    call('push', { ops: [mkCreate('L1', 30), mkCreate('L2', 31)] }, staffToken, 'dA');
    const lost = call('push', { ops: [{ opId: 'lost1', type: 'lostCheckout', createdAt: inAt, payload: { sessionId: 'L1', outAt: inAt, outPhotoId: 'po', note: 'đã xem cà vẹt' } }] }, staffToken, 'dA');
    expect(lost.data.results[0].session).toMatchObject({ status: 'lost', fee: 10000 });
    expect(call('push', { ops: [{ opId: 'can1', type: 'cancel', createdAt: inAt, payload: { sessionId: 'L2', note: 'nhầm' } }] }, staffToken, 'dA').data.results[0].error).toBe('FORBIDDEN');
    expect(call('push', { ops: [{ opId: 'can2', type: 'cancel', createdAt: inAt, payload: { sessionId: 'L2', note: 'nhầm' } }] }, manager, 'dB').data.results[0].session.status).toBe('cancelled');

    const start = new Date(Date.now() - 3600000).toISOString();
    const end = new Date(Date.now() + 1000).toISOString();
    const cs0 = call('push', { ops: [{ opId: 'shift1', type: 'closeShift', createdAt: end, payload: { shiftId: 'sh1', startAt: start, endAt: end } }] }, staffToken, 'dA');
    const cs = cs0;
    expect(cs.data.results[0].shift.summary).toMatchObject({ lost: 1, revenue: 10000 });
    expect(gas.findBy('Shifts', 'id', 'sh1').summary.revenue).toBe(10000);

    expect(call('report', { from: today(), to: today() }, staffToken).error.code).toBe('FORBIDDEN');
    const rep = call('report', { from: today(), to: today(), groupBy: 'day' }, manager).data;
    expect(rep.rows).toHaveLength(1);
    expect(rep.rows[0].revenue).toBe(15000); // lượt 001 trả 5.000đ + mất phiếu 10.000đ
    expect(call('report', { from: today(), to: today(), groupBy: 'shift' }, manager).data.rows[0]).toMatchObject({ key: 'sh1', label: expect.stringContaining('Tuấn') });

    expect(call('setPrices', { motorbike: 6000, ebike: 6000, bicycle: 4000, lostFee: 15000 }, staffToken).error.code).toBe('FORBIDDEN');
    const pr = call('setPrices', { motorbike: 6000, ebike: 6000, bicycle: 4000, lostFee: 15000 }, manager).data.prices;
    expect(pr).toHaveLength(2); // dòng giá cũ vẫn giữ
    const actions = fake.sheets.get('Audit').data.slice(1).map((r) => r[3]);
    expect(actions).toEqual(expect.arrayContaining(['lost', 'cancel', 'close_shift', 'set_price']));
  });

  it('US7: ảnh vào 2 mũ, ảnh ra 1 mũ → cảnh báo cho nhân viên trả xe; đóng cảnh báo; độ nhạy; sửa tay kết quả AI', () => {
    const props = gas.PropertiesService.getScriptProperties();
    props.setProperty('VISION_API_KEY', 'khoa-thu');
    props.setProperty('VISION_PROVIDER', 'gemini');
    const reply = (helmets) => ({ code: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      plate: '', color: 'đỏ', vehicleType: 'motorbike', helmetsOnVehicle: helmets, helmetsWorn: 0, otherItems: [],
      confidence: { plate: 0, color: 0.9, helmets: 0.9 } }) }] } }] }) });
    const inAt = new Date().toISOString();
    call('push', { ops: [{ opId: 'a7-in', type: 'createSession', createdAt: inAt,
      payload: { id: 'S7', ticketDate: today(), ticketNo: 77, noTicket: false, vehicleType: 'motorbike', inAt, inPhotoId: 'P7in' } }] }, staffToken, 'dA');
    fake.setFetch(() => reply(2));
    call('uploadPhoto', { photoId: 'P7in', sessionId: 'S7', kind: 'in', takenAt: inAt, jpegBase64: 'eA==' }, staffToken, 'dA');
    const since = call('pull', { sinceRev: 0 }, manager, 'dB').data.rev;
    call('push', { ops: [{ opId: 'a7-out', type: 'checkout', createdAt: inAt, payload: { sessionId: 'S7', outAt: inAt, outPhotoId: 'P7out' } }] }, manager, 'dB');
    fake.setFetch(() => reply(1));
    call('uploadPhoto', { photoId: 'P7out', sessionId: 'S7', kind: 'out', takenAt: inAt, jpegBase64: 'eA==' }, manager, 'dB');

    const p = call('pull', { sinceRev: since }, manager, 'dB').data;
    expect(p.alerts).toHaveLength(1);
    expect(p.alerts[0]).toMatchObject({ sessionId: 'S7', kind: 'helmet_missing', level: 'medium', status: 'new',
      message: 'Phiếu 077: lúc vào 2 mũ, lúc ra 1 mũ', notifyStaffId: gas.findBy('Staff', 'name', 'Quản lý').id });
    expect(p.analyses.map((a) => a.id).sort()).toEqual(['P7out']);
    // upload lại ảnh ra không tạo cảnh báo trùng
    call('uploadPhoto', { photoId: 'P7out', sessionId: 'S7', kind: 'out', takenAt: inAt, jpegBase64: 'eA==' }, manager, 'dB');
    expect(gas.readObjects('Alerts')).toHaveLength(1);

    const alertId = p.alerts[0].id;
    expect(call('resolveAlert', { alertId, resolution: 'bậy' }, staffToken).error.code).toBe('BAD_REQUEST');
    expect(call('resolveAlert', { alertId, resolution: 'real_issue', note: 'khách báo mất mũ' }, staffToken).data.alert)
      .toMatchObject({ status: 'resolved', resolution: 'real_issue', note: 'khách báo mất mũ' });
    expect(call('pull', { sinceRev: p.rev }, staffToken, 'dA').data.alerts[0].status).toBe('resolved');
    expect(call('listAlerts', { from: today(), to: today() }, manager).data.alerts[0]).toMatchObject({ ticketNo: 77, inPhotoId: 'P7in' });

    expect(call('setConfig', { alertThreshold: 0.9 }, staffToken).error.code).toBe('FORBIDDEN');
    expect(call('setConfig', { alertThreshold: 0.3 }, manager).error.code).toBe('BAD_REQUEST');
    expect(call('setConfig', { alertThreshold: 0.9 }, manager).data.alertThreshold).toBe(0.9);
    expect(gas.getConfig('alertThreshold')).toBe('0.9');

    const r = call('setAnalysis', { photoId: 'P7in', helmetsOnVehicle: 1 }, manager).data;
    expect(r.analysis).toMatchObject({ analysisStatus: 'manual', helmetsOnVehicle: 1 });
    const actions = fake.sheets.get('Audit').data.slice(1).map((x) => x[3]);
    expect(actions).toEqual(expect.arrayContaining(['alert', 'resolve_alert', 'set_config', 'set_analysis']));
    props.setProperty('VISION_API_KEY', '');
  });

  it('T079 bảo mật: mọi lệnh quản lý từ chối token nhân viên; không lộ PIN và khóa AI; khóa/đổi PIN thì đăng xuất mọi máy', () => {
    const managerOnly = Object.keys(gas.ROUTES).filter((k) => gas.ROUTES[k].manager);
    expect(managerOnly.sort()).toEqual(['createBatch', 'listAlerts', 'listBatches', 'listStaff', 'reprintBatch', 'report',
      'revokeTokens', 'saveStaff', 'setAnalysis', 'setConfig', 'setPrices'].sort());
    for (const action of managerOnly) expect(call(action, {}, staffToken).error.code, action).toBe('FORBIDDEN');
    // Hủy lượt (qua push) cũng chỉ quản lý — đã kiểm ở test US4/US5.

    // PIN không lưu dạng chữ thường: trang tính Staff chỉ có pinHash
    const staffSheet = fake.sheets.get('Staff').data;
    expect(staffSheet[0]).not.toContain('pin');
    expect(JSON.stringify(staffSheet)).not.toContain('"1234"');
    expect(JSON.stringify(staffSheet)).not.toContain(pin);

    // Khóa AI không bao giờ trả về máy; qrSecret chỉ trả lúc đăng nhập (cần để kiểm tra phiếu khi mất mạng)
    const props = gas.PropertiesService.getScriptProperties();
    props.setProperty('VISION_API_KEY', 'KHOA-BI-MAT-XYZ');
    const responses = [call('login', { staffName: 'Tuấn', pin: '1234' }), call('pull', { sinceRev: 0 }, manager), call('report', { from: today(), to: today() }, manager),
      call('listStaff', {}, manager), call('listAlerts', {}, manager)];
    for (const r of responses) expect(JSON.stringify(r)).not.toContain('KHOA-BI-MAT-XYZ');
    expect(JSON.stringify(call('pull', { sinceRev: 0 }, manager))).not.toContain(props.getProperty('QR_SECRET'));
    props.setProperty('VISION_API_KEY', '');

    // Đăng xuất từ xa
    const t2 = call('login', { staffName: 'Tuấn', pin: '1234' }).data.token;
    expect(call('pull', {}, t2).ok).toBe(true);
    const tuan = gas.findBy('Staff', 'name', 'Tuấn');
    expect(call('revokeTokens', { staffId: tuan.id }, manager).data.revoked).toBeGreaterThanOrEqual(2);
    expect(call('pull', {}, t2).error.code).toBe('AUTH_REQUIRED');
    expect(call('pull', {}, staffToken).error.code).toBe('AUTH_REQUIRED');
    // Khóa tài khoản → không đăng nhập được, token cũ hết hiệu lực
    const t3 = call('login', { staffName: 'Tuấn', pin: '1234' }).data.token;
    call('saveStaff', { id: tuan.id, name: 'Tuấn', role: 'staff', active: false }, manager);
    expect(call('pull', {}, t3).error.code).toBe('AUTH_REQUIRED');
    expect(call('login', { staffName: 'Tuấn', pin: '1234' }).error.code).toBe('STAFF_INACTIVE');
    // Đổi PIN → PIN cũ không dùng được
    call('saveStaff', { id: tuan.id, name: 'Tuấn', role: 'staff', active: true, pin: '9999' }, manager);
    expect(call('login', { staffName: 'Tuấn', pin: '1234' }).error.code).toBe('BAD_LOGIN');
    expect(call('login', { staffName: 'Tuấn', pin: '9999' }).ok).toBe(true);
  });

  it('T079 bảo mật: sai PIN 5 lần thì khóa đăng nhập 15 phút', () => {
    for (let i = 0; i < 5; i++) expect(call('login', { staffName: 'Hoa', pin: '0000' }).error.code).toBe('BAD_LOGIN');
    call('saveStaff', { name: 'Hoa', role: 'staff', pin: '2468' }, manager);
    expect(call('login', { staffName: 'Hoa', pin: '2468' }).error.message).toContain('15 phút');
  });

  it('file gộp gas-bundle/GoMay-GiuXe.gs chạy được; dự án KHÔNG gắn bảng tính thì setup() tự tạo bảng tính', () => {
    const f2 = fakeGoogle();
    const noActive = { ...f2.globals, SpreadsheetApp: { ...f2.globals.SpreadsheetApp, getActiveSpreadsheet: () => null } };
    // bảng tính tự tạo phải lưu được trang tính → dùng spreadsheet giả của fake
    const created = [];
    const realSS = f2.globals.SpreadsheetApp.getActiveSpreadsheet();
    const newSS = { ...realSS, getId: () => 'sheet-moi', getUrl: () => 'https://docs.google.com/spreadsheets/d/sheet-moi' };
    noActive.SpreadsheetApp.create = (n) => { created.push(n); return newSS; };
    noActive.SpreadsheetApp.openById = (id) => (id === 'sheet-moi' ? newSS : null);
    const ctx2 = vm.createContext({ ...noActive });
    vm.runInContext(fs.readFileSync('gas-bundle/GoMay-GiuXe.gs', 'utf8'), ctx2, { filename: 'GoMay-GiuXe.gs' });
    const msg = ctx2.setup();
    expect(created).toEqual(['GoMay-GiuXe']);
    expect(msg).toContain('Đã tạo bảng tính "GoMay-GiuXe"');
    expect(ctx2.PropertiesService.getScriptProperties().getProperty('SHEET_ID')).toBe('sheet-moi');
    const pin2 = /mã PIN (\d{6})/.exec(msg)[1];
    const r = JSON.parse(ctx2.doPost({ postData: { contents: JSON.stringify({ action: 'login', data: { staffName: 'Quản lý', pin: pin2 } }) } }).content);
    expect(r.ok).toBe(true);
  });

  it('Ảnh tải lên LÚC CHƯA CÓ KHÓA AI → thêm khóa sau thì trigger 5 phút vẫn đọc lại; lỗi AI có lý do gửi về máy', () => {
    const props = gas.PropertiesService.getScriptProperties();
    props.setProperty('VISION_API_KEY', '');
    const inAt = new Date().toISOString();
    call('push', { ops: [{ opId: 'nk-in', type: 'createSession', createdAt: inAt,
      payload: { id: 'SNK', ticketDate: today(), ticketNo: 88, noTicket: false, vehicleType: 'motorbike', inAt, inPhotoId: 'PNK' } }] }, manager, 'dA');
    call('uploadPhoto', { photoId: 'PNK', sessionId: 'SNK', kind: 'in', takenAt: inAt, jpegBase64: 'eA==' }, manager, 'dA');
    expect(gas.findBy('Photos', 'id', 'PNK').analysisStatus).toBe('disabled');
    const p0 = call('pull', { sinceRev: 0 }, manager, 'dA').data;
    expect(p0.analyses.find((a) => a.id === 'PNK')).toMatchObject({ analysisStatus: 'disabled' });
    expect(p0.config.visionEnabled).toBe(false);

    // Chủ sân thêm khóa AI sau — nhưng khóa sai → lỗi HTTP_403 có lý do
    props.setProperty('VISION_API_KEY', 'khoa-sai');
    const row = fake.sheets.get('Photos').data.find((r) => r[0] === 'PNK');
    row[gas.HEADERS.Photos.indexOf('uploadedAt')] = new Date(Date.now() - 180000).toISOString();
    fake.setFetch(() => ({ code: 403, body: '{}' }));
    expect(gas.retryFailedAnalyses()).toBeGreaterThanOrEqual(1);
    const p1 = call('pull', { sinceRev: p0.rev }, manager, 'dA').data;
    expect(p1.analyses.find((a) => a.id === 'PNK')).toMatchObject({ analysisStatus: 'failed', analysisError: 'HTTP_403' });
    expect(p1.config.visionEnabled).toBe(true);

    // Sửa khóa đúng → lần thử sau đọc được biển số
    fake.setFetch(() => ({ code: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      plate: '77-C1 399.97', color: 'đen', vehicleType: 'motorbike', helmetsOnVehicle: 0, helmetsWorn: 0, otherItems: [],
      confidence: { plate: 0.95, color: 0.9, helmets: 0.9 } }) }] } }] }) }));
    gas.retryFailedAnalyses();
    expect(gas.findBy('Sessions', 'id', 'SNK')).toMatchObject({ plate: '77-C1 399.97', plateStatus: 'read' });
    const done = gas.findBy('Photos', 'id', 'PNK');
    expect(done.analysisStatus).toBe('done');
    expect(done.analysisError || '').toBe(''); // lỗi cũ đã được xóa
    props.setProperty('VISION_API_KEY', '');
  });

  it('Ảnh lên TRƯỚC lượt gửi / lượt trả (chụp 2 xe liên tiếp) → máy chủ vẫn gắn biển số và vẫn cảnh báo khác xe', () => {
    const props = gas.PropertiesService.getScriptProperties();
    props.setProperty('VISION_API_KEY', 'khoa-thu');
    props.setProperty('VISION_PROVIDER', 'gemini');
    const reply = (color, plate) => ({ code: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      plate, color, vehicleType: 'motorbike', helmetsOnVehicle: 1, helmetsWorn: 0, otherItems: [],
      confidence: { plate: plate ? 0.95 : 0, color: 0.9, helmets: 0.9 } }) }] } }] }) });
    const t = new Date().toISOString();
    // 1) ảnh lúc vào lên trước — máy chủ chưa có lượt gửi
    fake.setFetch(() => reply('đen', '77-C1 399.97'));
    call('uploadPhoto', { photoId: 'EARLYin', sessionId: 'EARLY', kind: 'in', takenAt: t, jpegBase64: 'eA==' }, manager, 'dA');
    expect(gas.findBy('Photos', 'id', 'EARLYin').analysisStatus).toBe('done');
    // 2) lượt gửi đến sau → tự gắn biển số
    const push1 = call('push', { ops: [{ opId: 'early-c', type: 'createSession', createdAt: t,
      payload: { id: 'EARLY', ticketDate: today(), ticketNo: 99, noTicket: false, vehicleType: 'motorbike', inAt: t, inPhotoId: 'EARLYin' } }] }, manager, 'dA');
    expect(push1.ok).toBe(true);
    expect(gas.findBy('Sessions', 'id', 'EARLY')).toMatchObject({ plate: '77-C1 399.97', plateStatus: 'read', inSummary: 'Xe máy màu đen · 1 mũ' });
    // 3) ảnh lúc ra (xe KHÁC, màu đỏ, biển khác) lên trước lệnh trả xe
    fake.setFetch(() => reply('đỏ', '59X1-123.45'));
    call('uploadPhoto', { photoId: 'EARLYout', sessionId: 'EARLY', kind: 'out', takenAt: t, jpegBase64: 'eA==' }, manager, 'dB');
    expect(gas.readObjects('Alerts').filter((a) => a.sessionId === 'EARLY')).toHaveLength(0); // chưa trả xe → chưa so sánh
    // 4) lệnh trả xe đến sau → so sánh và cảnh báo
    call('push', { ops: [{ opId: 'early-o', type: 'checkout', createdAt: t, payload: { sessionId: 'EARLY', outAt: t, outPhotoId: 'EARLYout' } }] }, manager, 'dB');
    const kinds = gas.readObjects('Alerts').filter((a) => a.sessionId === 'EARLY').map((a) => a.kind).sort();
    expect(kinds).toEqual(['color_mismatch', 'plate_mismatch']);
    props.setProperty('VISION_API_KEY', '');
  });
});
