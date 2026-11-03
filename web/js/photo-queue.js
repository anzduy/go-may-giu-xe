// Chọn ảnh để tải lên và ảnh được phép dọn khỏi máy. Logic thuần (có unit test).

const STUCK_MS = 2 * 60 * 1000;
const KEEP_DAYS = 7;

export function retryDelayMs(attempts) {
  return Math.min(60000, 2000 * 2 ** Math.max(0, attempts));
}

function ready(p, now) {
  if (!p.blob) return false;
  if (p.uploadState === 'pending') return true;
  if (p.uploadState === 'failed') return !p.nextAttemptAt || p.nextAttemptAt <= now;
  if (p.uploadState === 'uploading') return !p.uploadingAt || now - p.uploadingAt > STUCK_MS;
  return false;
}

/** Ảnh lúc RA trước (cần cho cảnh báo ≤ 15 giây), sau đó ảnh lúc vào cũ nhất. */
export function nextPhotoToUpload(photos, now) {
  const list = photos.filter((p) => ready(p, now));
  list.sort((a, b) => (a.kind === 'out' ? 0 : 1) - (b.kind === 'out' ? 0 : 1) || String(a.takenAt).localeCompare(String(b.takenAt)));
  return list[0] || null;
}

/** Chỉ dọn ảnh ĐÃ sao lưu xong và cũ hơn 7 ngày. Ảnh chưa sao lưu KHÔNG BAO GIỜ bị dọn (FR-025). */
export function shouldPrune(p, now, days = KEEP_DAYS) {
  return p.uploadState === 'done' && !!p.blob && now - Date.parse(p.takenAt) > days * 86400000;
}
