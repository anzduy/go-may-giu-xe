// Gọi AI đọc ảnh xe: biển số, màu xe, số mũ bảo hiểm. Cấu hình trong Script Properties:
//   VISION_PROVIDER = gemini (mặc định) | claude
//   VISION_API_KEY  = khóa API của nhà cung cấp đã chọn (bỏ trống = tắt phân tích ảnh)
//   VISION_MODEL    = (tùy chọn) ép dùng model này. Bỏ trống thì: Gemini tự chọn bản "flash" mới nhất khi Google
//                     báo model cũ không còn (404) và nhớ ở VISION_MODEL_AUTO; Claude mặc định claude-haiku-5-5
// Câu lệnh, schema và kiểm tra kết quả nằm ở web/shared/vision.js (gas/Shared.js).

var MAX_ANALYSIS_ATTEMPTS = 5;

function visionConfigured_() {
  return !!PropertiesService.getScriptProperties().getProperty('VISION_API_KEY');
}

function callGemini_(key, model, b64) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  var body = {
    contents: [{ role: 'user', parts: [{ text: visionPrompt() }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  };
  var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key },
    payload: JSON.stringify(body), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { ok: false, error: 'HTTP_' + res.getResponseCode() };
  var j = JSON.parse(res.getContentText());
  var parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts || [];
  var text = parts.map(function (p) { return p.text || ''; }).join('');
  return text ? parseVisionResponse(text) : { ok: false, error: 'EMPTY' };
}

/** Claude Messages API qua HTTP (Apps Script không có SDK). Haiku 5.5: không gửi temperature (400). */
function callClaude_(key, model, b64) {
  var body = {
    model: model,
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: VISION_SCHEMA } },
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
      { type: 'text', text: visionPrompt() },
    ] }],
  };
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2026-10-21' },
    payload: JSON.stringify(body),
  });
  if (res.getResponseCode() !== 200) return { ok: false, error: 'HTTP_' + res.getResponseCode() };
  var j = JSON.parse(res.getContentText());
  if (j.stop_reason === 'refusal') return { ok: false, error: 'REFUSAL' };
  var text = (j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  return text ? parseVisionResponse(text) : { ok: false, error: 'EMPTY' };
}

/** Gọi AI cho một ảnh (Blob) → { ok, analysis } hoặc { ok:false, error }. */
function analyzeBlob_(blob) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('VISION_API_KEY');
  if (!key) return { ok: false, error: 'DISABLED' };
  var provider = (props.getProperty('VISION_PROVIDER') || 'gemini').toLowerCase();
  var b64 = Utilities.base64Encode(blob.getBytes());
  if (provider === 'claude') return callClaude_(key, props.getProperty('VISION_MODEL') || 'claude-haiku-5-5', b64);
  var forced = props.getProperty('VISION_MODEL');
  var model = forced || props.getProperty('VISION_MODEL_AUTO') || 'gemini-2.5-flash';
  var r = callGemini_(key, model, b64);
  if (r.ok || r.error !== 'HTTP_404' || forced) return r;
  // Model đã bị Google khai tử / đổi tên → tự tìm bản flash mới nhất, nhớ lại, thử lại một lần.
  var next = discoverGeminiModel_(key);
  if (!next || next === model) return { ok: false, error: 'HTTP_404' };
  props.setProperty('VISION_MODEL_AUTO', next);
  console.log('Đổi model Gemini: ' + model + ' → ' + next);
  return callGemini_(key, next, b64);
}

/** Hỏi Google danh sách model, chọn bản "flash" mới nhất (chooseGeminiModel ở gas/Shared.js). */
function discoverGeminiModel_(key) {
  var models = [];
  var pageToken = '';
  for (var i = 0; i < 5; i++) {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    var res = UrlFetchApp.fetch(url, { method: 'get', headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) break;
    var j = JSON.parse(res.getContentText());
    models = models.concat(j.models || []);
    pageToken = j.nextPageToken || '';
    if (!pageToken) break;
  }
  return chooseGeminiModel(models);
}

/** Phân tích (ngoài khóa) rồi ghi kết quả (trong khóa ngắn). */
function analyzeAndStore_(photoRow, blob) {
  var result;
  try { result = analyzeBlob_(blob); } catch (e) { result = { ok: false, error: String(e) }; }
  storeAnalysis_(photoRow.id, result);
  return result;
}

function storeAnalysis_(photoId, result) {
  var threshold = Number(getConfig('alertThreshold', DEFAULT_THRESHOLD)) || DEFAULT_THRESHOLD;
  withLock(function () {
    var photos = readObjects('Photos');
    var found = photos.filter(function (p) { return p.id === photoId; })[0];
    if (!found) return;
    var row = strip_(found);
    var attempts = (Number(row.analysisAttempts) || 0) + 1;
    row.analysisAttempts = attempts;
    row.analyzingAt = '';
    if (!result.ok) {
      row.analysisStatus = result.error === 'DISABLED' ? 'disabled' : attempts >= MAX_ANALYSIS_ATTEMPTS ? 'gave_up' : 'failed';
      row.analysisError = String(result.error || '').slice(0, 200); // để app hiện lý do (khóa sai, hết lượt…)
      row.rev = nextRev();
      upsertObjects('Photos', [row], photos);
      return;
    }
    row.analysisError = '';
    var a = result.analysis;
    row.analysisStatus = a.status;
    row.plate = a.plate;
    row.color = a.color;
    row.vehicleTypeSeen = a.vehicleType;
    row.helmetsOnVehicle = a.helmetsOnVehicle;
    row.helmetsWorn = a.helmetsWorn;
    row.otherItems = a.otherItems;
    row.confidence = a.confidence;
    row.analyzedAt = new Date().toISOString();
    row.rev = nextRev();
    upsertObjects('Photos', [row], photos);

    if (row.kind === 'in') {
      var sessions = readObjects('Sessions');
      var s = sessions.filter(function (x) { return x.id === row.sessionId; })[0];
      if (s) {
        var updated = applyInAnalysis(strip_(s), a, threshold);
        updated.rev = nextRev();
        upsertObjects('Sessions', [updated], sessions);
      }
    }
    // Có đủ ảnh vào + ảnh ra đã phân tích → so sánh, tạo cảnh báo (gas/Alerts.js)
    runCompare_(row.sessionId, threshold);
  });
}

var AI_ERROR_VN = {
  HTTP_400: 'khóa AI sai hoặc yêu cầu lỗi', HTTP_401: 'khóa AI sai', HTTP_403: 'khóa không có quyền dùng model này',
  HTTP_404: 'không tìm thấy model', HTTP_429: 'hết lượt / vượt giới hạn gói', HTTP_500: 'máy chủ AI lỗi', HTTP_503: 'máy chủ AI quá tải',
  REFUSAL: 'AI từ chối ảnh', BAD_JSON: 'AI trả kết quả hỏng', EMPTY: 'AI không trả kết quả', EXCEPTION: 'lỗi khi gọi (hết giờ chờ / mạng)',
};

/** Có ảnh khác đang được đọc trong 3 phút qua thì bỏ qua (tránh trigger 5 phút và docLaiAnhAI đọc trùng). */
var CLAIM_MS = 3 * 60 * 1000;

/**
 * Nhận đọc một ảnh (trong khóa ngắn): đánh dấu analyzingAt để lượt chạy khác không đọc trùng.
 * @returns dòng Photos đã nhận, hoặc null nếu ảnh vừa được lượt khác nhận / đã xong.
 */
function claimPhoto_(photoId, statuses) {
  return withLock(function () {
    var all = readObjects('Photos');
    var p = all.filter(function (x) { return x.id === photoId; })[0];
    if (!p || statuses.indexOf(p.analysisStatus) < 0) return null;
    if (p.analyzingAt && Date.now() - Date.parse(p.analyzingAt) < CLAIM_MS) return null;
    var row = strip_(p);
    row.analyzingAt = new Date().toISOString();
    upsertObjects('Photos', [row], all);
    return row;
  });
}

/** Ảnh cần đọc lại (mới nhất trước). */
function photosToRetry_() {
  var cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  var recent = new Date(Date.now() - 3 * 86400000).toISOString(); // ảnh "disabled"/"gave_up" chỉ đọc lại trong 3 ngày gần nhất
  return readObjects('Photos').filter(function (p) {
    if (!p.driveFileId || String(p.uploadedAt) >= cutoff) return false;
    if (p.analysisStatus === 'failed' || p.analysisStatus === 'pending') return true;
    if (String(p.takenAt) < recent) return false;
    if (p.analysisStatus === 'disabled') return true;
    // Đã dừng thử vì lỗi CẤU HÌNH (khóa sai, model sai) — chủ sân sửa xong thì đọc lại (tối đa 10 lần mỗi ảnh)
    return p.analysisStatus === 'gave_up' && /^HTTP_40[0-4]$/.test(p.analysisError || '') && Number(p.analysisAttempts || 0) < 10;
  }).sort(function (a, b) { return String(b.takenAt).localeCompare(String(a.takenAt)); });
}

/**
 * Đọc lại tối đa `max` ảnh trong tối đa `budgetMs` (Apps Script cắt ngang sau 6 phút).
 * Gặp "hết lượt" (HTTP 429) thì dừng ngay — gọi tiếp chỉ phí lượt; lượt sau sẽ thử lại.
 * @returns {{ done:number, ok:number, errors:Object, left:number, stoppedBy: ''|'time'|'quota' }}
 *   done = số ảnh đã THỬ; ok = số ảnh đọc ĐƯỢC; errors = { mã lỗi: số ảnh }
 */
function runRetryBatch_(max, budgetMs) {
  var t0 = Date.now();
  var list = photosToRetry_();
  var done = 0;
  var ok = 0;
  var errors = {};
  var stoppedBy = '';
  for (var i = 0; i < list.length && done < max; i++) {
    if (Date.now() - t0 > budgetMs) { stoppedBy = 'time'; break; }
    var row = claimPhoto_(list[i].id, ['failed', 'pending', 'disabled', 'gave_up']);
    if (!row) continue;
    var r;
    try { r = analyzeAndStore_(row, DriveApp.getFileById(row.driveFileId).getBlob()); } catch (e) { console.error(e); r = { ok: false, error: 'EXCEPTION' }; }
    done++;
    if (r && r.ok) ok++;
    else { var code = (r && r.error) || 'UNKNOWN'; errors[code] = (errors[code] || 0) + 1; }
    if (r && r.error === 'HTTP_429') { stoppedBy = 'quota'; break; }
  }
  return { done: done, ok: ok, errors: errors, left: Math.max(0, photosToRetry_().length), stoppedBy: stoppedBy };
}

/** Trigger 5 phút: đọc lại ảnh lỗi / chưa đọc (tối đa 10 ảnh, ~2 phút mỗi lần). */
function retryFailedAnalyses() {
  if (!visionConfigured_()) return 0;
  return runRetryBatch_(10, 2 * 60 * 1000).done;
}

/**
 * Chạy tay từ trình soạn thảo Apps Script (chọn hàm docLaiAnhAI → Chạy): đọc lại bằng AI các ảnh 3 ngày gần nhất
 * chưa có kết quả (lỗi, đã dừng thử, AI chưa bật lúc chụp). Dùng sau khi sửa khóa / model AI.
 * Chạy tối đa ~4 phút rồi dừng gọn; ảnh còn lại để trigger 5 phút đọc tiếp.
 */
function docLaiAnhAI() {
  if (!visionConfigured_()) { Logger.log('Chưa có VISION_API_KEY trong Thuộc tính tập lệnh.'); return 0; }
  var recent = new Date(Date.now() - 3 * 86400000).toISOString();
  var queued = withLock(function () {
    var all = readObjects('Photos');
    var redo = all.filter(function (p) {
      return String(p.takenAt) >= recent && ['failed', 'gave_up', 'disabled', 'pending'].indexOf(p.analysisStatus) >= 0;
    }).map(function (p) {
      var r = strip_(p); r.analysisStatus = 'pending'; r.analysisAttempts = 0; r.analyzingAt = ''; r.uploadedAt = '2000-01-01T00:00:00.000Z'; return r;
    });
    if (redo.length) upsertObjects('Photos', redo, all);
    return redo.length;
  });
  Logger.log('Có ' + queued + ' ảnh cần đọc lại. Đang đọc (tối đa ~4 phút)…');
  var r = runRetryBatch_(1000, 4 * 60 * 1000);
  var why = r.stoppedBy === 'quota' ? ' Google báo HẾT LƯỢT miễn phí — app tự đọc tiếp khi có lượt.'
    : r.stoppedBy === 'time' ? ' Hết thời gian chạy — app tự đọc tiếp mỗi 5 phút.' : '';
  var errText = Object.keys(r.errors).map(function (k) { return k + ' × ' + r.errors[k] + ' (' + (AI_ERROR_VN[k] || 'lỗi khác') + ')'; }).join(', ');
  Logger.log('Đã thử ' + r.done + ' ảnh: đọc được ' + r.ok + ', lỗi ' + (r.done - r.ok) + (errText ? ' — ' + errText : '') + '. Còn ' + r.left + ' ảnh chờ.' + why);
  return r.done;
}
