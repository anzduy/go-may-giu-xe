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
