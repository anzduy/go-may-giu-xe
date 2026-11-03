// Chức năng quản lý: tạo bộ phiếu ngày (phần dữ liệu; giao diện in ở web/js/screens/print.js).

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
