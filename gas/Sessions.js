// push: nhận hàng đợi thao tác từ máy; pull: trả thay đổi mới. Logic xử lý nằm ở applyPush (gas/Shared.js).

function sessionKeys_() {
  return HEADERS.Sessions;
}

function cleanSession_(s) {
  var o = strip_(s);
  return o;
}

function loadState_() {
  var st = newState(); // từ gas/Shared.js
  var rows = readObjects('Sessions');
  rows.forEach(function (s) { st.sessions.set(s.id, cleanSession_(s)); });
  st.batches = readObjects('TicketBatches').map(strip_);
  st.prices = readObjects('Prices').map(strip_);
  var opIds = sheet_('Ops').getLastRow() > 1 ? sheet_('Ops').getRange(2, 1, sheet_('Ops').getLastRow() - 1, 1).getValues() : [];
  opIds.forEach(function (r) { if (r[0]) st.appliedOpIds.add(String(r[0])); });
  st._rows = rows;
  return st;
}

function push(d, auth) {
  var ops = (d.ops || []).slice(0, 50).map(function (op) {
    return { opId: String(op.opId || ''), type: op.type, payload: op.payload || {}, createdAt: op.createdAt,
      staffId: auth.staff.id, deviceId: auth.deviceId };
  });
  return withLock(function () {
    var st = loadState_();
    var r = applyPush(st, ops);
    var rev = currentRev();
    if (r.changed.length) {
      rev = nextRev();
      var changed = r.changed.map(function (s) { var c = cleanSession_(s); c.rev = rev; return c; });
      upsertObjects('Sessions', changed, st._rows);
      // trả về bản có rev mới
      var byId = {};
      changed.forEach(function (c) { byId[c.id] = c; });
      r.results.forEach(function (res) { if (res.session && byId[res.session.id]) res.session = byId[res.session.id]; });
    }
    var now = new Date().toISOString();
    appendObjects('Ops', r.results.filter(function (x) { return x.opId; }).map(function (x) {
      var op = ops.filter(function (o) { return o.opId === x.opId; })[0];
      return { opId: x.opId, type: op ? op.type : '', staffId: auth.staff.id, appliedAt: now, result: x.status };
    }));
    appendObjects('Audit', r.audits.map(function (a) {
      return { at: a.at || now, staffId: a.staffId, deviceId: a.deviceId, action: a.action, sessionId: a.sessionId || '', detail: a.detail };
    }));
    return { results: r.results, rev: rev };
  });
}

function recentDays_(n) {
  var keys = [];
  var now = Date.now();
  for (var i = 0; i < n; i++) keys.push(dateKey(now - i * 86400000));
  return keys;
}

function pull(d) {
  var sinceRev = Number(d.sinceRev || 0);
  var rev = currentRev();
  var full = !(sinceRev > 0) || sinceRev > rev;
  var days = recentDays_(3);
  var sessions = readObjects('Sessions').map(strip_).filter(function (s) {
    if (full) return s.status === 'in_lot' || days.indexOf(s.ticketDate) >= 0 || (s.outAt && days.indexOf(dateKey(s.outAt)) >= 0);
    return Number(s.rev) > sinceRev;
  });
  return {
    rev: rev,
    full: full,
    sessions: sessions,
    batches: readObjects('TicketBatches').map(strip_).filter(function (b) { return days.indexOf(b.date) >= 0 || b.date > days[0]; }),
    prices: readObjects('Prices').map(strip_),
    analyses: [],
    alerts: [],
    serverTime: new Date().toISOString(),
  };
}
