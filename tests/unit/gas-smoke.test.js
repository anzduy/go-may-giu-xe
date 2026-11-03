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
      SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, create: (n) => makeSpreadsheet(n), openById: (id) => spreadsheets.get(id) },
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
});
