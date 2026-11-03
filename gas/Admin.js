// Chức năng quản lý: tạo bộ phiếu ngày (giao diện in ở web/js/screens/print.js), báo cáo, bảng giá.

function createBatch(d, auth) {
  var date = String(d.date || '');
  var count = Number(d.count || 0);
  if (!/^\d{8}$/.test(date)) throw err_('BAD_REQUEST', 'Ngày không hợp lệ');
  if (!(count >= 1 && count <= 500)) throw err_('BAD_REQUEST', 'Số lượng phiếu phải từ 1 đến 500');
  var secret = PropertiesService.getScriptProperties().getProperty('QR_SECRET');
  var batch = withLock(function () {
    var max = maxTicketNo(readObjects('TicketBatches'), date); // từ gas/Shared.js
    var b = { date: date, fromNo: max + 1, toNo: max + count, createdBy: auth.staff.id, createdAt: new Date().toISOString() };
    appendObject('TicketBatches', b);
    nextRev();
    audit(auth.staff.id, auth.deviceId, 'create_batch', '', { date: date, fromNo: b.fromNo, toNo: b.toNo });
    return b;
  });
  var tickets = [];
  for (var no = batch.fromNo; no <= batch.toNo; no++) tickets.push({ no: no, qr: encodeQr(date, no, secret) });
  return { date: date, fromNo: batch.fromNo, toNo: batch.toNo, tickets: tickets };
}

/** Danh sách bộ phiếu gần đây (mới nhất trước), kèm tên người tạo. */
function listBatches() {
  var names = {};
  readObjects('Staff').forEach(function (s) { names[s.id] = s.name; });
  var rows = readObjects('TicketBatches').map(strip_).map(function (b) { b.createdByName = names[b.createdBy] || b.createdBy; return b; });
  rows.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  return { batches: rows.slice(0, 60) };
}

/** In lại một bộ phiếu đã tạo (không tạo số mới). */
function reprintBatch(d) {
  var secret = PropertiesService.getScriptProperties().getProperty('QR_SECRET');
  var date = String(d.date || '');
  var fromNo = Number(d.fromNo), toNo = Number(d.toNo);
  if (!/^\d{8}$/.test(date) || !(fromNo >= 1) || !(toNo >= fromNo) || toNo - fromNo > 500) throw err_('BAD_REQUEST');
  var tickets = [];
  for (var no = fromNo; no <= toNo; no++) tickets.push({ no: no, qr: encodeQr(date, no, secret) });
  return { date: date, fromNo: fromNo, toNo: toNo, tickets: tickets };
}

/** Báo cáo theo ngày hoặc theo ca, từ ngày `from` đến `to` (YYYYMMDD). Chỉ quản lý. */
function report(d) {
  var from = String(d.from || ''), to = String(d.to || '');
  if (!/^\d{8}$/.test(from) || !/^\d{8}$/.test(to) || from > to) throw err_('BAD_REQUEST', 'Khoảng ngày không hợp lệ');
  var names = {};
  readObjects('Staff').forEach(function (s) { names[s.id] = s.name; });
  var rows = reportRows({
    sessions: readObjects('Sessions').map(strip_),
    alerts: readObjects('Alerts').map(strip_),
    batches: readObjects('TicketBatches').map(strip_),
    shifts: readObjects('Shifts').map(strip_),
    from: from, to: to, groupBy: d.groupBy === 'shift' ? 'shift' : 'day', staffNames: names,
  });
  return { rows: rows, staffNames: names };
}

/** Đổi giá: thêm dòng giá mới có hiệu lực từ bây giờ (giữ lịch sử, không sửa dòng cũ). */
function setPrices(d, auth) {
  var row = { effectiveFrom: new Date().toISOString(), setBy: auth.staff.id };
  ['motorbike', 'ebike', 'bicycle', 'lostFee'].forEach(function (k) {
    var v = Number(d[k]);
    if (!(v >= 0 && v <= 1000000) || Math.round(v) !== v) throw err_('BAD_REQUEST', 'Giá không hợp lệ: ' + k);
    row[k] = v;
  });
  withLock(function () {
    appendObject('Prices', row);
    nextRev();
    audit(auth.staff.id, auth.deviceId, 'set_price', '', row);
  });
  return { prices: readObjects('Prices').map(strip_) };
}
