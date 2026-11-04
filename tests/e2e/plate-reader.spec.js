// Đọc biển số TRÊN TRÌNH DUYỆT (onnxruntime-web, WebAssembly) bằng ảnh xe thật ở bãi.
// Ảnh thật không đưa lên GitHub (có biển số khách) → bỏ qua nếu máy không có ảnh.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const photos = ['bike_p005', 'bike_p003'].filter((n) => fs.existsSync(`tests/fixtures/vision/anh/${n}.jpg`));

test.describe('đọc biển số trên trình duyệt', () => {
  test.skip(!photos.length, 'không có ảnh thật trong tests/fixtures/vision/anh/');
  for (const n of photos) {
    test(`${n}: onnxruntime-web đọc đúng 77-C1 399.97`, async ({ page }) => {
      await page.route('**/__fixture/*.jpg', (route) => route.fulfill({ contentType: 'image/jpeg', body: fs.readFileSync(`tests/fixtures/vision/anh/${n}.jpg`) }));
      await page.goto('/?nosw');
      const r = await page.evaluate(async () => {
        const m = await import('/js/plate-reader.js');
        const blob = await (await fetch('/__fixture/x.jpg')).blob();
        const t0 = performance.now();
        const first = await m.analyzeBlob(blob); // lần đầu: tải model
        const t1 = performance.now();
        const again = await m.analyzeBlob(blob); // lần sau: model đã sẵn
        return { first, ms1: Math.round(t1 - t0), ms2: Math.round(performance.now() - t1), again: again && again.plate };
      });
      console.log(n, JSON.stringify({ plate: r.first && r.first.plate, conf: r.first && r.first.confidence, color: r.first && r.first.color, region: r.first && r.first.region, loadMs: r.ms1, runMs: r.ms2 }));
      expect(r.first).toMatchObject({ plate: '77-C1 399.97', status: 'done', source: 'device', region: 'Vietnam' });
      expect(r.again).toBe('77-C1 399.97');
      expect(r.ms2).toBeLessThan(3000);
    });
  }
});
