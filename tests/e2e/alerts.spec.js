import { test, expect } from '@playwright/test';
import { createMock, login, today, takeOutPhoto } from './fixtures/mock-api.js';

let mock;
const red = (helmets) => ({ plate: '', color: 'đỏ', vehicleType: 'motorbike', helmetsOnVehicle: helmets, helmetsWorn: 0, otherItems: [],
  confidence: { plate: 0, color: 0.9, helmets: 0.9 }, status: 'done' });

test.beforeEach(async ({ context }) => {
  mock = createMock();
  await mock.attach(context);
  mock.seedBatch(today(), 1, 200);
  // Giả lập AI: phiếu 001 lúc vào 2 mũ, lúc ra 1 mũ (mất mũ); phiếu 002 không đổi.
  mock.setAnalyze((photo, session) => (photo.kind === 'out' && session.ticketNo === 1 ? red(1) : red(2)));
});

async function checkinN(page, n) {
  for (let i = 1; i <= n; i++) {
    await page.click('#capture');
    await expect(page.locator('#toast')).toContainText(`phiếu ${String(i).padStart(3, '0')}`);
  }
}
async function find(page, no) {
  await page.fill('#typed-no', String(no));
  await page.click('#find-btn');
}

test('US7: thiếu mũ → thẻ cảnh báo trong 15 giây + rung; không chặn lượt sau; đóng "Có vấn đề thật"; tính vào chốt ca', async ({ page }) => {
  await page.addInitScript(() => {
    window.__vibrations = [];
    navigator.vibrate = (p) => { window.__vibrations.push(p); return true; };
  });
  await login(page);
  await checkinN(page, 2);
  await expect.poll(() => mock.photos.size, { timeout: 15000 }).toBe(2); // ảnh vào đã lên & AI đã đọc
  await page.click('#nav a[href="#checkout"]');
  await page.locator('#typed-no').waitFor();
  try {
    await expect.poll(() => page.evaluate(async () => (await window.__gomay.db.allSessions()).filter((s) => s.inSummary).length), { timeout: 20000 }).toBe(2); // chờ AI đọc ảnh vào
  } catch (e) {
    const local = await page.evaluate(async () => ({ sessions: (await window.__gomay.db.allSessions()).map((s) => [s.ticketNo, s.rev, s.inSummary]),
      lastRev: await window.__gomay.db.getMeta('lastRev'), outbox: (await window.__gomay.db.outboxAll()).map((o) => o.type), err: window.__gomay.sync.lastSyncError() }));
    console.log('DIAG', JSON.stringify({ local, server: mock.sessions().map((s) => [s.ticketNo, s.rev, s.inSummary]), pulls: mock.requests.filter((r) => r.action === 'pull').length }));
    throw e;
  }
  await find(page, 1);
  await expect(page.locator('#in-summary')).toHaveText('Xe máy màu đỏ · 2 mũ');
  await takeOutPhoto(page); // có ảnh lúc ra mới so sánh được
  await page.click('#checkout-btn');
  const t0 = Date.now();
  await expect(page.locator('#alert-float .alert-card')).toContainText('Phiếu 001: lúc vào 2 mũ, lúc ra 1 mũ', { timeout: 15000 });
  expect(Date.now() - t0).toBeLessThan(15000); // SC-012
  await expect(page.locator('#alert-float .alert-card.medium')).toBeVisible();
  await expect(page.locator('#alert-float .alert-photos img')).toHaveCount(2);
  expect(await page.evaluate(() => window.__vibrations)).toEqual([80, [300, 100, 300]]); // rung nhẹ "đã cho xe ra" rồi rung cảnh báo

  // Thẻ cảnh báo không chặn: vẫn trả xe tiếp được
  await find(page, 2);
  await takeOutPhoto(page); // có ảnh lúc ra mới so sánh được
  await page.click('#checkout-btn');
  await expect(page.locator('#checkout-done')).toContainText('Phiếu 002');
  await page.waitForTimeout(4000);
  expect(mock.alerts()).toHaveLength(1); // xe 002 không đổi → không cảnh báo

  await page.fill('#alert-float .alert-note', 'Khách báo mất mũ, đã ghi nhận');
  await page.click('#alert-float [data-resolution="real_issue"]');
  await expect(page.locator('#alert-float .alert-card')).toHaveCount(0);
  expect(mock.alerts()[0]).toMatchObject({ status: 'resolved', resolution: 'real_issue', note: 'Khách báo mất mũ, đã ghi nhận' });

  await page.click('#nav a[href="#shift"]');
  await expect(page.locator('#shift-summary')).toContainText('Cảnh báo: 1 (chưa xử lý: 0)');
});

test('US7: iPhone (không rung được) → nháy đỏ toàn màn hình; "Để sau" thu gọn, vẫn còn trong danh sách Cảnh báo', async ({ page }) => {
  await page.addInitScript(() => { try { delete Navigator.prototype.vibrate; } catch { /* bỏ qua */ } navigator.vibrate = undefined; });
  await login(page);
  await checkinN(page, 1);
  await expect.poll(() => mock.photos.size, { timeout: 15000 }).toBe(1);
  await page.click('#nav a[href="#checkout"]');
  await page.locator('#typed-no').waitFor();
  await find(page, 1);
  await takeOutPhoto(page); // có ảnh lúc ra mới so sánh được
  await page.click('#checkout-btn');
  await expect(page.locator('#alert-flash')).toBeAttached({ timeout: 15000 });
  await expect(page.locator('#alert-float .alert-card')).toBeVisible();
  await page.click('#alert-float button:has-text("Để sau")');
  await expect(page.locator('#alert-float .alert-card')).toHaveCount(0);
  await expect(page.locator('#nav a[href="#alerts"]')).toHaveText('Cảnh báo (1)');
  await page.click('#nav a[href="#alerts"]');
  await expect(page.locator('#alert-list .alert-card')).toHaveCount(1);
  await page.click('#alert-list [data-resolution="false_alarm"]');
  await expect(page.locator('#alert-list')).toContainText('Không có cảnh báo nào đang mở');
  await expect(page.locator('#nav a[href="#alerts"]')).toHaveText('Cảnh báo');
});

test('US7: quản lý chỉnh độ nhạy, xem danh sách cảnh báo, xem kết quả AI trong chi tiết lượt', async ({ page }) => {
  await login(page, 'Quản lý', '111111');
  await checkinN(page, 1);
  await expect.poll(() => mock.photos.size, { timeout: 15000 }).toBe(1);
  await page.click('#nav a[href="#checkout"]');
  await page.locator('#typed-no').waitFor();
  await find(page, 1);
  await takeOutPhoto(page); // có ảnh lúc ra mới so sánh được
  await page.click('#checkout-btn');
  await expect(page.locator('#alert-float .alert-card')).toBeVisible({ timeout: 15000 });
  await page.click('#alert-float button:has-text("Để sau")');

  await page.click('#nav a[href="#admin"]');
  await page.click('#admin-tabs [data-tab="alerts"]');
  await expect(page.locator('#admin-alert-list .item')).toHaveCount(1);
  await expect(page.locator('#alert-stats')).toContainText('1 cảnh báo · đang mở 1');
  await page.fill('#alert-threshold', '0.85');
  await expect(page.locator('#alert-threshold-label')).toContainText('chặt');
  await page.click('#alert-threshold-save');
  await expect(page.locator('#toast')).toContainText('Đã lưu độ nhạy cảnh báo');
  expect(mock.threshold()).toBe(0.85);

  await page.click('#admin-alert-list button:has-text("Xem")');
  await expect(page.locator('#analysis-card')).toContainText('Mũ trên xe: 2');
  await expect(page.locator('#analysis-card')).toContainText('Mũ trên xe: 1');
  await expect(page.locator('#analysis-card')).toContainText('lúc vào 2 mũ, lúc ra 1 mũ');
  await expect(page.locator('#analysis-card summary').first()).toContainText('Sửa tay kết quả AI');
});
