// Đổi tên bộ nhớ đệm của Service Worker theo nội dung các file web, để điện thoại tự nhận bản mới (tasks.md T078).
// Đồng thời kiểm tra danh sách SHELL trong web/sw.js có ĐỦ mọi file JS/CSS — thiếu file là app hỏng khi mất mạng.
//   node scripts/bump-sw.mjs          → cập nhật web/sw.js
//   node scripts/bump-sw.mjs --check  → chỉ kiểm tra (dùng trong test), không ghi file
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

/** Các file bắt buộc phải có trong SHELL (mọi file web trừ sw.js, README và model đọc biển số — tải khi cần, xem LAZY trong sw.js). */
export function requiredFiles() {
  return walk(web).map((p) => path.relative(web, p).split(path.sep).join('/'))
    .filter((f) => f !== 'sw.js' && !/README\.md$/.test(f) && !f.startsWith('models/') && !f.startsWith('vendor/ort/')).sort();
}

export function shellList(swSource) {
  const m = /const SHELL = \[([\s\S]*?)\];/.exec(swSource);
  if (!m) throw new Error('Không tìm thấy SHELL trong web/sw.js');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).filter((f) => f !== './');
}

/** Tên bộ nhớ đệm = phiên bản app + 10 ký tự đầu SHA-256 của nội dung mọi file trong SHELL. */
export function cacheName(files, version) {
  const h = crypto.createHash('sha256');
  for (const f of [...files].sort()) h.update(f).update('\0').update(fs.readFileSync(path.join(web, f)));
  return `gomay-shell-v${version}-${h.digest('hex').slice(0, 10)}`;
}

export function run({ check = false } = {}) {
  const swFile = path.join(web, 'sw.js');
  const sw = fs.readFileSync(swFile, 'utf8');
  const shell = shellList(sw);
  const missing = requiredFiles().filter((f) => !shell.includes(f));
  const extra = shell.filter((f) => !fs.existsSync(path.join(web, f)));
  if (missing.length || extra.length) {
    throw new Error(`SHELL trong web/sw.js chưa khớp:${missing.length ? ` thiếu ${missing.join(', ')}` : ''}${extra.length ? ` · không tồn tại ${extra.join(', ')}` : ''}`);
  }
  const version = (/APP_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(web, 'config.js'), 'utf8')) || [])[1] || '0';
  const name = cacheName(shell, version);
  const next = sw.replace(/const CACHE = '[^']*';/, `const CACHE = '${name}';`);
  if (!check && next !== sw) fs.writeFileSync(swFile, next);
  return { name, files: shell.length, changed: next !== sw };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = run({ check: process.argv.includes('--check') });
    console.log(`${r.changed ? 'Đã cập nhật' : 'Giữ nguyên'} bộ nhớ đệm: ${r.name} (${r.files} file)`);
  } catch (e) {
    console.error(`✘ ${e.message}`);
    process.exit(1);
  }
}
