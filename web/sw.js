// Service Worker: lưu giao diện để mở được app khi mất mạng.
// Chỉ xử lý yêu cầu GET cùng tên miền; yêu cầu tới Apps Script đi thẳng ra mạng.
const CACHE = 'gomay-shell-v1.0.0-6ba8ff1e2f';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'config.js',
  'css/app.css', 'css/print.css',
  'icons/icon-192.png', 'icons/icon-512.png',
  'vendor/jsQR.js', 'vendor/qrcode-generator.js', 'vendor/idb.js',
  'js/app.js', 'js/ctx.js', 'js/api.js', 'js/photo-queue.js', 'js/db.js', 'js/sync.js', 'js/camera.js', 'js/scanner.js', 'js/ui.js', 'js/print-layout.js',
  'js/screens/login.js', 'js/screens/checkin.js', 'js/screens/checkout.js', 'js/screens/lot.js',
  'js/screens/session-detail.js', 'js/screens/print.js', 'js/screens/shift.js', 'js/screens/admin.js', 'js/screens/alerts.js',
  'shared/ticket.js', 'shared/pricing.js', 'shared/sessions.js', 'shared/merge.js', 'shared/vision.js', 'shared/report.js', 'shared/compare.js', 'shared/server-ops.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // để trình duyệt tự xử lý
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })),
  );
});

// Background Sync (Chrome Android): có mạng lại thì đánh thức các trang app đang mở để tải tiếp ảnh.
// Việc tải ảnh vẫn do trang app làm (cần token đăng nhập trong IndexedDB của trang).
self.addEventListener('sync', (e) => {
  if (e.tag !== 'photos') return;
  e.waitUntil(self.clients.matchAll({ includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'sync-photos' }))));
});
