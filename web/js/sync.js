// Đồng bộ chạy ngầm: đẩy hàng đợi thao tác lên ngay khi có, và hỏi dữ liệu mới mỗi POLL_MS.
import { POLL_MS } from '../config.js';
import { call } from './api.js';
import * as db from './db.js';
import { mergeServerSession } from '../shared/merge.js';

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
  emit('sync:pending', { count: await db.outboxCount() });
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
  }
  await db.deleteOps(done);
  const stillPending = pendingSessionIds(await db.outboxAll());
  const merged = [];
  for (const s of sessions) merged.push(mergeServerSession(await db.getSession(s.id), s, stillPending));
  if (merged.length) await db.putSessions(merged);
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
    backoff = okPush && okPull ? 0 : Math.min(MAX_BACKOFF, backoff ? backoff * 2 : 2000);
    if (okPush && okPull) lastError = null;
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
  syncNow().then(() => schedule(POLL_MS));
}

export function stop() {
  running = false;
  clearTimeout(timer);
}
