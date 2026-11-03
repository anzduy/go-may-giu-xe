import { describe, it, expect } from 'vitest';
import { run, requiredFiles, shellList } from '../../scripts/bump-sw.mjs';
import fs from 'node:fs';

describe('bộ nhớ đệm offline (Service Worker)', () => {
  it('danh sách SHELL có đủ mọi file web — thiếu file là app hỏng khi mất mạng', () => {
    const shell = shellList(fs.readFileSync('web/sw.js', 'utf8'));
    expect(requiredFiles().filter((f) => !shell.includes(f))).toEqual([]);
  });
  it('tên bộ nhớ đệm đổi theo nội dung file (điện thoại tự nhận bản mới)', () => {
    const r = run({ check: true });
    expect(r.name).toMatch(/^gomay-shell-v[\d.]+-[0-9a-f]{10}$/);
    const file = 'web/css/app.css';
    const orig = fs.readFileSync(file, 'utf8');
    try {
      fs.writeFileSync(file, `${orig}\n/* thử */\n`);
      expect(run({ check: true }).name).not.toBe(r.name);
    } finally {
      fs.writeFileSync(file, orig);
    }
    expect(run({ check: true }).name).toBe(r.name);
  });
});
