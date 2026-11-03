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
