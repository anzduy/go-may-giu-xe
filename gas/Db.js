// Đọc/ghi Google Sheets, khóa ngắn, bộ đếm phiên bản (rev), nhật ký.
// Mọi ô được lưu dạng văn bản thuần (định dạng "@") để Sheets không tự đổi chuỗi giờ ISO thành ngày;
// khi đọc lên sẽ đổi lại kiểu số / đúng-sai / JSON theo danh sách cột bên dưới.

var HEADERS = {
  Sessions: ['id', 'ticketDate', 'ticketNo', 'noTicket', 'vehicleType', 'plate', 'plateStatus', 'inSummary', 'inAt',
    'inStaffId', 'inDeviceId', 'inPhotoId', 'outAt', 'outStaffId', 'outPhotoId', 'fee', 'priceAtIn', 'status', 'note',
    'conflict', 'mergedInto', 'rev'],
  TicketBatches: ['date', 'fromNo', 'toNo', 'createdBy', 'createdAt'],
  Photos: ['id', 'sessionId', 'kind', 'takenAt', 'deviceId', 'driveFileId', 'uploadedAt', 'analysisStatus', 'plate',
    'color', 'vehicleTypeSeen', 'helmetsOnVehicle', 'helmetsWorn', 'otherItems', 'confidence', 'analyzedAt', 'analysisAttempts', 'rev', 'analysisError'],
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
