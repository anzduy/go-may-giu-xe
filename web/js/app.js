// Khởi động app: đăng nhập, điều hướng giữa các màn hình, thanh số liệu trên cùng.
import * as db from './db.js';
import * as sync from './sync.js';
import { setAuth } from './api.js';
import { ctx } from './ctx.js';
import { h, uuid, hideToast, toast } from './ui.js';
import { VEHICLE_TYPES } from '../shared/pricing.js';
import * as login from './screens/login.js';
import * as checkin from './screens/checkin.js';
import * as checkout from './screens/checkout.js';
import * as lot from './screens/lot.js';
import * as sessionDetail from './screens/session-detail.js';
import * as print from './screens/print.js';
import * as shift from './screens/shift.js';
import * as admin from './screens/admin.js';
import * as alerts from './screens/alerts.js';

const ROUTES = {
  checkin: { screen: checkin, label: 'Gửi xe', gate: true },
  checkout: { screen: checkout, label: 'Trả xe', gate: true },
  lot: { screen: lot, label: 'Trong bãi' },
  shift: { screen: shift, label: 'Chốt ca' },
  alerts: { screen: alerts, label: 'Cảnh báo' },
  print: { screen: print, label: 'In phiếu', manager: true },
  admin: { screen: admin, label: 'Quản lý', manager: true },
  session: { screen: sessionDetail, hidden: true },
};

const root = document.getElementById('screen');
let cleanup = null;
let renderToken = 0;
let lastKey = null;

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
  if (!ctx.staff) {
    document.getElementById('topbar').hidden = true;
    cleanup = await login.render(root, { onLogin });
    return;
  }
  let key = (location.hash.slice(1).split('?')[0]) || (await db.getMeta('lastMode', 'checkin'));
  let r = ROUTES[key];
  if (!r || (r.manager && !ctx.isManager())) { key = 'checkin'; r = ROUTES.checkin; }
  if (r.gate) await db.setMeta('lastMode', key);
  // Đổi sang màn hình khác thì ẩn thông báo cũ; tải lại cùng màn hình (sau khi lưu) thì giữ thông báo.
  // Riêng "Không khớp" ở Trả xe → Trong bãi: giữ lời nhắc kiểm tra giấy tờ.
  if (lastKey && key !== lastKey && !(lastKey === 'checkout' && key === 'lot')) hideToast();
  lastKey = key;
  document.getElementById('topbar').hidden = false;
  renderNav(key);
  window.dispatchEvent(new CustomEvent('alerts:changed')); // cập nhật số cảnh báo trên thanh điều hướng
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
  // Ca làm việc: cùng nhân viên đăng nhập lại (lỡ thoát) thì GIỮ ca đang mở; người khác đăng nhập thì bắt đầu ca mới.
  if ((await db.getMeta('shiftStaffId')) !== staff.id || !(await db.getMeta('shiftStart'))) {
    await db.setMeta('shiftStart', ctx.nowIso());
    await db.setMeta('shiftStaffId', staff.id);
  }
  sync.start();
  const last = await db.getMeta('lastMode', 'checkin');
  if (location.hash.slice(1).split('?')[0] === last) route(); else location.hash = `#${last}`;
}

let loggingOut = false;

async function logout() {
  const me = ctx.staff;
  if (!me || loggingOut) return; // bấm Thoát 2 lần / đang thoát rồi → bỏ qua
  loggingOut = true;
  try {
    await doLogout(me);
  } finally {
    loggingOut = false;
  }
}

async function doLogout(me) {
  const pending = await db.outboxCount();
  if (pending && !confirm(`Còn ${pending} thao tác chưa gửi lên máy chủ. Vẫn thoát? (dữ liệu vẫn giữ trên máy, đăng nhập lại sẽ gửi tiếp)`)) return;
  const start = await db.getMeta('shiftStart');
  const mine = start && (await db.allSessions()).some((s) => (s.inStaffId === me.id && String(s.inAt) >= start)
    || (s.outStaffId === me.id && String(s.outAt) >= start));
  if (mine && !confirm('Bạn CHƯA CHỐT CA. Vẫn thoát? (số liệu ca vẫn được giữ — đăng nhập lại bằng tên của bạn sẽ thấy tiếp)')) return;
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
  window.addEventListener('sync:photoError', (e) => {
    const el = document.getElementById('photo-error');
    el.hidden = !e.detail;
    el.textContent = e.detail ? `⚠ Sao lưu ảnh lỗi: ${e.detail.message || e.detail.code} — báo chủ sân` : '';
  });
  window.addEventListener('sync:status', (e) => {
    const el = document.getElementById('net-status');
    el.textContent = e.detail.online ? '● Có mạng' : '○ Mất mạng — vẫn dùng bình thường';
    if (e.detail.error && e.detail.error.code === 'AUTH_REQUIRED') logout();
  });
  document.addEventListener('pointerdown', unlockAudio, { once: true });

  if ('serviceWorker' in navigator && !/[?&]nosw\b/.test(location.search)) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // Kiểm tra bản mới mỗi khi mở lại app và mỗi 30 phút.
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    }).catch(() => {});
    // Có bản mới → KHÔNG tự tải lại giữa lúc đang trả xe; hiện nút để nhân viên bấm khi rảnh.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      toast('Có bản cập nhật mới của app', { ms: 600000, actions: [{ label: '⟳ Cập nhật ngay', onClick: () => location.reload() }] });
    });
  }
  window.__gomay = { db, sync, ctx };
  alerts.initAlerts(ctx);
  housekeeping();
  route();
}

boot();
