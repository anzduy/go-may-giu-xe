// Đăng nhập bằng tên + mã PIN, token, quản lý nhân viên.

var MAX_FAILS = 5;
var LOCK_SECONDS = 15 * 60;

function pinHash_(staffId, pin) {
  return sha256Hex(staffId + ':' + pin); // từ gas/Shared.js
}

function randomToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function login(d) {
  var name = String(d.staffName || '').trim().toLowerCase();
  var pin = String(d.pin || '').trim();
  if (!name || !/^\d{4,6}$/.test(pin)) throw err_('BAD_LOGIN');
  var cache = CacheService.getScriptCache();
  var failKey = 'fail:' + name;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILS) throw err_('BAD_LOGIN', 'Sai quá nhiều lần, thử lại sau 15 phút');

  var staff = readObjects('Staff').filter(function (s) { return String(s.name).trim().toLowerCase() === name; })[0];
  if (!staff || staff.pinHash !== pinHash_(staff.id, pin)) {
    cache.put(failKey, String(fails + 1), LOCK_SECONDS);
    throw err_('BAD_LOGIN');
  }
  if (!staff.active) throw err_('STAFF_INACTIVE');
  cache.remove(failKey);

  var token = randomToken_();
  appendObject('Tokens', { token: token, staffId: staff.id, deviceId: String(d.deviceId || ''), createdAt: new Date().toISOString(), revoked: false });
  return {
    token: token,
    staff: { id: staff.id, name: staff.name, role: staff.role },
    qrSecret: PropertiesService.getScriptProperties().getProperty('QR_SECRET'),
    serverTime: new Date().toISOString(),
  };
}

/** Kiểm tra token → { staff }. Có cache 2 phút cho nhanh (khóa nhân viên có hiệu lực tối đa sau 2 phút). */
function authenticate(token) {
  if (!token) throw err_('AUTH_REQUIRED');
  var cache = CacheService.getScriptCache();
  var cached = cache.get('tok:' + token);
  if (cached) return { staff: JSON.parse(cached) };
  var row = findBy('Tokens', 'token', String(token));
  if (!row || row.revoked) throw err_('AUTH_REQUIRED');
  var staff = findBy('Staff', 'id', row.staffId);
  if (!staff || !staff.active) throw err_('AUTH_REQUIRED');
  var info = { id: staff.id, name: staff.name, role: staff.role };
  cache.put('tok:' + token, JSON.stringify(info), 120);
  return { staff: info };
}

function listStaff() {
  return { staff: readObjects('Staff').map(function (s) { return { id: s.id, name: s.name, role: s.role, active: s.active }; }) };
}

/** Tạo/sửa nhân viên (không bao giờ xóa — nghỉ việc thì tắt `active`). */
function saveStaff(d, auth) {
  var name = String(d.name || '').trim();
  var role = d.role === 'manager' ? 'manager' : 'staff';
  if (!name) throw err_('BAD_REQUEST', 'Thiếu tên nhân viên');
  if (d.pin != null && d.pin !== '' && !/^\d{4,6}$/.test(String(d.pin))) throw err_('BAD_REQUEST', 'Mã PIN phải gồm 4–6 chữ số');
  return withLock(function () {
    var all = readObjects('Staff');
    var existing = d.id ? all.filter(function (s) { return s.id === d.id; })[0] : null;
    if (!existing && all.some(function (s) { return String(s.name).trim().toLowerCase() === name.toLowerCase(); })) {
      throw err_('BAD_REQUEST', 'Tên nhân viên đã tồn tại');
    }
    if (!existing && !d.pin) throw err_('BAD_REQUEST', 'Nhân viên mới cần mã PIN');
    var id = existing ? existing.id : 'st_' + Utilities.getUuid().slice(0, 8);
    var row = {
      id: id, name: name, role: role,
      pinHash: d.pin ? pinHash_(id, String(d.pin)) : existing.pinHash,
      active: d.active !== false,
    };
    upsertObjects('Staff', [row], all);
    audit(auth.staff.id, auth.deviceId, 'staff_change', '', { id: id, name: name, role: role, active: row.active, pinChanged: !!d.pin });
    return { staff: { id: id, name: name, role: role, active: row.active } };
  });
}
