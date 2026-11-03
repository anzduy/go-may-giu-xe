// Khởi động app: đăng nhập, điều hướng giữa các màn hình, thanh số liệu trên cùng.
import * as db from './db.js';
import * as sync from './sync.js';
import { setAuth } from './api.js';
import { ctx } from './ctx.js';
import { h, uuid, hideToast } from './ui.js';
import { VEHICLE_TYPES } from '../shared/pricing.js';
import * as login from './screens/login.js';
import * as checkin from './screens/checkin.js';
import * as checkout from './screens/checkout.js';
import * as lot from './screens/lot.js';
import * as sessionDetail from './screens/session-detail.js';
import * as print from './screens/print.js';

const ROUTES = {
  checkin: { screen: checkin, label: 'Gửi xe', gate: true },
  checkout: { screen: checkout, label: 'Trả xe', gate: true },
  lot: { screen: lot, label: 'Trong bãi' },
  print: { screen: print, label: 'In phiếu', manager: true },
  session: { screen: sessionDetail, hidden: true },
};

const root = document.getElementById('screen');
let cleanup = null;
let renderToken = 0;

async function updateCounters() {
  const sessions = await db.allSessions();
  const inLot = sessions.filter((s) => s.status === 'in_lot');
  const byType = Object.keys(VEHICLE_TYPES).map((t) => [t, inLot.filter((s) => s.vehicleType === t).length]).filter(([, n]) => n);
  const detail = byType.length > 1 ? ` (${byType.map(([t, n]) => `${VEHICLE_TYPES[t]} ${n}`).join(', ')})` : '';
  document.getElementById('count-in-lot').textContent = `Trong bãi: ${inLot.length}${detail}`;
}

function renderNav(current) {
  const nav = document.getElementById('nav');
  nav.replaceChildren(
    ...Object.entries(ROUTES)
      .filter(([, r]) => !r.hidden && (!r.manager || ctx.isManager()))
      .map(([key, r]) => h('a', { href: `#${key}`, class: key === current ? 'active' : '' }, r.label)),
    h('a', { href: '#', onclick: (e) => { e.preventDefault(); logout(); } }, `Thoát (${ctx.staff ? ctx.staff.name : ''})`),
  );
}

async function route() {
  const my = ++renderToken;
  if (cleanup) { try { await cleanup(); } catch { /* bỏ qua */ } cleanup = null; }
  if (!/^#lot/.test(location.hash)) hideToast();
  if (!ctx.staff) {
    document.getElementById('topbar').hidden = true;
    cleanup = await login.render(root, { onLogin });
    return;
  }
  let key = (location.hash.slice(1).split('?')[0]) || (await db.getMeta('lastMode', 'checkin'));
  let r = ROUTES[key];
  if (!r || (r.manager && !ctx.isManager())) { key = 'checkin'; r = ROUTES.checkin; }
  if (r.gate) await db.setMeta('lastMode', key);
  document.getElementById('topbar').hidden = false;
  renderNav(key);
  root.replaceChildren();
  window.scrollTo(0, 0);
  const c = await r.screen.render(root, ctx);
  if (my !== renderToken) { if (c) c(); return; }
  cleanup = c || null;
  updateCounters();
}

async function onLogin({ token, staff, qrSecret, serverTime }) {
  ctx.staff = staff;
  ctx.qrSecret = qrSecret || '';
  ctx.clockOffset = serverTime ? Date.parse(serverTime) - Date.now() : 0;
  setAuth({ token });
  await db.setMeta('token', token);
  await db.setMeta('staff', staff);
  await db.setMeta('qrSecret', ctx.qrSecret);
  await db.setMeta('clockOffset', ctx.clockOffset);
  await db.setMeta('lastRev', 0); // lấy lại đủ dữ liệu sau khi đăng nhập
  sync.start();
  const last = await db.getMeta('lastMode', 'checkin');
  if (location.hash.slice(1).split('?')[0] === last) route(); else location.hash = `#${last}`;
}

async function logout() {
  const pending = await db.outboxCount();
  if (pending && !confirm(`Còn ${pending} thao tác chưa gửi lên máy chủ. Vẫn thoát? (dữ liệu vẫn giữ trên máy, đăng nhập lại sẽ gửi tiếp)`)) return;
  sync.stop();
  ctx.staff = null;
  setAuth({ token: null });
  await db.setMeta('token', null);
  await db.setMeta('staff', null);
  route();
}

function unlockAudio() {
  // iPhone chỉ cho phát âm thanh sau lần chạm đầu tiên → mở sẵn AudioContext.
  if (ctx.audio) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { ctx.audio = new AC(); ctx.audio.resume(); }
  } catch { /* không hỗ trợ */ }
}

/** Mỗi ngày một lần: dọn ảnh đã sao lưu > 7 ngày; cảnh báo khi bộ nhớ trình duyệt dùng > 80%. */
async function housekeeping() {
  try {
    const today = ctx.today();
    if ((await db.getMeta('lastPrune')) !== today) {
      await db.prunePhotos();
      await db.setMeta('lastPrune', today);
    }
    if (navigator.storage && navigator.storage.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const warn = document.getElementById('storage-warn');
      warn.hidden = !(quota && usage / quota > 0.8);
      warn.textContent = '⚠ Bộ nhớ máy gần đầy — mở mạng để sao lưu ảnh';
    }
  } catch { /* không quan trọng */ }
}

async function boot() {
  let deviceId = await db.getMeta('deviceId');
  if (!deviceId) { deviceId = `dev_${uuid().slice(0, 8)}`; await db.setMeta('deviceId', deviceId); }
  ctx.deviceId = deviceId;
  setAuth({ deviceId });

  const token = await db.getMeta('token');
  const staff = await db.getMeta('staff');
  if (token && staff) {
    ctx.staff = staff;
    ctx.qrSecret = await db.getMeta('qrSecret', '');
    ctx.clockOffset = await db.getMeta('clockOffset', 0);
    setAuth({ token });
    sync.start();
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('sync:changed', updateCounters);
  window.addEventListener('local:changed', updateCounters);
  window.addEventListener('sync:pending', (e) => {
    document.getElementById('count-pending').textContent = `Chờ đồng bộ: ${e.detail.count}`;
    if (e.detail.photos != null) document.getElementById('count-photos').textContent = `Ảnh chờ sao lưu: ${e.detail.photos}`;
  });
  window.addEventListener('sync:status', (e) => {
    const el = document.getElementById('net-status');
    el.textContent = e.detail.online ? '● Có mạng' : '○ Mất mạng — vẫn dùng bình thường';
    if (e.detail.error && e.detail.error.code === 'AUTH_REQUIRED') logout();
  });
  document.addEventListener('pointerdown', unlockAudio, { once: true });

  if ('serviceWorker' in navigator && !/[?&]nosw\b/.test(location.search)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.__gomay = { db, sync, ctx };
  housekeeping();
  route();
}

boot();
