// Kho dữ liệu trên điện thoại (IndexedDB): lượt gửi, ảnh, hàng đợi thao tác, thông tin máy.
import { openDB } from '../vendor/idb.js';
import { call } from './api.js';
import { shouldPrune } from './photo-queue.js';

let dbp;

export function open() {
  if (!dbp) {
    dbp = openDB('gomay', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const s = db.createObjectStore('sessions', { keyPath: 'id' });
          s.createIndex('byTicket', ['ticketDate', 'ticketNo']);
          s.createIndex('byStatus', 'status');
          const p = db.createObjectStore('photos', { keyPath: 'id' });
          p.createIndex('bySession', 'sessionId');
          p.createIndex('byUploadState', 'uploadState');
          const o = db.createObjectStore('outbox', { keyPath: 'opId' });
          o.createIndex('createdAt', 'createdAt');
          db.createObjectStore('meta');
        }
        if (oldVersion < 2) db.createObjectStore('alerts', { keyPath: 'id' }); // US7: cảnh báo ảnh ra ≠ ảnh vào
      },
    });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
  return dbp;
}

export async function getMeta(key, fallback = null) {
  const v = await (await open()).get('meta', key);
  return v === undefined ? fallback : v;
}

export async function setMeta(key, value) {
  return (await open()).put('meta', value, key);
}

export async function allSessions() {
  return (await open()).getAll('sessions');
}

export async function getSession(id) {
  return (await open()).get('sessions', id);
}

export async function putSessions(list) {
  const tx = (await open()).transaction('sessions', 'readwrite');
  await Promise.all(list.map((s) => tx.store.put(s)));
  await tx.done;
}

export async function getPhoto(id) {
  return id ? (await open()).get('photos', id) : undefined;
}

export async function photosBySession(sessionId) {
  return (await open()).getAllFromIndex('photos', 'bySession', sessionId);
}

/**
 * Ghi nhiều thứ trong MỘT giao dịch (không bao giờ mất nửa chừng):
 * lượt gửi, ảnh, và thao tác chờ gửi lên máy chủ.
 */
export async function commit({ sessions = [], photos = [], ops = [] }) {
  const db = await open();
  const tx = db.transaction(['sessions', 'photos', 'outbox'], 'readwrite');
  for (const s of sessions) tx.objectStore('sessions').put(s);
  for (const p of photos) tx.objectStore('photos').put(p);
  for (const o of ops) tx.objectStore('outbox').put(o);
  await tx.done;
}

/** Gửi xe: lượt gửi + ảnh lúc vào + thao tác createSession, cùng một giao dịch. */
export function saveCheckin(session, photo, op) {
  return commit({ sessions: [session], photos: [photo], ops: [op] });
}

export async function outboxAll() {
  return (await open()).getAllFromIndex('outbox', 'createdAt');
}

export async function outboxCount() {
  return (await open()).count('outbox');
}

export async function deleteOps(opIds) {
  const tx = (await open()).transaction('outbox', 'readwrite');
  await Promise.all(opIds.map((id) => tx.store.delete(id)));
  await tx.done;
}

/** Xóa toàn bộ dữ liệu trên máy (đăng xuất hẳn). */
export async function clearAll() {
  const db = await open();
  await Promise.all(['sessions', 'photos', 'outbox', 'meta', 'alerts'].map((s) => db.clear(s)));
}

// ---------- ảnh: hàng đợi tải lên, lấy lại từ cloud, dọn ảnh cũ ----------

export async function putPhoto(photo) {
  return (await open()).put('photos', photo);
}

/** Ảnh chưa lên cloud (pending / uploading / failed) — đọc theo chỉ mục, không quét cả kho ảnh. */
export async function unsentPhotos() {
  const db = await open();
  const lists = await Promise.all(['pending', 'uploading', 'failed'].map((st) => db.getAllFromIndex('photos', 'byUploadState', st)));
  return lists.flat();
}

export async function unsentPhotoCount() {
  const db = await open();
  const counts = await Promise.all(['pending', 'uploading', 'failed'].map((st) => db.countFromIndex('photos', 'byUploadState', st)));
  return counts.reduce((a, b) => a + b, 0);
}

function base64ToBlob(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

const inflight = new Map();
let active = 0;
const waiting = [];
const MAX_PARALLEL = 3;

async function limited(fn) {
  if (active >= MAX_PARALLEL) await new Promise((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; const next = waiting.shift(); if (next) next(); }
}

/**
 * Ảnh của một lượt: có trên máy thì lấy ngay; không có (đã dọn, máy khác, máy mới) thì tải từ cloud
 * rồi lưu lại trên máy (FR-024). Trả về Blob hoặc null.
 */
export async function getPhotoBlob(photoId) {
  if (!photoId) return null;
  const local = await getPhoto(photoId);
  if (local && local.blob) return local.blob;
  if (inflight.has(photoId)) return inflight.get(photoId);
  const job = limited(async () => {
    const r = await call('getPhoto', { photoId }, { timeoutMs: 30000 });
    if (!r.ok) return null;
    const blob = base64ToBlob(r.data.jpegBase64);
    await putPhoto({ ...(local || {}), id: photoId, sessionId: (local && local.sessionId) || r.data.sessionId, kind: (local && local.kind) || r.data.kind,
      takenAt: (local && local.takenAt) || r.data.takenAt, blob, uploadState: 'done', cachedFromCloud: true });
    return blob;
  }).finally(() => inflight.delete(photoId));
  inflight.set(photoId, job);
  return job;
}

/** Dọn dữ liệu ảnh ĐÃ sao lưu và cũ hơn 7 ngày (giữ bản ghi, bỏ phần ảnh). Ảnh chưa sao lưu không bao giờ bị dọn. */
export async function prunePhotos(now = Date.now()) {
  const db = await open();
  const tx = db.transaction('photos', 'readwrite');
  let n = 0;
  let cursor = await tx.store.index('byUploadState').openCursor('done');
  while (cursor) {
    if (shouldPrune(cursor.value, now)) { await cursor.update({ ...cursor.value, blob: null, prunedAt: new Date(now).toISOString() }); n++; }
    cursor = await cursor.continue();
  }
  await tx.done;
  return n;
}

// ---------- cảnh báo (US7) ----------

export async function allAlerts() {
  return (await open()).getAll('alerts');
}

export async function putAlerts(list) {
  const tx = (await open()).transaction('alerts', 'readwrite');
  await Promise.all(list.map((a) => tx.store.put(a)));
  await tx.done;
}

/** Gắn kết quả AI (không kèm ảnh) vào bản ghi ảnh trên máy. */
export async function putAnalyses(list) {
  const tx = (await open()).transaction('photos', 'readwrite');
  for (const a of list) {
    const cur = (await tx.store.get(a.id)) || { id: a.id, sessionId: a.sessionId, kind: a.kind, uploadState: 'done', blob: null };
    await tx.store.put({ ...cur, analysis: a });
  }
  await tx.done;
}
