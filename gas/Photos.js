// Ảnh xe: lưu lên Google Drive (GoMay-GiuXe/Anh/YYYY-MM-DD/), lấy lại khi máy mất ảnh,
// rồi gọi AI phân tích (gas/Vision.js). Không gọi Drive/AI trong lúc giữ khóa (research.md R4).

function photoFolderForDay_(dayKey) {
  var root = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID'));
  var name = dayKey.slice(0, 4) + '-' + dayKey.slice(4, 6) + '-' + dayKey.slice(6, 8);
  return getOrCreateFolder_(root, name);
}

function uploadPhoto(d, auth) {
  var photoId = String(d.photoId || '');
  var kind = d.kind === 'out' ? 'out' : d.kind === 'in' ? 'in' : '';
  if (!photoId || !kind || !d.sessionId || !d.jpegBase64) throw err_('BAD_REQUEST', 'Thiếu dữ liệu ảnh');

  var existing = findBy('Photos', 'id', photoId);
  if (existing && existing.driveFileId) return { driveFileId: existing.driveFileId, duplicate: true };

  // Ngoài khóa: ghi file lên Drive.
  var session = findBy('Sessions', 'id', String(d.sessionId));
  var takenAt = String(d.takenAt || new Date().toISOString());
  var name = (session ? formatNo(session.ticketNo) : 'xxx') + '_' + kind + '_' + photoId + '.jpg';
  var blob = Utilities.newBlob(Utilities.base64Decode(String(d.jpegBase64)), 'image/jpeg', name);
  var file = photoFolderForDay_(dateKey(takenAt)).createFile(blob);

  var saved = withLock(function () {
    var rows = readObjects('Photos');
    var again = rows.filter(function (p) { return p.id === photoId; })[0];
    if (again && again.driveFileId) return { row: strip_(again), duplicate: true };
    var row = {
      id: photoId, sessionId: String(d.sessionId), kind: kind, takenAt: takenAt, deviceId: auth.deviceId,
      driveFileId: file.getId(), uploadedAt: new Date().toISOString(),
      analysisStatus: visionConfigured_() ? 'pending' : 'disabled', analysisAttempts: 0, rev: nextRev(),
    };
    upsertObjects('Photos', [row], rows);
    return { row: row, duplicate: false };
  });
  if (saved.duplicate) { file.setTrashed(true); return { driveFileId: saved.row.driveFileId, duplicate: true }; }

  // Ngoài khóa: AI phân tích. Lỗi AI không làm lỗi lệnh tải ảnh (trigger 5 phút sẽ thử lại).
  if (saved.row.analysisStatus === 'pending') {
    try { analyzeAndStore_(saved.row, blob); } catch (e) { console.error('Phân tích ảnh lỗi: ' + e); }
  }
  return { driveFileId: saved.row.driveFileId };
}

function getPhoto(d) {
  var row = findBy('Photos', 'id', String(d.photoId || ''));
  if (!row || !row.driveFileId) throw err_('PHOTO_NOT_FOUND');
  try {
    var bytes = DriveApp.getFileById(row.driveFileId).getBlob().getBytes();
    return { jpegBase64: Utilities.base64Encode(bytes), kind: row.kind, sessionId: row.sessionId, takenAt: row.takenAt };
  } catch (e) {
    throw err_('PHOTO_NOT_FOUND', 'Ảnh đã bị xóa khỏi Drive (quá 30 ngày?)');
  }
}
