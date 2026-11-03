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
