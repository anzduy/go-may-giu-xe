// Sửa theo phản hồi chạy thử thực tế của chủ sân (2026-11-03).
import { test, expect } from '@playwright/test';
import { createMock, login, today } from './fixtures/mock-api.js';

let mock;
test.beforeEach(async ({ context }) => {
  mock = createMock();
  await mock.attach(context);
  mock.seedBatch(today(), 1, 200);
});
const ctxOpts = { permissions: ['camera'], serviceWorkers: 'block', viewport: { width: 390, height: 844 } };

test.setTimeout(120000);
test('Ảnh lúc vào chưa sao lưu → máy cổng ra nói RÕ lý do và có nút Thử lại; sao lưu xong bấm Thử lại là thấy ảnh', async ({ browser }) => {
  const gateIn = await browser.newContext(ctxOpts);
  const gateOut = await browser.newContext(ctxOpts);
  await mock.attach(gateIn);
  await mock.attach(gateOut);
  const a = await gateIn.newPage();
  const b = await gateOut.newPage();
  await login(a, 'Tuấn', '1234');
  // Máy cổng vào: lượt gửi lên máy chủ nhưng ảnh CHƯA lên (giả lập tải ảnh lỗi).
  // Route đăng ký sau được ưu tiên → bộ chặn này chạy trước máy chủ giả, các lệnh khác chuyển tiếp (fallback).
  const failUpload = async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.action === 'uploadPhoto') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: 'Drive lỗi' } }) });
    return route.fallback();
  };
  await gateIn.route('https://mock.gomay.test/macros/s/test/exec', failUpload);
  await a.click('#capture');
  await expect(a.locator('#toast')).toContainText('phiếu 001');
  await expect(a.locator('#photo-error')).toContainText('Sao lưu ảnh lỗi', { timeout: 15000 });

  await login(b, 'Hùng', '5678');
  await b.click('#nav a[href="#checkout"]');
  await expect.poll(() => b.evaluate(async () => (await window.__gomay.db.allSessions()).length), { timeout: 10000 }).toBe(1);
  await b.fill('#typed-no', '1');
  await b.click('#find-btn');
  await expect(b.locator('.photo-reason')).toContainText('CHƯA sao lưu ảnh');

  // Máy cổng vào sao lưu được ảnh → máy cổng ra bấm Thử lại
  await gateIn.unroute('https://mock.gomay.test/macros/s/test/exec', failUpload);
  await expect.poll(() => mock.photos.size, { timeout: 70000 }).toBe(1); // máy tự thử lại (chờ tăng dần)
  await b.click('button:has-text("Thử lại")');
  await expect(b.locator('#checkout-view img.photo')).toHaveCount(1, { timeout: 10000 });
  await gateIn.close();
  await gateOut.close();
});

test('Lỡ thoát rồi đăng nhập lại (chưa chốt ca) → vẫn giữ số tiền của ca; người khác đăng nhập thì ca mới', async ({ page }) => {
  await login(page);
  for (const no of ['001', '002']) { await page.click('#capture'); await expect(page.locator('#toast')).toContainText(`phiếu ${no}`); }
  await page.click('#nav a[href="#checkout"]');
  await page.locator('#typed-no').waitFor();
  for (const no of [1, 2]) {
    await page.fill('#typed-no', String(no)); await page.click('#find-btn'); await page.click('#checkout-btn');
    await expect(page.locator('#toast')).toContainText(`Đã trả xe phiếu 00${no}`);
  }
  await expect(page.locator('#count-pending')).toHaveText('Chờ đồng bộ: 0', { timeout: 10000 });
  let warned = '';
  page.once('dialog', (d) => { warned = d.message(); d.accept(); });
  await page.click('#nav a:has-text("Thoát")');
  await page.locator('#staff-name').waitFor();
  expect(warned).toContain('CHƯA CHỐT CA');

  await login(page, 'Tuấn', '1234');
  await page.click('#nav a[href="#shift"]');
  await expect(page.locator('#shift-revenue')).toHaveText('Tiền cần nộp: 10.000đ');

  page.once('dialog', (d) => d.accept());
  await page.click('#nav a:has-text("Thoát")');
  await page.locator('#staff-name').waitFor();
  await login(page, 'Hùng', '5678');
  await page.click('#nav a[href="#shift"]');
  await expect(page.locator('#shift-revenue')).toHaveText('Tiền cần nộp: 0đ');
});

test('AI chưa bật → màn hình Cảnh báo nói rõ vì sao chưa có cảnh báo', async ({ page }) => {
  await login(page);
  await expect.poll(() => page.evaluate(() => window.__gomay.db.getMeta('visionEnabled')), { timeout: 10000 }).toBe(false);
  await page.click('#nav a[href="#alerts"]');
  await expect(page.locator('#ai-off')).toContainText('AI đọc ảnh CHƯA BẬT');
});

test('Camera tự nghỉ khi không thao tác (đỡ nóng máy); bấm CHỤP lúc camera nghỉ vẫn gửi xe được', async ({ page }) => {
  await page.addInitScript(() => { window.__gomayCamIdleMs = 1500; });
  await login(page);
  await expect(page.locator('#cam-sleep')).toBeVisible({ timeout: 6000 });
  expect(await page.evaluate(() => document.querySelector('#cam').srcObject)).toBeNull(); // camera đã tắt thật
  await page.click('#capture');
  await expect(page.locator('#toast')).toContainText('phiếu 001');
  await expect(page.locator('#cam-sleep')).toBeHidden();
  // Ẩn app (chạy nền) → camera nghỉ ngay
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('#cam-sleep')).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); });
  await page.click('#cam-sleep');
  await expect(page.locator('#cam-sleep')).toBeHidden();
});

test('Chi tiết lượt có nút lưu ảnh về điện thoại', async ({ page }) => {
  await login(page);
  await page.click('#capture');
  await expect(page.locator('#toast')).toContainText('phiếu 001');
  await expect.poll(() => mock.sessions().length).toBe(1);
  await page.goto(`/#session?id=${mock.sessions()[0].id}`);
  const dl = page.waitForEvent('download');
  await page.click('[data-save="in"]');
  expect((await dl).suggestedFilename()).toBe(`GoMay_phieu001_${today()}_vao.jpg`);
});
