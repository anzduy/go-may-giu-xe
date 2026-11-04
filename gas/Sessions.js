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
  st.alerts = readObjects('Alerts').map(strip_);
  var opIds = sheet_('Ops').getLastRow() > 1 ? sheet_('Ops').getRange(2, 1, sheet_('Ops').getLastRow() - 1, 1).getValues() : [];
  opIds.forEach(function (r) { if (r[0]) st.appliedOpIds.add(String(r[0])); });
  st._rows = rows;
  return st;
}

function push(d, auth) {
  var ops = (d.ops || []).slice(0, 50).map(function (op) {
    return { opId: String(op.opId || ''), type: op.type, payload: op.payload || {}, createdAt: op.createdAt,
      staffId: auth.staff.id, deviceId: auth.deviceId, role: auth.staff.role };
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
    if (r.shifts.length) upsertObjects('Shifts', r.shifts);
    if (r.changed.length) applyEarlyAnalyses_(r.changed);
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
    staffNames: staffNames_(),
    config: { alertThreshold: Number(getConfig('alertThreshold', DEFAULT_THRESHOLD)) || DEFAULT_THRESHOLD, visionEnabled: visionConfigured_() },
    // Mọi trạng thái AI (kể cả chưa bật / lỗi) để app hiện lý do chưa có biển số.
    analyses: readObjects('Photos').map(strip_).filter(function (p) {
      return p.analysisStatus && (full ? days.indexOf(dateKey(p.takenAt)) >= 0 : Number(p.rev) > sinceRev);
    }).map(analysisOf_),
    alerts: readObjects('Alerts').map(strip_).filter(function (a) {
      return full ? (a.status === 'new' || days.indexOf(dateKey(a.createdAt)) >= 0) : Number(a.rev) > sinceRev;
    }),
    serverTime: new Date().toISOString(),
  };
}

function staffNames_() {
  var names = {};
  readObjects('Staff').forEach(function (s) { names[s.id] = s.name; });
  return names;
}

/** Phần phân tích AI của một dòng Photos (gửi cho máy để xem/sửa, không kèm ảnh). */
function analysisOf_(p) {
  return { id: p.id, sessionId: p.sessionId, kind: p.kind, analysisStatus: p.analysisStatus, analysisError: p.analysisError || '', plate: p.plate || '',
    color: p.color || 'không rõ', vehicleType: p.vehicleTypeSeen || 'other', helmetsOnVehicle: Number(p.helmetsOnVehicle) || 0,
    helmetsWorn: Number(p.helmetsWorn) || 0, otherItems: p.otherItems || [], confidence: p.confidence || { plate: 0, color: 0, helmets: 0 } };
}

/**
 * Ảnh có thể lên máy chủ TRƯỚC thao tác của lượt đó (máy mất mạng giữa chừng, bản app cũ).
 * Khi lượt gửi / trả xe đến sau: gắn kết quả AI ảnh lúc vào (biển số, tóm tắt) và so sánh để cảnh báo.
 * Gọi bên trong withLock của push().
 */
function applyEarlyAnalyses_(changed) {
  var threshold = Number(getConfig('alertThreshold', DEFAULT_THRESHOLD)) || DEFAULT_THRESHOLD;
  var photos = null;
  changed.forEach(function (c) {
    if (c.inPhotoId && c.plateStatus === 'pending' && !c.inSummary) {
      photos = photos || readObjects('Photos');
      var p = photos.filter(function (x) { return x.id === c.inPhotoId; })[0];
      if (p && ANALYZED.indexOf(p.analysisStatus) >= 0) {
        var sessions = readObjects('Sessions');
        var s = sessions.filter(function (x) { return x.id === c.id; })[0];
        if (s) {
          var updated = applyInAnalysis(strip_(s), analysisOf_(p), threshold);
          updated.rev = nextRev();
          upsertObjects('Sessions', [updated], sessions);
        }
      }
    }
    if (c.outPhotoId && (c.status === 'returned' || c.status === 'lost')) runCompare_(c.id, threshold);
  });
}
