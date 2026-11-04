// Gắn kết quả đọc biển số / màu (làm trên điện thoại — web/js/plate-reader.js) vào ảnh và lượt gửi.
import * as db from './db.js';
import { analyzeBlob, supported } from './plate-reader.js';
import { applyInAnalysis } from '../shared/vision.js';

export { supported };

/**
 * Bảo đảm ảnh đã được đọc trên máy (đọc nếu chưa). Lưu vào photo.analysisLocal; với ảnh lúc vào thì gắn luôn
 * biển số + tóm tắt vào lượt gửi trên máy (xem / tìm được ngay cả khi mất mạng).
 * @returns kết quả đọc, hoặc null nếu máy không đọc được (không có model, ảnh hỏng…)
 */
export async function ensureLocalAnalysis(photoId) {
  try { return await analyzeAndStore(photoId); } catch (e) { console.warn('Lưu kết quả đọc ảnh lỗi', e); return null; }
}

async function analyzeAndStore(photoId) {
  const p = await db.getPhoto(photoId);
  if (!p) return null;
  if (p.analysisLocal) return p.analysisLocal;
  if (!p.blob) return null;
  const a = await Promise.race([analyzeBlob(p.blob), new Promise((r) => setTimeout(() => r(null), 30000))]);
  if (!a) return null;
  const fresh = await db.getPhoto(photoId);
  if (!fresh) return a;
  await db.putPhoto({ ...fresh, analysisLocal: a });
  if (p.kind === 'in' && p.sessionId) {
    const s = await db.getSession(p.sessionId);
    if (s && s.plateStatus !== 'manual' && !s.inSummary) {
      await db.putSessions([applyInAnalysis(s, a)]);
      window.dispatchEvent(new CustomEvent('sync:changed', { detail: { count: 1 } }));
    }
  }
  window.dispatchEvent(new CustomEvent('analyses:changed', { detail: { ids: [photoId] } }));
  return a;
}
