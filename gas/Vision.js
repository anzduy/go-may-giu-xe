// Gọi AI đọc ảnh xe: biển số, màu xe, số mũ bảo hiểm. Cấu hình trong Script Properties:
//   VISION_PROVIDER = gemini (mặc định) | claude
//   VISION_API_KEY  = khóa API của nhà cung cấp đã chọn (bỏ trống = tắt phân tích ảnh)
//   VISION_MODEL    = (tùy chọn) mặc định gemini-2.5-flash / claude-haiku-5-5
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
  return callGemini_(key, props.getProperty('VISION_MODEL') || 'gemini-2.5-flash', b64);
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
    if (!result.ok) {
      row.analysisStatus = result.error === 'DISABLED' ? 'disabled' : attempts >= MAX_ANALYSIS_ATTEMPTS ? 'gave_up' : 'failed';
      upsertObjects('Photos', [row], photos);
      return;
    }
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
  });
}

/** Trigger 5 phút: phân tích lại ảnh lỗi/chưa phân tích (tối đa 10 ảnh mỗi lần). */
function retryFailedAnalyses() {
  if (!visionConfigured_()) return 0;
  var cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  var todo = readObjects('Photos').filter(function (p) {
    return (p.analysisStatus === 'failed' || p.analysisStatus === 'pending') && p.driveFileId && String(p.uploadedAt) < cutoff;
  }).slice(0, 10);
  todo.forEach(function (p) {
    try { analyzeAndStore_(strip_(p), DriveApp.getFileById(p.driveFileId).getBlob()); } catch (e) { console.error(e); }
  });
  return todo.length;
}
