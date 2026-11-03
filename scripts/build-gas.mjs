// Gộp web/shared/*.js thành gas/Shared.js (Apps Script không có module).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const order = ['ticket', 'pricing', 'sessions', 'vision', 'merge', 'server-ops', 'report', 'compare'];
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
