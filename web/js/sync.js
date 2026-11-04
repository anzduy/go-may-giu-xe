// Đồng bộ chạy ngầm: đẩy hàng đợi thao tác lên ngay khi có, và hỏi dữ liệu mới mỗi POLL_MS.
import { POLL_MS } from '../config.js';
import { call } from './api.js';
import * as db from './db.js';
import { mergeServerSession } from '../shared/merge.js';
import { nextPhotoToUpload, retryDelayMs } from './photo-queue.js';
import { ensureLocalAnalysis, supported as analyzerSupported } from './analysis.js';

const MAX_BACKOFF = 60000;
let running = false;
let busy = false;
let timer = null;
let pushTimer = null;
let backoff = 0;
let lastError = null;

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function lastSyncError() {
  return lastError;
}

async function emitPending() {
  emit('sync:pending', { count: await db.outboxCount(), photos: await db.unsentPhotoCount() });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Tải ảnh lên cloud, từng ảnh một (ảnh lúc ra trước), trong tối đa `budgetMs`. */
async function uploadPhotos(budgetMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < budgetMs && navigator.onLine) {
    // Chỉ gửi ảnh khi thao tác của lượt đó (gửi xe / trả xe) ĐÃ lên máy chủ — gửi ảnh trước thì máy chủ không biết
    // gắn kết quả AI (biển số, cảnh báo) vào lượt nào.
    const waiting = pendingSessionIds(await db.outboxAll());
    const p = nextPhotoToUpload((await db.unsentPhotos()).filter((x) => !waiting.has(x.sessionId)), Date.now());
    if (!p) return true;
    let b64;
    try {
      b64 = await Promise.race([blobToBase64(p.blob), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
      if (!b64) throw new Error('empty');
    } catch {
      // Ảnh trên máy không đọc được (lỗi Safari với ảnh cũ) → đánh dấu hỏng, không thử mãi, báo cho người dùng.
      await db.putPhoto({ ...p, blob: null, uploadState: 'broken', lastError: 'LOCAL_PHOTO_BROKEN' });
      emit('sync:photoError', { code: 'LOCAL_PHOTO_BROKEN', message: 'Một ảnh trên máy bị lỗi (Safari), không sao lưu được — các ảnh mới không bị ảnh hưởng' });
      await emitPending();
      continue;
    }
    // Đọc biển số / màu trên máy trước khi gửi (nếu chưa) → máy chủ khỏi gọi AI trả phí, so sánh vào/ra được ngay.
    const analysis = analyzerSupported() ? await ensureLocalAnalysis(p.id) : null;
    await db.putPhoto({ ...((await db.getPhoto(p.id)) || p), uploadState: 'uploading', uploadingAt: Date.now() });
    const r = await call('uploadPhoto', {
      photoId: p.id, sessionId: p.sessionId, kind: p.kind, takenAt: p.takenAt, jpegBase64: b64,
      ...(analysis ? { analysis } : {}),
    }, { timeoutMs: 90000 });
    const fresh = (await db.getPhoto(p.id)) || p;
    if (r.ok) {
      await db.putPhoto({ ...fresh, uploadState: 'done', driveFileId: r.data.driveFileId, uploadedAt: new Date().toISOString(), analysisSent: !!analysis });
      emit('sync:photoError', null);
    } else {
      if (r.error.code !== 'OFFLINE') emit('sync:photoError', r.error);
      const attempts = (fresh.attempts || 0) + 1;
      await db.putPhoto({ ...fresh, uploadState: 'failed', attempts, nextAttemptAt: Date.now() + retryDelayMs(attempts), lastError: r.error.code });
      lastError = r.error;
      await emitPending();
      return false;
    }
    await emitPending();
  }
  return true;
}

function pendingSessionIds(ops) {
  const ids = new Set();
  for (const o of ops) {
    const p = o.payload || {};
    if (p.sessionId) ids.add(p.sessionId);
    if (p.id) ids.add(p.id);
  }
  return ids;
}

async function pushOnce() {
  const ops = (await db.outboxAll()).slice(0, 50);
  if (!ops.length) return true;
  const r = await call('push', { ops: ops.map(({ opId, type, payload, createdAt }) => ({ opId, type, payload, createdAt })) });
  if (!r.ok) { lastError = r.error; return false; }
  const done = [];
  const sessions = [];
  for (const res of r.data.results) {
    done.push(res.opId); // applied / duplicate / conflict / rejected đều đã được máy chủ xử lý xong
    if (res.session) sessions.push(res.status === 'rejected' ? { ...res.session, syncError: res.error } : res.session);
    if (res.shift) await db.setMeta(`shift:${res.shift.id}`, res.shift); // máy chủ xác nhận chốt ca
  }
  await db.deleteOps(done);
  const stillPending = pendingSessionIds(await db.outboxAll());
  const merged = [];
  for (const s of sessions) merged.push(mergeServerSession(await db.getSession(s.id), s, stillPending));
  if (merged.length) await db.putSessions(merged);
  if (r.data.results.some((x) => x.shift)) emit('sync:changed', { count: 0 });
  return true;
}

async function pullOnce() {
  const sinceRev = await db.getMeta('lastRev', 0);
  const r = await call('pull', { sinceRev });
  if (!r.ok) { lastError = r.error; return false; }
  const d = r.data;
  const pending = pendingSessionIds(await db.outboxAll());
  const merged = [];
  for (const s of d.sessions || []) merged.push(mergeServerSession(await db.getSession(s.id), s, pending));
  if (merged.length) await db.putSessions(merged);
  const batchesChanged = JSON.stringify(await db.getMeta('batches', [])) !== JSON.stringify(d.batches || []);
  await db.setMeta('batches', d.batches || []);
  await db.setMeta('prices', d.prices || []);
  if (d.staffNames) await db.setMeta('staffNames', d.staffNames);
  if (d.config && d.config.alertThreshold) await db.setMeta('alertThreshold', d.config.alertThreshold);
  if (d.config && typeof d.config.visionEnabled === 'boolean') await db.setMeta('visionEnabled', d.config.visionEnabled);
  if (d.analyses && d.analyses.length) {
    await db.putAnalyses(d.analyses);
    emit('analyses:changed', { ids: d.analyses.map((a) => a.id) });
  }
  if (d.alerts && d.alerts.length) {
    await db.putAlerts(d.alerts);
    emit('alerts:changed', { count: d.alerts.length });
  }
  await db.setMeta('lastRev', d.rev || 0);
  if (merged.length || batchesChanged) emit('sync:changed', { count: merged.length });
  return true;
}

/** Một vòng đồng bộ: push rồi pull. */
export async function syncNow() {
  if (busy) return;
  if (!navigator.onLine) { emit('sync:status', { online: false }); return; }
  busy = true;
  try {
    const okPush = await pushOnce();
    const okPull = okPush && (await pullOnce());
    // Ảnh chỉ tải sau khi lượt gửi đã lên máy chủ (đẩy thao tác trước).
    const okPhotos = okPush && (await uploadPhotos());
    if (okPhotos) await analyzeBacklog();
    backoff = okPush && okPull ? 0 : Math.min(MAX_BACKOFF, backoff ? backoff * 2 : 2000);
    if (okPush && okPull && okPhotos) lastError = null;
    emit('sync:status', { online: okPush && okPull, error: lastError });
  } finally {
    busy = false;
    await emitPending();
  }
}

function schedule(ms) {
  clearTimeout(timer);
  if (!running) return;
  timer = setTimeout(async () => {
    if (document.visibilityState === 'visible') await syncNow();
    schedule(backoff || POLL_MS);
  }, ms);
}

/** Gọi sau khi thêm thao tác vào hàng đợi: đẩy lên gần như ngay (gom trong 300 ms). */
export function kick() {
  emitPending();
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { if (!backoff) syncNow(); }, 300);
}

export function start() {
  if (running) return;
  running = true;
  window.addEventListener('online', () => { backoff = 0; syncNow(); });
  window.addEventListener('offline', () => emit('sync:status', { online: false }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  // Android: Background Sync đánh thức app (đang mở nền) để tải tiếp ảnh khi có mạng lại.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'sync-photos') syncNow(); });
    navigator.serviceWorker.ready.then((reg) => reg.sync && reg.sync.register('photos')).catch(() => {});
  }
  syncNow().then(() => schedule(POLL_MS));
}

export function stop() {
  running = false;
  clearTimeout(timer);
}

/**
 * Ảnh ĐÃ lên cloud nhưng máy chủ chưa có kết quả đọc (ảnh chụp trước bản này, ảnh máy khác chưa đọc được):
 * đọc trên máy này rồi báo lên (reportAnalysis). Mỗi vòng tối đa 2 ảnh cho đỡ nóng máy.
 */
async function analyzeBacklog() {
  if (!analyzerSupported()) return;
  const sessions = (await db.allSessions()).filter((s) => s.status === 'in_lot' && s.plateStatus === 'pending' && s.inPhotoId);
  let n = 0;
  for (const s of sessions) {
    if (n >= 2) break;
    const p = await db.getPhoto(s.inPhotoId);
    if (p && (p.analysisSent || p.analysisReportFailed > 4 || (p.analysisRetryAt || 0) > Date.now())) continue;
    if (p && p.uploadState && p.uploadState !== 'done') continue; // chưa lên cloud → sẽ gửi kèm lúc tải ảnh
    if (!p || !p.blob) { if (!(await db.getPhotoBlob(s.inPhotoId))) continue; }
    n++;
    const a = await ensureLocalAnalysis(s.inPhotoId);
    if (!a) { // máy chưa đọc được (đang tải bộ đọc / ảnh hỏng) → 2 phút sau thử lại, tối đa 5 lần
      const cur = await db.getPhoto(s.inPhotoId);
      if (cur) await db.putPhoto({ ...cur, analysisReportFailed: (cur.analysisReportFailed || 0) + 1, analysisRetryAt: Date.now() + 120000 });
      continue;
    }
    const r = await call('reportAnalysis', { photoId: s.inPhotoId, analysis: a });
    const cur = (await db.getPhoto(s.inPhotoId)) || {};
    await db.putPhoto({ ...cur, analysisSent: r.ok, analysisReportFailed: r.ok ? 0 : (cur.analysisReportFailed || 0) + 1 });
  }
}
