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
