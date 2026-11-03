// Kho dữ liệu trên điện thoại (IndexedDB): lượt gửi, ảnh, hàng đợi thao tác, thông tin máy.
import { openDB } from '../vendor/idb.js';

let dbp;

export function open() {
  if (!dbp) {
    dbp = openDB('gomay', 1, {
      upgrade(db) {
        const s = db.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('byTicket', ['ticketDate', 'ticketNo']);
        s.createIndex('byStatus', 'status');
        const p = db.createObjectStore('photos', { keyPath: 'id' });
        p.createIndex('bySession', 'sessionId');
        p.createIndex('byUploadState', 'uploadState');
        const o = db.createObjectStore('outbox', { keyPath: 'opId' });
        o.createIndex('createdAt', 'createdAt');
        db.createObjectStore('meta');
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
  await Promise.all(['sessions', 'photos', 'outbox', 'meta'].map((s) => db.clear(s)));
}
