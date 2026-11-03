// Gộp web/shared/*.js thành gas/Shared.js (Apps Script không có module).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const order = ['ticket', 'pricing', 'sessions', 'vision', 'merge', 'report', 'server-ops', 'compare'];
const parts = ['// GENERATED from web/shared — do not edit', ''];

for (const name of order) {
  const file = path.join(repo, 'web', 'shared', `${name}.js`);
  if (!fs.existsSync(file)) continue; // bỏ qua file chưa có
  const src = fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*import\s/.test(line))
    .map((line) => line.replace(/^export\s+(default\s+)?/, ''))
    .join('\n');
  parts.push(`// ---- ${name}.js ----`, src.trim(), '');
}

fs.writeFileSync(path.join(repo, 'gas', 'Shared.js'), parts.join('\n'));
console.log('Đã tạo gas/Shared.js');

// File gộp DUY NHẤT để dán vào Apps Script (thay cho 11 file): gas-bundle/GoMay-GiuXe.gs
const gasFiles = ['Shared.js', ...fs.readdirSync(path.join(repo, 'gas')).filter((f) => f.endsWith('.js') && f !== 'Shared.js').sort()];
const bundle = [
  '// ===== App Giữ Xe Gò Mây Arena — máy chủ Google Apps Script (FILE GỘP, tự sinh, không sửa tay) =====',
  '// Cách dùng: dán TOÀN BỘ file này vào một file duy nhất trong Apps Script, lưu, rồi chạy hàm setup().',
  `// Nguồn: thư mục gas/ (${gasFiles.join(', ')}) — sinh bằng: npm run build:gas`,
  '',
  ...gasFiles.map((f) => `// ==================== ${f} ====================\n${fs.readFileSync(path.join(repo, 'gas', f), 'utf8').trim()}\n`),
].join('\n');
fs.mkdirSync(path.join(repo, 'gas-bundle'), { recursive: true });
fs.writeFileSync(path.join(repo, 'gas-bundle', 'GoMay-GiuXe.gs'), bundle);
fs.copyFileSync(path.join(repo, 'gas', 'appsscript.json'), path.join(repo, 'gas-bundle', 'appsscript.json'));
console.log(`Đã tạo gas-bundle/GoMay-GiuXe.gs (${gasFiles.length} file, ${Math.round(bundle.length / 1024)} KB)`);
