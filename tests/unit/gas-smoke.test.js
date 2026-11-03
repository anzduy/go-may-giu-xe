// Chạy thử mã Apps Script (gas/*.js) trong Node với các dịch vụ Google giả lập trong bộ nhớ,
// để bắt lỗi trước khi dán lên Apps Script thật.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

function fakeGoogle() {
  const sheets = new Map();
  const makeSheet = (name) => {
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
    };
    sheets.set(name, sh);
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
  const folder = (name) => ({ getId: () => `folder-${name}`, getFoldersByName: () => ({ hasNext: () => false }), createFolder: (n) => folder(n) });
  return {
    sheets,
    globals: {
      SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
      PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v)) }) },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
      CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
      Utilities: { getUuid: () => crypto.randomUUID() },
      ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ content: s, setMimeType() { return this; } }) },
      DriveApp: { getRootFolder: () => folder('root') },
      ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create() {} }) }), everyMinutes: () => ({ create() {} }) }) }) },
      Logger: { log() {} },
      console,
    },
  };
}

let gas;
let pin;
const call = (action, data, token, deviceId = 'dev1') =>
  JSON.parse(gas.doPost({ postData: { contents: JSON.stringify({ action, data, token, deviceId }) } }).content);

beforeAll(() => {
  const fake = fakeGoogle();
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
});
