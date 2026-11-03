// Đo độ chính xác AI đọc ảnh xe trên bộ ảnh THẬT ở bãi (tasks.md T070; spec SC-009, SC-013, SC-014).
// Dùng đúng câu lệnh + schema + bộ kiểm tra kết quả như máy chủ (web/shared/vision.js).
//
//   VISION_PROVIDER=gemini VISION_API_KEY=... node scripts/eval-vision.mjs
//   VISION_PROVIDER=claude ANTHROPIC_API_KEY=... node scripts/eval-vision.mjs
//
// Kết quả AI được lưu vào tests/fixtures/vision/.cache.json để chạy lại (đổi ngưỡng) không tốn tiền gọi AI.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { visionPrompt, VISION_SCHEMA, parseVisionResponse } from '../web/shared/vision.js';
import { scoreEval, TARGETS } from './eval-vision-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '..', 'tests', 'fixtures', 'vision');
const labelsFile = path.join(dir, 'labels.json');
const cacheFile = path.join(dir, '.cache.json');
const provider = (process.env.VISION_PROVIDER || 'gemini').toLowerCase();

if (!fs.existsSync(labelsFile)) {
  console.log(`Chưa có ${path.relative(process.cwd(), labelsFile)}.
1. Chụp ~50 ảnh xe thật ở bãi (ngày + tối, có/không mũ, nhiều màu; có cặp vào/ra của cùng xe, và vài cặp cố tình
   bớt mũ / đổi xe khác màu), chép vào tests/fixtures/vision/anh/ (thư mục này KHÔNG đưa lên GitHub).
2. Chép labels.example.json thành labels.json và ghi đáp án đúng cho từng ảnh.
3. Chạy lại lệnh này với khóa API.`);
  process.exit(0);
}

const labels = JSON.parse(fs.readFileSync(labelsFile, 'utf8'));
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
const key = (file) => `${provider}:${process.env.VISION_MODEL || ''}:${file}`;

async function gemini(b64) {
  const model = process.env.VISION_MODEL || 'gemini-2.5-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.VISION_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: visionPrompt() }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const j = await res.json();
  return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
}

let anthropic;
async function claude(b64) {
  if (!anthropic) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropic = new Anthropic(); // đọc ANTHROPIC_API_KEY (hoặc hồ sơ `ant auth login`)
  }
  const msg = await anthropic.messages.create({
    model: process.env.VISION_MODEL || 'claude-haiku-5-5',
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: VISION_SCHEMA } },
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
      { type: 'text', text: visionPrompt() },
    ] }],
  });
  if (msg.stop_reason === 'refusal') throw new Error('Claude từ chối ảnh này');
  return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

const predictions = {};
for (const p of labels.photos) {
  if (!cache[key(p.file)]) {
    const b64 = fs.readFileSync(path.join(dir, p.file)).toString('base64');
    try {
      const text = provider === 'claude' ? await claude(b64) : await gemini(b64);
      cache[key(p.file)] = parseVisionResponse(text);
    } catch (e) {
      console.error(`Lỗi ${p.file}: ${e.message}`);
      continue;
    }
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
  }
  if (cache[key(p.file)].ok) predictions[p.file] = cache[key(p.file)].analysis;
}

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
console.log(`\nNhà cung cấp: ${provider} · ${labels.photos.length} ảnh · ${(labels.pairs || []).length} cặp vào/ra`);
console.log(`Mục tiêu: biển số ≥ ${pct(TARGETS.plateAccuracy)}, khác màu ≥ ${pct(TARGETS.colorDetect)}, thiếu mũ ≥ ${pct(TARGETS.helmetDetect)}, báo sai ≤ ${pct(TARGETS.falseAlarm)}\n`);
console.log('Ngưỡng | Biển số đúng | Phát hiện khác màu | Phát hiện thiếu mũ | Báo sai | Đạt?');
let best = null;
for (const th of [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95]) {
  const r = scoreEval(labels, predictions, th);
  console.log(`${th.toFixed(2)}   | ${pct(r.plateAccuracy).padEnd(12)} | ${pct(r.colorDetect.rate).padEnd(18)} | ${pct(r.helmetDetect.rate).padEnd(18)} | ${pct(r.falseAlarm).padEnd(7)} | ${r.pass ? '✔' : '✘'}`);
  if (r.pass && !best) best = th;
}
console.log(best ? `\n✔ Đạt mục tiêu từ ngưỡng ${best} — đặt độ nhạy này trong Quản lý → Cảnh báo.` : '\n✘ Chưa đạt mục tiêu ở ngưỡng nào — cần chỉnh câu lệnh (web/shared/vision.js) hoặc đổi model.');
process.exit(best ? 0 : 1);
